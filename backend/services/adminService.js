// Admin-only actions for the Meal Plan and Shopping List service.
// When an admin deletes a user account, this deletes everything that user had here:
// their weekly plans, shopping lists and pantry (nothing is left behind).
const check = require('./validation');

function createAdminService({ store }) {
  // DELETE /api/admin/users/{userId}/mealplan-data   (Admin role only, checked in the route)
  async function deleteUserData(userId) {
    const target = check.userId(userId);
    const plans = await store.listPlans(target);
    const lists = await store.listLists(target);

    for (const list of lists) await store.deleteList(target, list.id);
    for (const plan of plans) await store.deletePlan(target, plan.weekStart);
    const pantry = await store.deletePantry(target);

    return {
      userId: target,
      deleted: { mealPlans: plans.length, shoppingLists: lists.length, pantry: pantry ? 1 : 0 }
    };
  }

  return { deleteUserData };
}

module.exports = { createAdminService };
