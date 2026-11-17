const { test } = require('node:test');
const assert = require('node:assert/strict');
const { weekStartOf } = require('../services/dates');

test('any day of the week gives that week\'s Monday', () => {
  assert.equal(weekStartOf('2026-11-16'), '2026-11-16'); // Monday
  assert.equal(weekStartOf('2026-11-18'), '2026-11-16'); // Wednesday
  assert.equal(weekStartOf('2026-11-22'), '2026-11-16'); // Sunday
});

test('weeks that cross a month or a year', () => {
  assert.equal(weekStartOf('2026-12-01'), '2026-11-30');
  assert.equal(weekStartOf('2027-01-01'), '2026-12-28');
});

test('dates that do not exist or are not in YYYY-MM-DD are refused', () => {
  for (const bad of ['2026-02-30', '2026-13-01', '16/11/2026', '2026-11-1', '', null, 20261116, '1999-12-31']) {
    assert.equal(weekStartOf(bad), null, String(bad));
  }
});

test('leap day works', () => {
  assert.equal(weekStartOf('2028-02-29'), '2028-02-28');
});
