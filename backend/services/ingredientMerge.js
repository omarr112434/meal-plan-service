// Turns the ingredients of every planned recipe into one shopping list.
// The same ingredient is added up into one line: 2 onions + 1 onion = 3 onions,
// and 1 l milk + 300 ml milk = 1.3 l milk.
//
// Ingredients arrive already normalized by the Import and Ingredient service
// ({ ingredientId, name, quantity, unit }), so here we only add them up.

// Units we know how to convert. Each group is added up in its base unit (g or ml).
const UNITS = {
  g: { group: 'mass', factor: 1 },
  kg: { group: 'mass', factor: 1000 },
  oz: { group: 'mass', factor: 28.3495 },
  lb: { group: 'mass', factor: 453.592 },
  ml: { group: 'volume', factor: 1 },
  l: { group: 'volume', factor: 1000 },
  tsp: { group: 'volume', factor: 4.92892 },
  tbsp: { group: 'volume', factor: 14.7868 },
  cup: { group: 'volume', factor: 236.588 }
};

const ALIASES = {
  gram: 'g', grams: 'g', gr: 'g',
  kilogram: 'kg', kilograms: 'kg', kgs: 'kg',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  cups: 'cup',
  // "2 pieces" and "2" mean the same thing
  piece: '', pieces: '', pc: '', pcs: ''
};

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function normalizeUnit(unit) {
  const cleaned = String(unit || '').trim().toLowerCase().replace(/\.$/, '');
  return own(ALIASES, cleaned) ? ALIASES[cleaned] : cleaned;
}

function round2(value) {
  return value === null ? null : Math.round(value * 100) / 100;
}

function hasAmount(line) {
  return typeof line.quantity === 'number' && Number.isFinite(line.quantity) && line.quantity > 0;
}

// Picks the final amount and unit for one group of lines.
function addUp(lines) {
  const withAmount = lines.filter(hasAmount);
  if (withAmount.length === 0) {
    return { quantity: null, unit: lines[0].unit }; // e.g. salt, to taste
  }

  const units = new Set(withAmount.map((line) => line.unit));
  if (units.size === 1) {
    // all the same unit: keep it ("3 tbsp", not "44.36 ml")
    const total = withAmount.reduce((sum, line) => sum + line.quantity, 0);
    return { quantity: round2(total), unit: withAmount[0].unit };
  }

  // different units of the same kind: convert to g or ml first
  const group = UNITS[withAmount[0].unit].group;
  const base = withAmount.reduce((sum, line) => sum + line.quantity * UNITS[line.unit].factor, 0);
  if (group === 'mass') {
    return base >= 1000 ? { quantity: round2(base / 1000), unit: 'kg' } : { quantity: round2(base), unit: 'g' };
  }
  return base >= 1000 ? { quantity: round2(base / 1000), unit: 'l' } : { quantity: round2(base), unit: 'ml' };
}

// "mass", "volume", or "unit:clove" for units that can't be converted
function unitGroupOf(unit) {
  return own(UNITS, unit) ? UNITS[unit].group : `unit:${unit}`;
}

// Amount in g or ml (null if the unit can't be converted).
function toBase(quantity, unit) {
  return own(UNITS, unit) ? quantity * UNITS[unit].factor : null;
}

// Back from g or ml to the given unit.
function fromBase(base, unit) {
  return own(UNITS, unit) ? round2(base / UNITS[unit].factor) : null;
}

// lines: [{ ingredientId, name, quantity, unit, recipeTitle }]
// returns: [{ key, ingredientId, name, quantity, unit, recipes: [titles] }], sorted by name
// key identifies the same line across regenerations (the user may rename the item later).
function mergeIngredients(lines) {
  const groups = new Map();

  for (const line of lines) {
    const name = String(line.name || '').trim();
    if (!name) continue;

    const unit = normalizeUnit(line.unit);
    // Lines only merge when the amounts can be added: same ingredient AND
    // same unit group (grams can't be added to cloves).
    const ingredient = line.ingredientId ? `id:${line.ingredientId}` : `name:${name.toLowerCase()}`;
    const key = `${ingredient}|${unitGroupOf(unit)}`;

    if (!groups.has(key)) {
      groups.set(key, { key, ingredientId: line.ingredientId || null, name, lines: [], recipes: new Set() });
    }
    const group = groups.get(key);
    group.lines.push({ quantity: line.quantity, unit });
    if (line.recipeTitle) group.recipes.add(line.recipeTitle);
  }

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      ingredientId: group.ingredientId,
      name: group.name,
      ...addUp(group.lines),
      recipes: [...group.recipes]
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
}

module.exports = { mergeIngredients, normalizeUnit, unitGroupOf, toBase, fromBase, round2 };
