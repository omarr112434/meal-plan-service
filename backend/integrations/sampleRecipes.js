// Recipe source used while the Recipe Library service is not ready (RECIPE_SOURCE=sample).
// Each user only sees their own recipes, so the "only your own recipes" rule can be tested.
const data = require('../data/sample-recipes.json');

function create() {
  function recipesOf(userId) {
    return Object.prototype.hasOwnProperty.call(data.users, userId) ? data.users[userId] : data.starter;
  }

  return {
    kind: 'sample',

    // [{ id, title, tags }] for the planner's recipe list, optionally filtered by title
    async listRecipes(userId, search = '') {
      const text = search.trim().toLowerCase();
      return recipesOf(userId)
        .filter((recipe) => !text || recipe.title.toLowerCase().includes(text))
        .map(({ id, title, tags }) => ({ id, title, tags }));
    },

    // { id, title, ingredients: [{ ingredientId, name, quantity, unit }] } or null
    async getRecipe(userId, recipeId) {
      const recipe = recipesOf(userId).find((item) => item.id === recipeId);
      return recipe ? structuredClone(recipe) : null;
    }
  };
}

module.exports = { create };
