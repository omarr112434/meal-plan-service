// Where recipes come from: RECIPE_SOURCE=sample (default) or RECIPE_SOURCE=library.
function createRecipeSource(config) {
  if (config.recipeSource === 'library') {
    return require('./libraryRecipes').create();
  }
  return require('./sampleRecipes').create();
}

module.exports = { createRecipeSource };
