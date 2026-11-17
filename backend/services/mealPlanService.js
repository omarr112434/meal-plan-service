// Meal plans: one plan per user per week, recipes placed in day/meal slots,
// and generating the week's shopping list from the planned recipes.
const { randomUUID } = require('crypto');
const { badRequest, notFound, conflict } = require('./errors');
const check = require('./validation');
const { weekStartOf } = require('./dates');
const { mergeIngredients } = require('./ingredientMerge');
const { showEntry, showPlan, showList } = require('./views');

const MAX_PER_SLOT = 4;
const MAX_PER_PLAN = 60;
const MAX_LIST_ITEMS = 300;
const SAVE_ATTEMPTS = 3;

function createMealPlanService({ store, recipes, now = () => new Date() }) {
  const timestamp = () => now().toISOString();

  // userId always comes from the verified token. A plan id that belongs to someone else
  // is simply not found, so the answer is the same 404 as for an id that never existed.
  async function loadPlan(userId, planId) {
    if (!check.isId(planId)) throw notFound('PLAN_NOT_FOUND', 'Meal plan not found.');
    const plan = await store.findPlanById(userId, planId);
    if (!plan) throw notFound('PLAN_NOT_FOUND', 'Meal plan not found.');
    return plan;
  }

  // Read, change, save. If another request saved the same plan in between (two tabs open),
  // the version check fails and we try again with the fresh copy.
  async function changePlan(userId, planId, change) {
    for (let attempt = 1; ; attempt += 1) {
      const plan = await loadPlan(userId, planId);
      const result = change(plan);
      plan.updatedAt = timestamp();
      try {
        const saved = await store.savePlan(plan);
        return { plan: saved, result };
      } catch (error) {
        if (error.code !== 'VERSION_CONFLICT' || attempt >= SAVE_ATTEMPTS) throw error;
      }
    }
  }

  async function recipeTitles(userId) {
    const list = await recipes.listRecipes(userId);
    return new Map(list.map((recipe) => [recipe.id, recipe.title]));
  }

  function checkSlotHasSpace(plan, day, meal, movingEntryId) {
    const inSlot = plan.entries.filter(
      (entry) => entry.day === day && entry.meal === meal && entry.id !== movingEntryId
    ).length;
    if (inSlot >= MAX_PER_SLOT) {
      throw badRequest(`This slot already has ${MAX_PER_SLOT} recipes.`);
    }
  }

  // POST /api/mealplans
  async function createPlan(userId, body) {
    check.requireObject(body);
    const weekStart = weekStartOf(body.weekStart);
    if (!weekStart) throw badRequest('weekStart must be a real date in the format YYYY-MM-DD.');

    const time = timestamp();
    const plan = {
      userId,
      weekStart,
      id: randomUUID(),
      entries: [],
      shoppingListId: null,
      version: 1,
      createdAt: time,
      updatedAt: time
    };

    try {
      await store.createPlan(plan);
    } catch (error) {
      if (error.code === 'ALREADY_EXISTS') {
        throw conflict('PLAN_EXISTS', 'You already have a plan for this week.');
      }
      throw error;
    }
    return showPlan(plan, new Map());
  }

  // GET /api/mealplans?week=YYYY-MM-DD
  async function getPlanForWeek(userId, week) {
    if (typeof week !== 'string') throw badRequest('Add ?week=YYYY-MM-DD to the URL.');
    const weekStart = weekStartOf(week);
    if (!weekStart) throw badRequest('week must be a real date in the format YYYY-MM-DD.');

    const plan = await store.findPlanByWeek(userId, weekStart);
    if (!plan) throw notFound('PLAN_NOT_FOUND', 'No meal plan for this week yet.');
    return showPlan(plan, await recipeTitles(userId));
  }

  // POST /api/mealplans/{id}/entries   (copying an entry uses this too)
  async function addEntry(userId, planId, body) {
    check.requireObject(body);
    const recipeId = check.recipeId(body.recipeId);
    const day = check.day(body.day);
    const meal = check.meal(body.meal);

    await loadPlan(userId, planId);

    // Only the user's own recipes can go in their plan (threat 6 in the proposal).
    const recipe = await recipes.getRecipe(userId, recipeId);
    if (!recipe) throw notFound('RECIPE_NOT_FOUND', 'Recipe not found in your library.');

    const { result: entry } = await changePlan(userId, planId, (plan) => {
      if (plan.entries.length >= MAX_PER_PLAN) {
        throw badRequest(`A plan can hold up to ${MAX_PER_PLAN} recipes.`);
      }
      checkSlotHasSpace(plan, day, meal);
      // id, day, meal and recipeId are set here; anything else in the body is ignored
      const newEntry = { id: randomUUID(), recipeId, day, meal, addedAt: timestamp() };
      plan.entries.push(newEntry);
      return newEntry;
    });

    return showEntry(entry, new Map([[recipe.id, recipe.title]]));
  }

  // PATCH /api/mealplans/{id}/entries/{entryId}   (move to another day or meal)
  async function moveEntry(userId, planId, entryId, body) {
    check.requireObject(body);
    const day = check.day(body.day);
    const meal = check.meal(body.meal);

    const { result: entry } = await changePlan(userId, planId, (plan) => {
      const found = plan.entries.find((item) => item.id === entryId);
      if (!found) throw notFound('ENTRY_NOT_FOUND', 'Plan entry not found.');
      if (found.day !== day || found.meal !== meal) {
        checkSlotHasSpace(plan, day, meal, found.id);
      }
      found.day = day;
      found.meal = meal;
      return found;
    });

    return showEntry(entry, await recipeTitles(userId));
  }

  // DELETE /api/mealplans/{id}/entries/{entryId}
  async function removeEntry(userId, planId, entryId) {
    await changePlan(userId, planId, (plan) => {
      const index = plan.entries.findIndex((item) => item.id === entryId);
      if (index === -1) throw notFound('ENTRY_NOT_FOUND', 'Plan entry not found.');
      plan.entries.splice(index, 1);
    });
  }

  // Replaces the items of an existing list, retrying if someone ticked an item meanwhile.
  async function replaceListItems(userId, listId, items, time) {
    for (let attempt = 1; ; attempt += 1) {
      const list = await store.findList(userId, listId);
      if (!list) return null;
      list.items = items;
      list.updatedAt = time;
      try {
        return await store.saveList(list);
      } catch (error) {
        if (error.code !== 'VERSION_CONFLICT' || attempt >= SAVE_ATTEMPTS) throw error;
      }
    }
  }

  // POST /api/mealplans/{id}/shoppinglist
  // Generating again replaces the old list (same list id, fresh items, nothing ticked).
  async function generateShoppingList(userId, planId) {
    const plan = await loadPlan(userId, planId);
    if (plan.entries.length === 0) {
      throw badRequest('Add at least one recipe to this plan first.');
    }

    const lines = [];
    const cache = new Map();
    for (const entry of plan.entries) {
      if (!cache.has(entry.recipeId)) {
        cache.set(entry.recipeId, await recipes.getRecipe(userId, entry.recipeId));
      }
      const recipe = cache.get(entry.recipeId);
      if (!recipe) continue; // recipe was deleted from the library after it was planned
      for (const ingredient of recipe.ingredients || []) {
        lines.push({ ...ingredient, recipeTitle: recipe.title });
      }
    }

    const merged = mergeIngredients(lines);
    if (merged.length > MAX_LIST_ITEMS) {
      throw badRequest('This plan has too many ingredients for one shopping list.');
    }
    const items = merged.map((item) => ({ id: randomUUID(), ...item, checked: false }));
    const time = timestamp();

    if (plan.shoppingListId) {
      const replaced = await replaceListItems(userId, plan.shoppingListId, items, time);
      if (replaced) return showList(replaced);
    }

    const list = {
      userId,
      id: randomUUID(),
      mealPlanId: plan.id,
      weekStart: plan.weekStart,
      items,
      version: 1,
      createdAt: time,
      updatedAt: time
    };
    await store.createList(list);
    await changePlan(userId, plan.id, (latest) => {
      latest.shoppingListId = list.id;
    });
    return showList(list);
  }

  return { createPlan, getPlanForWeek, addEntry, moveEntry, removeEntry, generateShoppingList };
}

module.exports = { createMealPlanService, MAX_PER_SLOT, MAX_PER_PLAN };
