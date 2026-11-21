const express = require('express');
const { requireAuth } = require('../middleware/auth');
const requireJson = require('../middleware/requireJson');

// Mounted at /api/mealplans. Every route needs a logged-in user (User or Admin role);
// each user can only reach their own plans.
module.exports = function mealPlanRoutes(controller) {
  const router = express.Router();
  router.use(requireAuth);

  router.post('/', requireJson, controller.create);
  router.get('/', controller.getForWeek);
  router.delete('/:id', controller.deletePlan);
  router.post('/:id/entries', requireJson, controller.addEntry);
  router.patch('/:id/entries/:entryId', requireJson, controller.moveEntry);
  router.delete('/:id/entries/:entryId', controller.removeEntry);
  router.post('/:id/shoppinglist', controller.generateShoppingList);

  return router;
};
