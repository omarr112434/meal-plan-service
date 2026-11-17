// What the API sends back. Stored fields like userId and version stay on the server
// (the API returns only what the frontend needs).
const { DAYS, MEALS } = require('./validation');

const MISSING_RECIPE = 'Recipe no longer in your library';

function bySlot(a, b) {
  return DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
    || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal)
    || a.addedAt.localeCompare(b.addedAt);
}

// titles: Map of recipeId -> title
function showEntry(entry, titles) {
  return {
    id: entry.id,
    recipeId: entry.recipeId,
    recipeTitle: titles.get(entry.recipeId) || MISSING_RECIPE,
    day: entry.day,
    meal: entry.meal
  };
}

function showPlan(plan, titles) {
  return {
    id: plan.id,
    weekStart: plan.weekStart,
    entries: [...plan.entries].sort(bySlot).map((entry) => showEntry(entry, titles)),
    shoppingListId: plan.shoppingListId || null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt
  };
}

function showItem(item) {
  return {
    id: item.id,
    ingredientId: item.ingredientId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    checked: item.checked,
    recipes: item.recipes || []
  };
}

function showList(list) {
  return {
    id: list.id,
    mealPlanId: list.mealPlanId,
    weekStart: list.weekStart,
    items: list.items.map(showItem),
    createdAt: list.createdAt,
    updatedAt: list.updatedAt
  };
}

module.exports = { showEntry, showPlan, showItem, showList };
