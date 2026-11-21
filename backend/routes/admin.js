const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');

// Mounted at /api/admin. Admin role only: the backend answers 403 to anyone else,
// whatever the page shows or hides.
module.exports = function adminRoutes(controller) {
  const router = express.Router();
  router.use(requireAuth, requireRole('admin'));

  router.delete('/users/:userId/mealplan-data', controller.deleteUserData);

  return router;
};
