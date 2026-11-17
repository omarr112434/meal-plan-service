// End-to-end tests for the Meal Plan and Shopping List API: normal, invalid and security cases.
// npm test                                                -> memory store
// TEST_DYNAMODB_ENDPOINT=http://localhost:4566 npm test   -> DynamoDB on Floci
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { tokenFor, startApi, call, createReport, describeResult, secret } = require('./helpers');
const jwt = require('jsonwebtoken');

const WEEK = '2026-11-16'; // a Monday
let api;
let report;
const omar = tokenFor('demo-user-1');
const other = tokenFor('demo-user-2');

// shared between tests (they run in order)
const ids = {};

before(async () => {
  api = await startApi();
  report = createReport(api.store.kind);
});

after(async () => {
  report.save();
  await api.stop();
});

// Runs one request, checks status (and error code), and adds a row to the test plan.
async function check(id, type, title, method, path, options, expected) {
  const result = await call(api.base, method, path, options);
  const pass = result.status === expected.status
    && (!expected.code || (result.body && result.body.error && result.body.error.code === expected.code));
  report.add({
    id,
    type,
    title,
    request: `${method} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '{id}')}`,
    expected: `${expected.status}${expected.code ? `; ${expected.code}` : ''}`,
    actual: describeResult(result),
    pass
  });
  assert.equal(result.status, expected.status, JSON.stringify(result.body));
  if (expected.code) assert.equal(result.body.error.code, expected.code);
  return result;
}

// ---------- normal cases ----------

test('T01 health check', async () => {
  await check('T01', 'Normal', 'Health check', 'GET', '/api/health', {}, { status: 200 });
});

test('T02 list my recipes (sample stand-in for the Recipe Library)', async () => {
  const result = await check('T02', 'Normal', 'List my recipes for the planner', 'GET', '/api/recipes?q=sou',
    { token: omar }, { status: 200 });
  assert.deepEqual(result.body.map((recipe) => recipe.id), ['rcp-lentil-soup']);
});

test('T03 create a plan; any date is moved to that week\'s Monday', async () => {
  const result = await check('T03', 'Normal', 'Create a weekly plan (date given is a Wednesday)', 'POST', '/api/mealplans',
    { token: omar, body: { weekStart: '2026-11-18' } }, { status: 201 });
  assert.equal(result.body.weekStart, WEEK);
  assert.deepEqual(result.body.entries, []);
  assert.equal(result.body.userId, undefined, 'userId must not be sent back');
  ids.plan = result.body.id;
});

test('T04 open the plan for a week', async () => {
  const result = await check('T04', 'Normal', 'Open the plan using any day of that week', 'GET', '/api/mealplans?week=2026-11-22',
    { token: omar }, { status: 200 });
  assert.equal(result.body.id, ids.plan);
});

test('T05 put a recipe in a day/meal slot', async () => {
  const result = await check('T05', 'Normal', 'Drag a recipe into Monday dinner', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, body: { recipeId: 'rcp-koshari', day: 'mon', meal: 'dinner' } }, { status: 201 });
  assert.equal(result.body.recipeTitle, 'Koshari');
  ids.koshari = result.body.id;

  for (const [recipeId, day, meal] of [
    ['rcp-lentil-soup', 'tue', 'lunch'],
    ['rcp-pancakes', 'sat', 'breakfast'],
    ['rcp-macarona-bechamel', 'sun', 'lunch'],
    ['rcp-greek-salad', 'wed', 'dinner']
  ]) {
    const added = await call(api.base, 'POST', `/api/mealplans/${ids.plan}/entries`, { token: omar, body: { recipeId, day, meal } });
    assert.equal(added.status, 201);
    if (recipeId === 'rcp-greek-salad') ids.salad = added.body.id;
  }
});

test('T06 copy an entry (same recipe into another slot)', async () => {
  const result = await check('T06', 'Normal', 'Copy Koshari to Thursday dinner', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, body: { recipeId: 'rcp-koshari', day: 'thu', meal: 'dinner' } }, { status: 201 });
  ids.kosharyCopy = result.body.id;
});

test('T07 move an entry to another day or meal', async () => {
  const result = await check('T07', 'Normal', 'Move the copy to Friday lunch', 'PATCH',
    `/api/mealplans/${ids.plan}/entries/${ids.kosharyCopy}`,
    { token: omar, body: { day: 'fri', meal: 'lunch' } }, { status: 200 });
  assert.equal(result.body.day, 'fri');
  assert.equal(result.body.meal, 'lunch');
});

test('T08 remove an entry', async () => {
  await check('T08', 'Normal', 'Remove Greek salad from the plan', 'DELETE',
    `/api/mealplans/${ids.plan}/entries/${ids.salad}`, { token: omar }, { status: 204 });
  const plan = await call(api.base, 'GET', `/api/mealplans?week=${WEEK}`, { token: omar });
  assert.equal(plan.body.entries.length, 5);
  assert.ok(!plan.body.entries.some((entry) => entry.recipeId === 'rcp-greek-salad'));
  // entries come back in day and meal order
  assert.deepEqual(plan.body.entries.map((entry) => entry.day), ['mon', 'tue', 'fri', 'sat', 'sun']);
});

test('T09 generate the consolidated shopping list', async () => {
  const result = await check('T09', 'Normal', 'Generate the week\'s shopping list', 'POST',
    `/api/mealplans/${ids.plan}/shoppinglist`, { token: omar }, { status: 201 });
  const item = (name) => result.body.items.find((entry) => entry.name === name);

  // Koshari twice (2 onions each) + lentil soup (1) + bechamel (1)
  assert.equal(item('Onion').quantity, 6);
  // 1 l (bechamel) + 300 ml (pancakes) = 1.3 l
  assert.deepEqual([item('Milk').quantity, item('Milk').unit], [1.3, 'l']);
  // same unit stays as it is: 4 + 4 (koshari x2) + 2 (soup) = 10 tbsp
  assert.deepEqual([item('Vegetable oil').quantity, item('Vegetable oil').unit], [10, 'tbsp']);
  assert.equal(item('Salt').quantity, null);
  assert.ok(result.body.items.every((entry) => entry.checked === false));
  assert.deepEqual(item('Milk').recipes.sort(), ['Macarona bechamel', 'Pancakes']);
  ids.list = result.body.id;
  ids.milk = item('Milk').id;
  ids.onion = item('Onion').id;
});

test('T10 open the shopping list (and the plan links to it)', async () => {
  const result = await check('T10', 'Normal', 'Open the shopping list', 'GET', `/api/shoppinglists/${ids.list}`,
    { token: omar }, { status: 200 });
  assert.equal(result.body.weekStart, WEEK);
  const plan = await call(api.base, 'GET', `/api/mealplans?week=${WEEK}`, { token: omar });
  assert.equal(plan.body.shoppingListId, ids.list);
});

test('T11 tick an item off', async () => {
  const result = await check('T11', 'Normal', 'Tick off milk', 'PATCH', `/api/shoppinglists/${ids.list}/items/${ids.milk}`,
    { token: omar, body: { checked: true } }, { status: 200 });
  assert.equal(result.body.checked, true);
});

test('T12 edit an item', async () => {
  const result = await check('T12', 'Normal', 'Edit onion to 4 (already have some)', 'PATCH',
    `/api/shoppinglists/${ids.list}/items/${ids.onion}`,
    { token: omar, body: { name: 'Red onion', quantity: 4, unit: '' } }, { status: 200 });
  assert.deepEqual([result.body.name, result.body.quantity], ['Red onion', 4]);
});

test('T13 generating again replaces the list (same id, nothing ticked)', async () => {
  const result = await check('T13', 'Normal', 'Generate the list again', 'POST', `/api/mealplans/${ids.plan}/shoppinglist`,
    { token: omar }, { status: 201 });
  assert.equal(result.body.id, ids.list);
  assert.ok(result.body.items.every((entry) => entry.checked === false));
  ids.milk = result.body.items.find((entry) => entry.name === 'Milk').id;
});

// ---------- invalid cases ----------

test('T14 date that does not exist', async () => {
  await check('T14', 'Invalid', 'Create a plan for 30 February', 'POST', '/api/mealplans',
    { token: omar, body: { weekStart: '2026-02-30' } }, { status: 400, code: 'VALIDATION_ERROR' });
});

test('T15 second plan for the same week', async () => {
  await check('T15', 'Invalid', 'Create a plan for a week that already has one', 'POST', '/api/mealplans',
    { token: omar, body: { weekStart: '2026-11-21' } }, { status: 409, code: 'PLAN_EXISTS' });
});

test('T16 week parameter missing or wrong', async () => {
  await check('T16', 'Invalid', 'Open a plan with ?week=next-week', 'GET', '/api/mealplans?week=next-week',
    { token: omar }, { status: 400, code: 'VALIDATION_ERROR' });
  const missing = await call(api.base, 'GET', '/api/mealplans', { token: omar });
  assert.equal(missing.status, 400);
});

test('T17 week with no plan yet', async () => {
  await check('T17', 'Invalid', 'Open a week that has no plan', 'GET', '/api/mealplans?week=2027-01-04',
    { token: omar }, { status: 404, code: 'PLAN_NOT_FOUND' });
});

test('T18 day or meal not allowed', async () => {
  await check('T18', 'Invalid', 'Add a recipe on day "funday"', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, body: { recipeId: 'rcp-shakshuka', day: 'funday', meal: 'lunch' } }, { status: 400, code: 'VALIDATION_ERROR' });
  const brunch = await call(api.base, 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, body: { recipeId: 'rcp-shakshuka', day: 'mon', meal: 'brunch' } });
  assert.equal(brunch.status, 400);
});

test('T19 slot already full', async () => {
  for (let i = 0; i < 4; i += 1) {
    const added = await call(api.base, 'POST', `/api/mealplans/${ids.plan}/entries`,
      { token: omar, body: { recipeId: 'rcp-shakshuka', day: 'wed', meal: 'breakfast' } });
    assert.equal(added.status, 201);
  }
  await check('T19', 'Invalid', 'Add a 5th recipe to the same slot', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, body: { recipeId: 'rcp-shakshuka', day: 'wed', meal: 'breakfast' } }, { status: 400, code: 'VALIDATION_ERROR' });
});

test('T20 body that is not JSON', async () => {
  await check('T20', 'Invalid', 'Add an entry with Content-Type text/plain', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, raw: 'recipeId=rcp-koshari', contentType: 'text/plain' }, { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
});

test('T21 malformed JSON', async () => {
  await check('T21', 'Invalid', 'Add an entry with a trailing comma in the JSON', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, raw: '{"recipeId":"rcp-koshari","day":"mon",}' }, { status: 400, code: 'VALIDATION_ERROR' });
  const health = await call(api.base, 'GET', '/api/health');
  assert.equal(health.status, 200, 'server keeps running');
});

test('T22 entry that does not exist', async () => {
  await check('T22', 'Invalid', 'Move an entry id that does not exist', 'PATCH',
    `/api/mealplans/${ids.plan}/entries/00000000-0000-4000-8000-000000000000`,
    { token: omar, body: { day: 'mon', meal: 'lunch' } }, { status: 404, code: 'ENTRY_NOT_FOUND' });
});

test('T23 bad quantity', async () => {
  await check('T23', 'Invalid', 'Set an item quantity to -2', 'PATCH', `/api/shoppinglists/${ids.list}/items/${ids.milk}`,
    { token: omar, body: { quantity: -2 } }, { status: 400, code: 'VALIDATION_ERROR' });
  const text = await call(api.base, 'PATCH', `/api/shoppinglists/${ids.list}/items/${ids.milk}`,
    { token: omar, body: { quantity: 'lots' } });
  assert.equal(text.status, 400);
});

test('T24 empty item edit', async () => {
  await check('T24', 'Invalid', 'Edit an item with an empty body {}', 'PATCH', `/api/shoppinglists/${ids.list}/items/${ids.milk}`,
    { token: omar, body: {} }, { status: 400, code: 'VALIDATION_ERROR' });
});

test('T25 shopping list for an empty plan', async () => {
  const empty = await call(api.base, 'POST', '/api/mealplans', { token: omar, body: { weekStart: '2026-11-23' } });
  await check('T25', 'Invalid', 'Generate a list for a plan with no recipes', 'POST', `/api/mealplans/${empty.body.id}/shoppinglist`,
    { token: omar }, { status: 400, code: 'VALIDATION_ERROR' });
});

test('T26 unknown route', async () => {
  await check('T26', 'Invalid', 'Unknown route', 'PATCH', '/api/fake-url', {}, { status: 404, code: 'ROUTE_NOT_FOUND' });
});

// ---------- security cases ----------

test('T27 no token', async () => {
  await check('T27', 'Security', 'Open a plan without logging in', 'GET', `/api/mealplans?week=${WEEK}`,
    {}, { status: 401, code: 'UNAUTHORIZED' });
});

test('T28 expired token', async () => {
  const expired = jwt.sign({ role: 'user', exp: Math.floor(Date.now() / 1000) - 60 }, secret, { subject: 'demo-user-1', algorithm: 'HS256' });
  await check('T28', 'Security', 'Use an expired token', 'GET', `/api/mealplans?week=${WEEK}`,
    { token: expired }, { status: 401, code: 'UNAUTHORIZED' });
});

test('T29 token signed with another secret', async () => {
  const forged = jwt.sign({ role: 'admin' }, 'some-other-secret-that-the-attacker-made-up-123', { subject: 'demo-user-1', expiresIn: '1h' });
  await check('T29', 'Security', 'Use a token signed with a made-up secret', 'GET', `/api/mealplans?week=${WEEK}`,
    { token: forged }, { status: 401, code: 'UNAUTHORIZED' });
});

test('T30 unsigned token (alg none)', async () => {
  const encode = (part) => Buffer.from(JSON.stringify(part)).toString('base64url');
  const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'demo-user-1', role: 'admin', exp: 9999999999 })}.`;
  await check('T30', 'Security', 'Use an unsigned token ("alg": "none")', 'GET', `/api/mealplans?week=${WEEK}`,
    { token: unsigned }, { status: 401, code: 'UNAUTHORIZED' });
});

test('T31 token with a role we do not know', async () => {
  const weird = tokenFor('demo-user-1', 'superuser');
  await check('T31', 'Security', 'Use a token with role "superuser"', 'GET', `/api/mealplans?week=${WEEK}`,
    { token: weird }, { status: 401, code: 'UNAUTHORIZED' });
});

test('T32 another user tries to use my plan id (IDOR)', async () => {
  await check('T32', 'Security', 'User 2 adds an entry to user 1\'s plan', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: other, body: { recipeId: 'rcp-ful-medames', day: 'mon', meal: 'breakfast' } }, { status: 404, code: 'PLAN_NOT_FOUND' });
  const remove = await call(api.base, 'DELETE', `/api/mealplans/${ids.plan}/entries/${ids.koshari}`, { token: other });
  assert.equal(remove.status, 404);
  const generate = await call(api.base, 'POST', `/api/mealplans/${ids.plan}/shoppinglist`, { token: other });
  assert.equal(generate.status, 404);
});

test('T33 another user opens my shopping list (IDOR)', async () => {
  await check('T33', 'Security', 'User 2 opens user 1\'s shopping list', 'GET', `/api/shoppinglists/${ids.list}`,
    { token: other }, { status: 404, code: 'LIST_NOT_FOUND' });
});

test('T34 another user ticks my items (IDOR)', async () => {
  await check('T34', 'Security', 'User 2 edits an item in user 1\'s list', 'PATCH', `/api/shoppinglists/${ids.list}/items/${ids.milk}`,
    { token: other, body: { checked: true } }, { status: 404, code: 'LIST_NOT_FOUND' });
});

test('T35 another user only sees their own week', async () => {
  await check('T35', 'Security', 'User 2 opens the same week', 'GET', `/api/mealplans?week=${WEEK}`,
    { token: other }, { status: 404, code: 'PLAN_NOT_FOUND' });
});

test('T36 using a recipe id that belongs to someone else', async () => {
  await check('T36', 'Security', 'User 1 adds user 2\'s recipe to their plan', 'POST', `/api/mealplans/${ids.plan}/entries`,
    { token: omar, body: { recipeId: 'rcp-ful-medames', day: 'mon', meal: 'breakfast' } }, { status: 404, code: 'RECIPE_NOT_FOUND' });
});

test('T37 client tries to set server-owned fields', async () => {
  const result = await check('T37', 'Security', 'Create a plan with userId and id in the body', 'POST', '/api/mealplans',
    { token: omar, body: { weekStart: '2026-12-07', userId: 'demo-user-2', id: 'HACKED-1', entries: [{ recipeId: 'x' }] } },
    { status: 201 });
  assert.notEqual(result.body.id, 'HACKED-1');
  assert.deepEqual(result.body.entries, []);
  const otherUser = await call(api.base, 'GET', '/api/mealplans?week=2026-12-07', { token: other });
  assert.equal(otherUser.status, 404, 'the plan belongs to the token user, not the userId in the body');
});

test('T38 script in an item name (stored XSS)', async () => {
  await check('T38', 'Security', 'Rename an item to <script>alert(1)</script>', 'PATCH',
    `/api/shoppinglists/${ids.list}/items/${ids.milk}`,
    { token: omar, body: { name: '<script>alert(1)</script>' } }, { status: 400, code: 'VALIDATION_ERROR' });
});

test('T39 CORS only allows our frontend', async () => {
  const evil = await call(api.base, 'GET', '/api/health', { headers: { Origin: 'http://evil.example' } });
  const ours = await call(api.base, 'GET', '/api/health', { headers: { Origin: 'http://localhost:8080' } });
  const pass = evil.headers.get('access-control-allow-origin') === null
    && ours.headers.get('access-control-allow-origin') === 'http://localhost:8080';
  report.add({
    id: 'T39',
    type: 'Security',
    title: 'Browser request from another website',
    request: 'GET /api/health with Origin: http://evil.example',
    expected: 'no Access-Control-Allow-Origin header',
    actual: evil.headers.get('access-control-allow-origin') === null ? 'no Access-Control-Allow-Origin header' : 'header present',
    pass
  });
  assert.ok(pass);
});

test('T40 errors never show internal details', async () => {
  const result = await check('T40', 'Security', 'Body that is a JSON array instead of an object', 'POST', '/api/mealplans',
    { token: omar, raw: '[1,2,3]' }, { status: 400, code: 'VALIDATION_ERROR' });
  assert.ok(!JSON.stringify(result.body).includes('at '), 'no stack trace in the response');
  assert.equal(result.headers.get('x-powered-by'), null);
});
