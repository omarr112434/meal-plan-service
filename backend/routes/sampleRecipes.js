const express = require('express');
const { requireAuth } = require('../middleware/auth');

// GET /api/recipes?q=text  (stand-in only)
// Answers like the Recipe Library's "list and search my recipes" endpoint so the planner page
// works before that service exists. Only mounted when RECIPE_SOURCE=sample; once the real
// Recipe Library routes are merged they take over /api/recipes.
module.exports = function sampleRecipeRoutes(recipes) {
  const router = express.Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 50) : '';
    res.status(200).json(await recipes.listRecipes(req.user.id, search));
  });

  return router;
};
