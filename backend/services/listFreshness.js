// Is a shopping list still up to date?
// The list remembers a fingerprint of what it was made from: the recipes in the plan and the
// pantry. If either changes later (a recipe added or removed, something used up at home),
// the fingerprint changes and the pages show "Your plan changed: update the list".
// Moving a recipe to another day doesn't change the ingredients, so it doesn't count.
const { createHash } = require('crypto');
const { nameKey } = require('./pantryMath');
const { normalizeUnit } = require('./ingredientMerge');

function listFingerprint(plan, pantryItems) {
  const recipes = plan.entries.map((entry) => entry.recipeId).sort();
  const home = (pantryItems || [])
    .map((stock) => `${nameKey(stock.name)}|${stock.quantity}|${normalizeUnit(stock.unit)}`)
    .sort();
  return createHash('sha256').update(JSON.stringify([recipes, home])).digest('hex').slice(0, 16);
}

module.exports = { listFingerprint };
