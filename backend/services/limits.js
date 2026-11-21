// Limits for the Meal Plan and Shopping List service. They keep one user from filling the
// database or making one request do a huge amount of work (denial of service).
module.exports = {
  MAX_PER_SLOT: 4, // recipes in one day/meal slot
  MAX_PER_PLAN: 60, // recipes in one weekly plan
  MAX_LIST_ITEMS: 300, // items on one shopping list
  MAX_PANTRY_ITEMS: 200, // items in one user's pantry
  SAVE_ATTEMPTS: 3 // retries when two saves happen at the same time (version check)
};
