// Pantry: what the user already has at home. Generating a shopping list subtracts it,
// so the list only shows what is really missing. This is the part of the design that
// tackles food waste: nothing gets bought twice.
const { normalizeUnit, unitGroupOf, toBase, fromBase, round2 } = require('./ingredientMerge');

// "Onions" at home and "Onion" in a recipe are the same thing.
function nameKey(name) {
  let text = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (/ies$/.test(text)) text = text.replace(/ies$/, 'y');
  else if (/(oes|ches|shes|xes)$/.test(text)) text = text.replace(/es$/, '');
  else if (/[^s]s$/.test(text)) text = text.replace(/s$/, '');
  return text;
}

// How much of the pantry items can be counted in the shopping item's unit.
// Returns null when none of them can (e.g. "2 cups" at home but the recipe needs "3 cloves").
function amountAtHome(matches, itemUnit) {
  let total = 0;
  let usable = false;
  for (const stock of matches) {
    const stockUnit = normalizeUnit(stock.unit);
    if (stockUnit === itemUnit) {
      total += stock.quantity;
      usable = true;
    } else if (unitGroupOf(stockUnit) === unitGroupOf(itemUnit) && toBase(1, stockUnit) !== null) {
      total += fromBase(toBase(stock.quantity, stockUnit), itemUnit); // e.g. 500 ml at home, recipe in l
      usable = true;
    }
  }
  return usable ? round2(total) : null;
}

// items: merged shopping items [{ name, quantity, unit, ... }]
// pantryItems: [{ name, quantity, unit }]; quantity null means "I have plenty"
// Returns the items with:
//   quantity  what is left to buy
//   needed    what the plan needs ({ quantity, unit })
//   atHome    what the pantry gave ({ quantity, unit }) or null
//   covered   true when nothing is left to buy
function applyPantry(items, pantryItems) {
  const stockByName = new Map();
  for (const stock of pantryItems) {
    const key = nameKey(stock.name);
    if (!stockByName.has(key)) stockByName.set(key, []);
    stockByName.get(key).push(stock);
  }

  return items.map((item) => {
    const needed = { quantity: item.quantity, unit: item.unit };
    const matches = stockByName.get(nameKey(item.name)) || [];

    if (matches.length === 0) {
      return { ...item, needed, atHome: null, covered: false };
    }
    if (matches.some((stock) => stock.quantity === null)) {
      // "I have plenty" covers it completely
      return { ...item, quantity: item.quantity === null ? null : 0, needed, atHome: { quantity: null, unit: '' }, covered: true };
    }
    if (item.quantity === null) {
      // "salt, to taste": any amount at home is enough
      return { ...item, needed, atHome: { quantity: matches[0].quantity, unit: matches[0].unit }, covered: true };
    }

    const unit = normalizeUnit(item.unit);
    const have = amountAtHome(matches, unit);
    if (have === null) {
      // can't subtract different kinds of unit; show what is at home but keep the full amount
      return { ...item, needed, atHome: { quantity: matches[0].quantity, unit: matches[0].unit }, covered: false };
    }

    const toBuy = round2(Math.max(0, item.quantity - have));
    return { ...item, quantity: toBuy, needed, atHome: { quantity: have, unit: item.unit }, covered: toBuy === 0 };
  });
}

module.exports = { applyPantry, nameKey };
