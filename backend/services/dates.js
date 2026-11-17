// A week always starts on Monday, so any date the user picks is moved back to that week's Monday.
// Everything is done in UTC so the server's timezone can't shift a date by one day.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC quietly turns 2026-02-30 into March 2nd, so check nothing moved
  const sameDate = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
  if (!sameDate || year < 2000 || year > 2100) return null;

  return date;
}

// "2026-11-18" (a Wednesday) -> "2026-11-16" (the Monday). Returns null for bad dates.
function weekStartOf(value) {
  const date = parseDate(value);
  if (!date) return null;

  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

module.exports = { parseDate, weekStartOf };
