// Service-level tests with a recipe library we control, for the cases the Phase 1 feedback
// asked about: a planned recipe deleted from the library, and a recipe with no ingredients.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const memoryStore = require('../storage/memoryStore');
const { createMealPlanService } = require('../services/mealPlanService');
const { createShoppingListService } = require('../services/shoppingListService');

function fakeLibrary() {
  const recipes = new Map([
    ['rcp-soup', { id: 'rcp-soup', title: 'Soup', ingredients: [{ ingredientId: 'ing-onion', name: 'Onion', quantity: 1, unit: '' }] }],
    ['rcp-toast', { id: 'rcp-toast', title: 'Toast', ingredients: [] }],
    ['rcp-salad', { id: 'rcp-salad', title: 'Salad', ingredients: [{ ingredientId: 'ing-onion', name: 'Onion', quantity: 2, unit: '' }] }]
  ]);
  return {
    kind: 'fake',
    delete: (id) => recipes.delete(id),
    async listRecipes() {
      return [...recipes.values()].map(({ id, title }) => ({ id, title, tags: [] }));
    },
    async getRecipe(userId, recipeId) {
      return recipes.has(recipeId) ? structuredClone(recipes.get(recipeId)) : null;
    }
  };
}

async function setUp() {
  const store = memoryStore.create();
  const library = fakeLibrary();
  const plans = createMealPlanService({ store, recipes: library });
  const lists = createShoppingListService({ store });
  const plan = await plans.createPlan('u1', { weekStart: '2026-11-16' });
  for (const [recipeId, day] of [['rcp-soup', 'mon'], ['rcp-toast', 'tue'], ['rcp-salad', 'wed']]) {
    await plans.addEntry('u1', plan.id, { recipeId, day, meal: 'dinner' });
  }
  return { store, library, plans, lists, plan };
}

test('a recipe deleted from the library is shown as removed and skipped, with a warning', async () => {
  const { library, plans, plan } = await setUp();
  library.delete('rcp-salad');

  const week = await plans.getPlanForWeek('u1', '2026-11-16');
  const salad = week.entries.find((entry) => entry.recipeId === 'rcp-salad');
  assert.equal(salad.recipeMissing, true);

  const list = await plans.generateShoppingList('u1', plan.id);
  assert.equal(list.items.find((entry) => entry.name === 'Onion').quantity, 1, 'only the soup\'s onion');
  assert.deepEqual(list.warnings.map((warning) => warning.code).sort(), ['NO_INGREDIENTS', 'RECIPE_REMOVED']);
});

test('removeRecipeEverywhere takes a deleted recipe out of the plans and the list becomes out of date', async () => {
  const { library, plans, lists, plan } = await setUp();
  const first = await plans.generateShoppingList('u1', plan.id);
  assert.equal((await lists.getList('u1', first.id)).outOfDate, false);

  library.delete('rcp-salad');
  assert.equal(await plans.removeRecipeEverywhere('u1', 'rcp-salad'), 1);

  const week = await plans.getPlanForWeek('u1', '2026-11-16');
  assert.ok(!week.entries.some((entry) => entry.recipeId === 'rcp-salad'));
  assert.equal(week.shoppingListOutOfDate, true);
  assert.equal((await lists.getList('u1', first.id)).outOfDate, true);
});

test('regenerating after a plan change keeps ticks on items that are still needed', async () => {
  const { plans, lists, plan } = await setUp();
  const first = await plans.generateShoppingList('u1', plan.id);
  const onion = first.items.find((entry) => entry.name === 'Onion');
  await lists.updateItem('u1', first.id, onion.id, { checked: true });

  await plans.addEntry('u1', plan.id, { recipeId: 'rcp-soup', day: 'thu', meal: 'lunch' });
  const second = await plans.generateShoppingList('u1', plan.id);
  const again = second.items.find((entry) => entry.name === 'Onion');
  assert.deepEqual([again.id, again.checked, again.quantity], [onion.id, true, 4]);
});
