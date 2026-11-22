// Optimistic locking (threat: lost updates). Two browser tabs read the same record, both change it,
// both save: the second save must be refused instead of silently wiping out the first change.
// Runs on the memory store, and on DynamoDB when TEST_DYNAMODB_ENDPOINT is set (npm run test:floci).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeStore } = require('./helpers');

const time = '2026-11-16T10:00:00.000Z';

test('a save made from an old read is refused in every table (no lost updates)', async (t) => {
  const store = await makeStore();
  t.after(() => (store.cleanUp ? store.cleanUp() : undefined));

  // plans
  await store.createPlan({ id: 'plan-1', userId: 'u1', weekStart: '2026-11-16', entries: [], shoppingListId: null, version: 1, createdAt: time, updatedAt: time });
  const planTabA = await store.findPlanByWeek('u1', '2026-11-16');
  const planTabB = await store.findPlanByWeek('u1', '2026-11-16');
  await store.savePlan({ ...planTabA, entries: [{ id: 'e1', recipeId: 'rcp-koshari', day: 'mon', meal: 'dinner' }] });
  await assert.rejects(store.savePlan({ ...planTabB, entries: [] }), { code: 'VERSION_CONFLICT' });
  const plan = await store.findPlanByWeek('u1', '2026-11-16');
  assert.deepEqual([plan.entries.length, plan.version], [1, 2]);

  // shopping lists
  await store.createList({ id: 'list-1', userId: 'u1', mealPlanId: 'plan-1', weekStart: '2026-11-16', items: [], version: 1, createdAt: time, updatedAt: time });
  const listTabA = await store.findList('u1', 'list-1');
  const listTabB = await store.findList('u1', 'list-1');
  await store.saveList({ ...listTabA, items: [{ id: 'i1', name: 'Onion', quantity: 3, unit: '', checked: true }] });
  await assert.rejects(store.saveList({ ...listTabB, items: [] }), { code: 'VERSION_CONFLICT' });
  assert.equal((await store.findList('u1', 'list-1')).items[0].checked, true);

  // pantry
  await store.createPantry({ userId: 'u1', items: [], version: 1, createdAt: time, updatedAt: time });
  const pantryTabA = await store.findPantry('u1');
  const pantryTabB = await store.findPantry('u1');
  await store.savePantry({ ...pantryTabA, items: [{ id: 'p1', name: 'Rice', quantity: 1, unit: 'kg' }] });
  await assert.rejects(store.savePantry({ ...pantryTabB, items: [] }), { code: 'VERSION_CONFLICT' });
  assert.equal((await store.findPantry('u1')).items.length, 1);
});
