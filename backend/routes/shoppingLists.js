const express = require('express');
const { requireAuth } = require('../middleware/auth');
const requireJson = require('../middleware/requireJson');

// Mounted at /api/shoppinglists
module.exports = function shoppingListRoutes(controller) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/:id', controller.getList);
  router.patch('/:id/items/:itemId', requireJson, controller.updateItem);

  return router;
};
