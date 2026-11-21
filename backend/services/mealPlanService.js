// Meal plans: one plan per user per week, recipes placed in day/meal slots,
// and generating the week's shopping list from the planned recipes.
const { randomUUID } = require('crypto');
const { badRequest, notFound, conflict } = require('./errors');
const check = require('./validation');
const { weekStartOf } = require('./dates');
const { mergeIngredients } = require('./ingredientMerge');
const { applyPantry } = require('./pantryMath');
const { listFingerprint } = require('./listFreshness');
const { showEntry, showPlan, showList } = require('./views');
const { MAX_PER_SLOT, MAX_PER_PLAN, MAX_LIST_ITEMS, SAVE_ATTEMPTS } = require('./limits');

// Builds the new list items from a fresh calculation, keeping what the user did on the old
// list: ticks, their own edits (name, amount, unit), items they added and items they removed.
// Items are matched by key (ingredient + kind of unit), because the user may have renamed them.
function keepUserChanges(fresh, oldList) {
  const before = new Map();
  if (oldList) {
    for (const item of oldList.items) {
      if (item.source !== 'manual' && item.key) before.set(item.key, item);
    }
  }
  const hidden = new Set(oldList ? oldList.hiddenKeys || [] : []);

  const items = [];
  for (const item of fresh) {
    if (hidden.has(item.key)) continue; // the user removed it from the list before
    const old = before.get(item.key);
    const next = {
      id: old ? old.id : randomUUID(),
      source: 'plan',
      key: item.key,
      ingredientId: item.ingredientId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      recipes: item.recipes,
      needed: item.needed,
      atHome: item.atHome,
      covered: item.covered,
      checked: old ? old.checked : false,
      edited: old ? Boolean(old.edited) : false
    };
    if (old && old.edited) {
      // the user's own amount wins; "needed" still shows what the plan asks for now
      next.name = old.name;
      next.quantity = old.quantity;
      next.unit = old.unit;
    }
    items.push(next);
  }

  if (oldList) {
    for (const item of oldList.items) {
      if (item.source === 'manual') items.push(item); // things like paper towels stay
    }
  }
  return items;
}

function checkListSize(items) {
  if (items.length > MAX_LIST_ITEMS) {
    throw badRequest('This plan has too many ingredients for one shopping list.');
  }
}

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

  async function pantryItemsOf(userId) {
    const pantry = await store.findPantry(userId);
    return pantry ? pantry.items : [];
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

    const shoppingListOutOfDate = Boolean(plan.shoppingListId)
      && listFingerprint(plan, await pantryItemsOf(userId)) !== plan.listFingerprint;
    return showPlan(plan, await recipeTitles(userId), { shoppingListOutOfDate });
  }

  // DELETE /api/mealplans/{id}   (the plan's shopping list goes with it)
  async function deletePlan(userId, planId) {
    const plan = await loadPlan(userId, planId);
    if (plan.shoppingListId) await store.deleteList(userId, plan.shoppingListId);
    await store.deletePlan(userId, plan.weekStart);
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

  // Saves the regenerated items into the existing list, retrying if someone ticked an
  // item meanwhile. Returns null if the list was deleted.
  async function refreshList(userId, listId, fresh, extra) {
    for (let attempt = 1; ; attempt += 1) {
      const list = await store.findList(userId, listId);
      if (!list) return null;
      list.items = keepUserChanges(fresh, list);
      checkListSize(list.items);
      Object.assign(list, extra);
      try {
        return await store.saveList(list);
      } catch (error) {
        if (error.code !== 'VERSION_CONFLICT' || attempt >= SAVE_ATTEMPTS) throw error;
      }
    }
  }

  // POST /api/mealplans/{id}/shoppinglist
  // 1. get every planned recipe from the Recipe Library (only this user's recipes)
  // 2. add the same ingredients together and convert units (ingredientMerge.js)
  // 3. take off what is already in the pantry (pantryMath.js)
  // 4. generating again keeps ticks, edits, added and removed items (keepUserChanges)
  async function generateShoppingList(userId, planId) {
    const plan = await loadPlan(userId, planId);
    if (plan.entries.length === 0) {
      throw badRequest('Add at least one recipe to this plan first.');
    }

    const lines = [];
    const warnings = [];
    const cache = new Map();
    for (const entry of plan.entries) {
      if (!cache.has(entry.recipeId)) {
        const recipe = await recipes.getRecipe(userId, entry.recipeId);
        cache.set(entry.recipeId, recipe);
        if (!recipe) {
          warnings.push({
            code: 'RECIPE_REMOVED',
            recipeId: entry.recipeId,
            message: 'A planned recipe is no longer in your library, so it was skipped.'
          });
        } else if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
          warnings.push({
            code: 'NO_INGREDIENTS',
            recipeId: recipe.id,
            message: `${recipe.title} has no ingredients yet, so it adds nothing to the list.`
          });
        }
      }
      const recipe = cache.get(entry.recipeId);
      if (!recipe) continue;
      for (const ingredient of recipe.ingredients || []) {
        lines.push({ ...ingredient, recipeTitle: recipe.title });
      }
    }

    const pantryItems = await pantryItemsOf(userId);
    const fresh = applyPantry(mergeIngredients(lines), pantryItems);
    checkListSize(fresh);
    const time = timestamp();
    const fingerprint = listFingerprint(plan, pantryItems);

    let list = null;
    if (plan.shoppingListId) {
      list = await refreshList(userId, plan.shoppingListId, fresh, {
        warnings,
        sourceFingerprint: fingerprint,
        updatedAt: time
      });
    }
    if (!list) {
      list = {
        userId,
        id: randomUUID(),
        mealPlanId: plan.id,
        weekStart: plan.weekStart,
        items: keepUserChanges(fresh, null),
        hiddenKeys: [],
        warnings,
        sourceFingerprint: fingerprint,
        version: 1,
        createdAt: time,
        updatedAt: time
      };
      await store.createList(list);
    }

    await changePlan(userId, plan.id, (latest) => {
      latest.shoppingListId = list.id;
      latest.listFingerprint = fingerprint;
    });
    return showList(list, { outOfDate: false });
  }

  // For the Recipe Library: after a user deletes a recipe, call this so the recipe also
  // leaves their meal plans (their shopping lists then show as out of date).
  // Returns how many plan entries were removed.
  async function removeRecipeEverywhere(userId, recipeId) {
    let removed = 0;
    for (const plan of await store.listPlans(userId)) {
      if (!plan.entries.some((entry) => entry.recipeId === recipeId)) continue;
      const { result } = await changePlan(userId, plan.id, (latest) => {
        const before = latest.entries.length;
        latest.entries = latest.entries.filter((entry) => entry.recipeId !== recipeId);
        return before - latest.entries.length;
      });
      removed += result;
    }
    return removed;
  }

  return {
    createPlan,
    getPlanForWeek,
    deletePlan,
    addEntry,
    moveEntry,
    removeEntry,
    generateShoppingList,
    removeRecipeEverywhere
  };
}

module.exports = { createMealPlanService, keepUserChanges, MAX_PER_SLOT, MAX_PER_PLAN };
