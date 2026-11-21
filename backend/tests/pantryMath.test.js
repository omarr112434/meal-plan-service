// Unit tests for the pantry calculation (what is already at home is taken off the list).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyPantry, nameKey } = require('../services/pantryMath');

const item = (name, quantity, unit) => ({ key: `name:${name}`, name, quantity, unit, recipes: [] });

test('names match with simple plurals', () => {
  assert.equal(nameKey('Onions'), nameKey('onion'));
  assert.equal(nameKey('Tomatoes'), nameKey('tomato'));
  assert.equal(nameKey('Cherries'), nameKey('cherry'));
  assert.equal(nameKey('  Brown   lentils '), 'brown lentil');
});

test('same unit is taken off', () => {
  const [onion] = applyPantry([item('Onion', 6, '')], [{ name: 'onions', quantity: 2, unit: '' }]);
  assert.deepEqual([onion.quantity, onion.needed.quantity, onion.atHome.quantity, onion.covered], [4, 6, 2, false]);
});

test('units of the same kind are converted (500 ml at home, 1.3 l needed)', () => {
  const [milk] = applyPantry([item('Milk', 1.3, 'l')], [{ name: 'Milk', quantity: 500, unit: 'ml' }]);
  assert.deepEqual([milk.quantity, milk.unit], [0.8, 'l']);
});

test('more at home than needed means nothing to buy', () => {
  const [rice] = applyPantry([item('Rice', 400, 'g')], [{ name: 'rice', quantity: 1, unit: 'kg' }]);
  assert.deepEqual([rice.quantity, rice.covered], [0, true]);
});

test('no amount at home means "I have plenty"', () => {
  const [cumin] = applyPantry([item('Ground cumin', 2.5, 'tsp')], [{ name: 'Ground cumin', quantity: null, unit: '' }]);
  assert.deepEqual([cumin.quantity, cumin.covered], [0, true]);
});

test('"to taste" items are covered by any amount at home', () => {
  const [salt] = applyPantry([item('Salt', null, '')], [{ name: 'salt', quantity: 1, unit: 'kg' }]);
  assert.deepEqual([salt.quantity, salt.covered], [null, true]);
});

test('different kinds of unit are not subtracted, but shown', () => {
  const [garlic] = applyPantry([item('Garlic', 9, 'clove')], [{ name: 'garlic', quantity: 100, unit: 'g' }]);
  assert.deepEqual([garlic.quantity, garlic.covered, garlic.atHome.quantity], [9, false, 100]);
});

test('items with nothing at home are unchanged', () => {
  const [eggs] = applyPantry([item('Eggs', 8, '')], []);
  assert.deepEqual([eggs.quantity, eggs.atHome, eggs.covered], [8, null, false]);
});
