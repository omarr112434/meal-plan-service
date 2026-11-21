const express = require('express');
const { requireAuth } = require('../middleware/auth');
const requireJson = require('../middleware/requireJson');

// Mounted at /api/pantry. Each user has one pantry and only ever reaches their own.
module.exports = function pantryRoutes(controller) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', controller.getPantry);
  router.post('/items', requireJson, controller.addItem);
  router.patch('/items/:itemId', requireJson, controller.updateItem);
  router.delete('/items/:itemId', controller.removeItem);

  return router;
};
