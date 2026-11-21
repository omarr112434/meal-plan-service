// Shopping lists: open a list, add or remove items, edit an item, tick it off.
// Lists are created by mealPlanService.generateShoppingList.
const { randomUUID } = require('crypto');
const { badRequest, notFound } = require('./errors');
const check = require('./validation');
const { listFingerprint } = require('./listFreshness');
const { showItem, showList } = require('./views');
const { MAX_LIST_ITEMS, SAVE_ATTEMPTS } = require('./limits');

function createShoppingListService({ store, now = () => new Date() }) {
  async function loadList(userId, listId) {
    if (!check.isId(listId)) throw notFound('LIST_NOT_FOUND', 'Shopping list not found.');
    // lists are stored under the owner's userId, so another user's list id finds nothing
    const list = await store.findList(userId, listId);
    if (!list) throw notFound('LIST_NOT_FOUND', 'Shopping list not found.');
    return list;
  }

  // The list is out of date when the plan's recipes or the pantry changed after it was made.
  async function isOutOfDate(userId, list) {
    const plan = await store.findPlanById(userId, list.mealPlanId);
    if (!plan) return false;
    const pantry = await store.findPantry(userId);
    return listFingerprint(plan, pantry ? pantry.items : []) !== list.sourceFingerprint;
  }

  // Read, change, save, with the same version check as the plans.
  async function changeList(userId, listId, change) {
    for (let attempt = 1; ; attempt += 1) {
      const list = await loadList(userId, listId);
      const result = change(list);
      list.updatedAt = now().toISOString();
      try {
        await store.saveList(list);
        return result;
      } catch (error) {
        if (error.code !== 'VERSION_CONFLICT' || attempt >= SAVE_ATTEMPTS) throw error;
      }
    }
  }

  function findItem(list, itemId) {
    const item = list.items.find((entry) => entry.id === itemId);
    if (!item) throw notFound('ITEM_NOT_FOUND', 'Shopping list item not found.');
    return item;
  }

  // GET /api/shoppinglists/{id}
  async function getList(userId, listId) {
    const list = await loadList(userId, listId);
    return showList(list, { outOfDate: await isOutOfDate(userId, list) });
  }

  // PATCH /api/shoppinglists/{id}/items/{itemId}
  async function updateItem(userId, listId, itemId, body) {
    check.requireObject(body);
    const changes = check.itemChanges(body);
    return changeList(userId, listId, (list) => {
      const item = findItem(list, itemId);
      Object.assign(item, changes);
      // a changed name or amount is the user's choice: generating again keeps it
      if ('name' in changes || 'quantity' in changes || 'unit' in changes) item.edited = true;
      return showItem(item);
    });
  }

  // POST /api/shoppinglists/{id}/items   (something that is in no recipe, like paper towels)
  async function addItem(userId, listId, body) {
    check.requireObject(body);
    const fields = check.newItem(body);
    return changeList(userId, listId, (list) => {
      if (list.items.length >= MAX_LIST_ITEMS) {
        throw badRequest(`A shopping list can hold up to ${MAX_LIST_ITEMS} items.`);
      }
      const item = {
        id: randomUUID(),
        source: 'manual',
        key: null,
        ingredientId: null,
        ...fields,
        recipes: [],
        checked: false,
        edited: false,
        needed: null,
        atHome: null,
        covered: false
      };
      list.items.push(item);
      return showItem(item);
    });
  }

  // DELETE /api/shoppinglists/{id}/items/{itemId}
  // An item that came from the recipes stays removed when the list is generated again.
  async function removeItem(userId, listId, itemId) {
    await changeList(userId, listId, (list) => {
      const item = findItem(list, itemId);
      list.items = list.items.filter((entry) => entry.id !== itemId);
      if (item.source !== 'manual' && item.key) {
        list.hiddenKeys = [...new Set([...(list.hiddenKeys || []), item.key])];
      }
    });
  }

  return { getList, updateItem, addItem, removeItem };
}

module.exports = { createShoppingListService };
