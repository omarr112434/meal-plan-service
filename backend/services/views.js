// What the API sends back. Stored fields like userId, version and the internal keys stay
// on the server (the API returns only what the frontend needs).
const { DAYS, MEALS } = require('./validation');

const MISSING_RECIPE = 'Recipe no longer in your library';

function bySlot(a, b) {
  return DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
    || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal)
    || a.addedAt.localeCompare(b.addedAt);
}

// titles: Map of recipeId -> title. A recipe deleted from the library after it was planned
// has no title any more, so the page shows it as removed.
function showEntry(entry, titles) {
  const title = titles.get(entry.recipeId);
  return {
    id: entry.id,
    recipeId: entry.recipeId,
    recipeTitle: title || MISSING_RECIPE,
    recipeMissing: !title,
    day: entry.day,
    meal: entry.meal
  };
}

function showPlan(plan, titles, { shoppingListOutOfDate = false } = {}) {
  return {
    id: plan.id,
    weekStart: plan.weekStart,
    entries: [...plan.entries].sort(bySlot).map((entry) => showEntry(entry, titles)),
    shoppingListId: plan.shoppingListId || null,
    shoppingListOutOfDate,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };
}

function showItem(item) {
  return {
    id: item.id,
    ingredientId: item.ingredientId || null,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    recipes: item.recipes || [],
    source: item.source || 'plan', // plan = from the recipes, manual = added by the user
    edited: Boolean(item.edited),
    needed: item.needed || null, // what the plan needs before the pantry is taken off
    atHome: item.atHome || null, // what the pantry already has
    covered: Boolean(item.covered) // true when the pantry has all of it
  };
}

function showList(list, { outOfDate = false } = {}) {
  return {
    id: list.id,
    mealPlanId: list.mealPlanId,
    weekStart: list.weekStart,
    items: list.items.map(showItem),
    warnings: list.warnings || [],
    outOfDate,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt
  };
}

function showPantryItem(item) {
  return { id: item.id, name: item.name, quantity: item.quantity, unit: item.unit };
}

function showPantry(pantry) {
  return {
    items: pantry ? pantry.items.map(showPantryItem) : [],
    updatedAt: pantry ? pantry.updatedAt : null
  };
}

module.exports = { showEntry, showPlan, showItem, showList, showPantryItem, showPantry };
