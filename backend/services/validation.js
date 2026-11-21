// Server-side checks for everything the client sends. Checks in the browser are only for
// convenience; these are the ones that count (same rule as the trust boundary in Lab 3).
const { badRequest } = require('./errors');

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MEALS = ['breakfast', 'lunch', 'dinner'];

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECIPE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const UNIT_PATTERN = /^[A-Za-z ]{0,15}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key);

// Ids we create ourselves are UUIDs. Anything else can't exist, so the caller answers 404.
function isId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object.');
  }
}

function day(value) {
  if (!DAYS.includes(value)) throw badRequest(`day must be one of: ${DAYS.join(', ')}.`);
  return value;
}

function meal(value) {
  if (!MEALS.includes(value)) throw badRequest(`meal must be one of: ${MEALS.join(', ')}.`);
  return value;
}

function recipeId(value) {
  if (typeof value !== 'string' || !RECIPE_ID_PATTERN.test(value)) {
    throw badRequest('recipeId is missing or not valid.');
  }
  return value;
}

// Plain text only: this is the server half of the stored-XSS fix (threat 7 in the proposal).
// The other half is the page showing names with textContent.
function itemName(value) {
  if (typeof value !== 'string') throw badRequest('name must be text.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 60) {
    throw badRequest('name must be between 1 and 60 characters.');
  }
  if (/[<>]/.test(name) || CONTROL_CHARS.test(name)) {
    throw badRequest('name can only contain plain text (no < or >).');
  }
  return name;
}

function quantity(value) {
  if (value === null) return null; // "salt, to taste" has no amount
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 10000) {
    throw badRequest('quantity must be a number above 0 and up to 10000, or null.');
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) throw badRequest('quantity is too small.');
  return rounded;
}

function unit(value) {
  if (typeof value !== 'string' || !UNIT_PATTERN.test(value.trim())) {
    throw badRequest('unit must be up to 15 letters, or empty.');
  }
  return value.trim().toLowerCase();
}

// PATCH body for one shopping list item. Only these four fields can change;
// anything else in the body (id, ingredientId, recipes...) is ignored.
function itemChanges(body) {
  const changes = {};
  if (has(body, 'name')) changes.name = itemName(body.name);
  if (has(body, 'quantity')) changes.quantity = quantity(body.quantity);
  if (has(body, 'unit')) changes.unit = unit(body.unit);
  if (has(body, 'checked')) {
    if (typeof body.checked !== 'boolean') throw badRequest('checked must be true or false.');
    changes.checked = body.checked;
  }
  if (Object.keys(changes).length === 0) {
    throw badRequest('Send at least one of: name, quantity, unit, checked.');
  }
  return changes;
}

// POST body for a new shopping list item or pantry item. Only name is required.
function newItem(body) {
  const fields = { name: itemName(body.name), quantity: null, unit: '' };
  if (has(body, 'quantity')) fields.quantity = quantity(body.quantity);
  if (has(body, 'unit')) fields.unit = unit(body.unit);
  return fields;
}

// PATCH body for a pantry item (pantry items can't be ticked).
function pantryChanges(body) {
  const changes = {};
  if (has(body, 'name')) changes.name = itemName(body.name);
  if (has(body, 'quantity')) changes.quantity = quantity(body.quantity);
  if (has(body, 'unit')) changes.unit = unit(body.unit);
  if (Object.keys(changes).length === 0) {
    throw badRequest('Send at least one of: name, quantity, unit.');
  }
  return changes;
}

// User ids come from the login service. The admin route checks the format before using one.
const USER_ID_PATTERN = /^[A-Za-z0-9_.@-]{1,128}$/;
function userId(value) {
  if (typeof value !== 'string' || !USER_ID_PATTERN.test(value)) {
    throw badRequest('userId is not valid.');
  }
  return value;
}

module.exports = {
  DAYS,
  MEALS,
  isId,
  requireObject,
  day,
  meal,
  recipeId,
  itemName,
  quantity,
  unit,
  itemChanges,
  newItem,
  pantryChanges,
  userId
};
