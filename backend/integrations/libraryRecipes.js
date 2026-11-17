// Recipe source for RECIPE_SOURCE=library: reads recipes from the Recipe Library service.
// That service (backend/services/recipeService.js) has to export the two functions below.
// The full agreement is in docs/integration-notes.md.
function create() {
  let library;
  try {
    library = require('../services/recipeService');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && /recipeService/.test(error.message)) {
      throw new Error(
        'RECIPE_SOURCE=library but backend/services/recipeService.js (Recipe Library service) is not here yet. ' +
        'Use RECIPE_SOURCE=sample until it is merged.'
      );
    }
    throw error;
  }

  for (const name of ['getRecipesForUser', 'getRecipeForUser']) {
    if (typeof library[name] !== 'function') {
      throw new Error(`recipeService.js must export ${name}(). See docs/integration-notes.md.`);
    }
  }

  return {
    kind: 'library',
    async listRecipes(userId, search = '') {
      const text = search.trim().toLowerCase();
      const recipes = await library.getRecipesForUser(userId);
      return recipes
        .filter((recipe) => !text || recipe.title.toLowerCase().includes(text))
        .map(({ id, title, tags }) => ({ id, title, tags: tags || [] }));
    },
    getRecipe: (userId, recipeId) => library.getRecipeForUser(userId, recipeId)
  };
}

module.exports = { create };
