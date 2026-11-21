// Pantry: what the user already has at home (one pantry per user).
// The shopping list takes these amounts off, so nothing gets bought twice.
const { randomUUID } = require('crypto');
const { badRequest, notFound, conflict } = require('./errors');
const check = require('./validation');
const { nameKey } = require('./pantryMath');
const { normalizeUnit } = require('./ingredientMerge');
const { showPantry, showPantryItem } = require('./views');
const { MAX_PANTRY_ITEMS, SAVE_ATTEMPTS } = require('./limits');

function createPantryService({ store, now = () => new Date() }) {
  const timestamp = () => now().toISOString();

  // Read, change, save. The first item creates the pantry; after that the version check
  // stops two tabs from overwriting each other.
  async function changePantry(userId, change) {
    for (let attempt = 1; ; attempt += 1) {
      const existing = await store.findPantry(userId);
      const time = timestamp();
      const pantry = existing || { userId, items: [], version: 1, createdAt: time, updatedAt: time };
      const result = change(pantry);
      pantry.updatedAt = time;
      try {
        if (existing) await store.savePantry(pantry);
        else await store.createPantry(pantry);
        return result;
      } catch (error) {
        const raced = error.code === 'VERSION_CONFLICT' || error.code === 'ALREADY_EXISTS';
        if (!raced || attempt >= SAVE_ATTEMPTS) throw error;
      }
    }
  }

  function findItem(pantry, itemId) {
    const item = pantry.items.find((entry) => entry.id === itemId);
    if (!item) throw notFound('PANTRY_ITEM_NOT_FOUND', 'Pantry item not found.');
    return item;
  }

  // Same name and same kind of unit counts as the same thing ("Onions" = "onion").
  function checkNotDuplicate(pantry, fields, exceptId) {
    const same = pantry.items.find((entry) => entry.id !== exceptId
      && nameKey(entry.name) === nameKey(fields.name)
      && normalizeUnit(entry.unit) === normalizeUnit(fields.unit));
    if (same) {
      throw conflict('PANTRY_ITEM_EXISTS', `${same.name} is already in your pantry. Change its amount instead.`);
    }
  }

  // GET /api/pantry
  async function getPantry(userId) {
    return showPantry(await store.findPantry(userId));
  }

  // POST /api/pantry/items
  async function addItem(userId, body) {
    check.requireObject(body);
    const fields = check.newItem(body);
    return changePantry(userId, (pantry) => {
      if (pantry.items.length >= MAX_PANTRY_ITEMS) {
        throw badRequest(`The pantry can hold up to ${MAX_PANTRY_ITEMS} items.`);
      }
      checkNotDuplicate(pantry, fields);
      const item = { id: randomUUID(), ...fields, addedAt: timestamp() };
      pantry.items.push(item);
      return showPantryItem(item);
    });
  }

  // PATCH /api/pantry/items/{itemId}
  async function updateItem(userId, itemId, body) {
    check.requireObject(body);
    const changes = check.pantryChanges(body);
    return changePantry(userId, (pantry) => {
      const item = findItem(pantry, itemId);
      checkNotDuplicate(pantry, { ...item, ...changes }, item.id);
      Object.assign(item, changes);
      return showPantryItem(item);
    });
  }

  // DELETE /api/pantry/items/{itemId}   (used it up)
  async function removeItem(userId, itemId) {
    await changePantry(userId, (pantry) => {
      findItem(pantry, itemId);
      pantry.items = pantry.items.filter((entry) => entry.id !== itemId);
    });
  }

  return { getPantry, addItem, updateItem, removeItem };
}

module.exports = { createPantryService };
