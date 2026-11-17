// Shopping lists: open a list, edit an item, tick it off.
// Lists are created by mealPlanService.generateShoppingList.
const { notFound } = require('./errors');
const check = require('./validation');
const { showItem, showList } = require('./views');

const SAVE_ATTEMPTS = 3;

function createShoppingListService({ store, now = () => new Date() }) {
  async function loadList(userId, listId) {
    if (!check.isId(listId)) throw notFound('LIST_NOT_FOUND', 'Shopping list not found.');
    // lists are stored under the owner's userId, so another user's list id finds nothing
    const list = await store.findList(userId, listId);
    if (!list) throw notFound('LIST_NOT_FOUND', 'Shopping list not found.');
    return list;
  }

  // GET /api/shoppinglists/{id}
  async function getList(userId, listId) {
    return showList(await loadList(userId, listId));
  }

  // PATCH /api/shoppinglists/{id}/items/{itemId}
  async function updateItem(userId, listId, itemId, body) {
    check.requireObject(body);
    const changes = check.itemChanges(body);

    for (let attempt = 1; ; attempt += 1) {
      const list = await loadList(userId, listId);
      const item = list.items.find((entry) => entry.id === itemId);
      if (!item) throw notFound('ITEM_NOT_FOUND', 'Shopping list item not found.');

      Object.assign(item, changes);
      list.updatedAt = now().toISOString();
      try {
        await store.saveList(list);
        return showItem(item);
      } catch (error) {
        if (error.code !== 'VERSION_CONFLICT' || attempt >= SAVE_ATTEMPTS) throw error;
      }
    }
  }

  return { getList, updateItem };
}

module.exports = { createShoppingListService };
