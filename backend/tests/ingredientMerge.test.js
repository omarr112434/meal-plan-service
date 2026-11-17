const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeIngredients, normalizeUnit } = require('../services/ingredientMerge');

const find = (items, name) => items.find((item) => item.name === name);

test('same ingredient and unit is added up', () => {
  const items = mergeIngredients([
    { ingredientId: 'ing-onion', name: 'Onion', quantity: 2, unit: '' },
    { ingredientId: 'ing-onion', name: 'Onion', quantity: 1, unit: '' }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 3);
});

test('mixed units of the same kind are converted (1 l + 300 ml = 1.3 l)', () => {
  const items = mergeIngredients([
    { ingredientId: 'ing-milk', name: 'Milk', quantity: 1, unit: 'l' },
    { ingredientId: 'ing-milk', name: 'Milk', quantity: 300, unit: 'ml' }
  ]);
  assert.deepEqual([items[0].quantity, items[0].unit], [1.3, 'l']);
});

test('under 1000 g stays in grams', () => {
  const items = mergeIngredients([
    { ingredientId: 'ing-chicken', name: 'Chicken', quantity: 0.5, unit: 'kg' },
    { ingredientId: 'ing-chicken', name: 'Chicken', quantity: 200, unit: 'g' }
  ]);
  assert.deepEqual([items[0].quantity, items[0].unit], [700, 'g']);
});

test('units that cannot be added stay on separate lines', () => {
  const items = mergeIngredients([
    { ingredientId: 'ing-garlic', name: 'Garlic', quantity: 3, unit: 'clove' },
    { ingredientId: 'ing-garlic', name: 'Garlic', quantity: 1, unit: 'tsp' }
  ]);
  assert.equal(items.length, 2);
});

test('"pieces" and no unit are the same thing', () => {
  const items = mergeIngredients([
    { ingredientId: 'ing-pita', name: 'Pita bread', quantity: 4, unit: 'pieces' },
    { ingredientId: 'ing-pita', name: 'Pita bread', quantity: 2, unit: '' }
  ]);
  assert.deepEqual([items[0].quantity, items[0].unit], [6, '']);
});

test('no amount stays empty, and an amount wins over "to taste"', () => {
  const salt = mergeIngredients([
    { ingredientId: 'ing-salt', name: 'Salt', quantity: null, unit: '' },
    { ingredientId: 'ing-salt', name: 'Salt', quantity: null, unit: '' }
  ]);
  assert.equal(salt[0].quantity, null);

  const sugar = mergeIngredients([
    { ingredientId: 'ing-sugar', name: 'Sugar', quantity: null, unit: 'tbsp' },
    { ingredientId: 'ing-sugar', name: 'Sugar', quantity: 2, unit: 'tbsp' }
  ]);
  assert.equal(sugar[0].quantity, 2);
});

test('lines without an ingredientId are matched by name, ignoring case', () => {
  const items = mergeIngredients([
    { name: 'Tomato', quantity: 2, unit: '' },
    { name: 'tomato', quantity: 1, unit: '' }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 3);
});

test('decimals are rounded (no 0.30000000000000004)', () => {
  const items = mergeIngredients([
    { name: 'Lemon', quantity: 0.1, unit: '' },
    { name: 'Lemon', quantity: 0.2, unit: '' }
  ]);
  assert.equal(items[0].quantity, 0.3);
});

test('remembers which recipes need each item, and sorts by name', () => {
  const items = mergeIngredients([
    { name: 'Eggs', quantity: 4, unit: '', recipeTitle: 'Shakshuka' },
    { name: 'Butter', quantity: 30, unit: 'g', recipeTitle: 'Pancakes' },
    { name: 'Eggs', quantity: 2, unit: '', recipeTitle: 'Pancakes' }
  ]);
  assert.deepEqual(items.map((item) => item.name), ['Butter', 'Eggs']);
  assert.deepEqual(find(items, 'Eggs').recipes, ['Shakshuka', 'Pancakes']);
});

test('unit names and plurals are normalized', () => {
  assert.equal(normalizeUnit('Tablespoons'), 'tbsp');
  assert.equal(normalizeUnit(' grams '), 'g');
  assert.equal(normalizeUnit('Litre'), 'l');
  assert.equal(normalizeUnit('tsp.'), 'tsp');
  assert.equal(normalizeUnit('clove'), 'clove');
  assert.equal(normalizeUnit('constructor'), 'constructor', 'object keys are not treated as units');
});
