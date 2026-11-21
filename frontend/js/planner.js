// Weekly meal planner: drag recipes into day/meal slots, move, copy or remove them,
// and generate the week's shopping list. The API is the source of truth: after every
// change the plan is loaded again and the grid is drawn from it.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MEALS = ['breakfast', 'lunch', 'dinner'];
const MEAL_NAMES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

const weekTitle = document.querySelector('#week-title');
const grid = document.querySelector('#week-grid');
const noPlan = document.querySelector('#no-plan');
const planActions = document.querySelector('#plan-actions');
const openListLink = document.querySelector('#open-list');
const staleBanner = document.querySelector('#stale-banner');
const deletePlanButton = document.querySelector('#delete-plan');
const navListLink = document.querySelector('#nav-list');
const recipeList = document.querySelector('#recipe-list');
const recipeSearch = document.querySelector('#recipe-search');
const pickedBar = document.querySelector('#picked-bar');
const pickedText = document.querySelector('#picked-text');
const message = document.querySelector('#message');

let weekStart = startingWeek();
let plan = null; // null = no plan for this week yet
// Set when a recipe/entry was picked with a click (keyboard and touch users), then a slot is clicked:
// { action: 'add' | 'copy', recipeId, title } or { action: 'move', entryId, title }
let picked = null;
let busy = false;

function startingWeek() {
  const fromUrl = new URLSearchParams(window.location.search).get('week');
  return dates.mondayOf(dates.isValid(fromUrl) ? fromUrl : dates.today());
}

function showMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

// ---------- loading ----------

async function loadPlan() {
  weekTitle.textContent = `Week of ${dates.long(weekStart)}`;
  window.history.replaceState(null, '', `?week=${weekStart}`);
  try {
    plan = await api(`/mealplans?week=${weekStart}`);
  } catch (error) {
    if (error.status !== 404) throw error;
    plan = null;
  }
  renderPlan();
}

async function loadRecipes() {
  const search = recipeSearch.value.trim();
  const recipes = await api(`/recipes${search ? `?q=${encodeURIComponent(search)}` : ''}`);
  renderRecipes(recipes);
}

// Runs an API action, then reloads the plan. Shows errors in the message line.
async function run(action, successText) {
  if (busy) return;
  busy = true;
  try {
    await action();
    await loadPlan();
    if (successText) showMessage(successText, 'ok');
  } catch (error) {
    showMessage(error.message, 'error');
  } finally {
    busy = false;
  }
}

// ---------- drawing ----------

function renderRecipes(recipes) {
  recipeList.replaceChildren();
  if (recipes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'hint';
    empty.textContent = 'No recipes match.';
    recipeList.append(empty);
    return;
  }

  recipes.forEach((recipe) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recipe-item';
    button.draggable = true;
    button.textContent = recipe.title; // textContent, never innerHTML (no XSS)
    button.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('application/x-recipe', recipe.id);
      event.dataTransfer.setData('text/plain', recipe.title);
      event.dataTransfer.effectAllowed = 'copy';
    });
    button.addEventListener('click', () => pick({ action: 'add', recipeId: recipe.id, title: recipe.title }));
    item.append(button);
    recipeList.append(item);
  });
}

function renderPlan() {
  const listUrl = plan && plan.shoppingListId ? `shopping-list.html?id=${plan.shoppingListId}` : 'shopping-list.html';
  navListLink.href = listUrl;
  openListLink.href = listUrl;

  resetDeleteButton();
  if (!plan) {
    noPlan.hidden = false;
    grid.hidden = true;
    planActions.hidden = true;
    staleBanner.hidden = true;
    return;
  }

  noPlan.hidden = true;
  grid.hidden = false;
  planActions.hidden = false;
  openListLink.hidden = !plan.shoppingListId;
  // the API says when recipes were added or removed after the list was made
  staleBanner.hidden = !plan.shoppingListOutOfDate;
  document.querySelector('#generate-list').textContent = plan.shoppingListId ? 'Update shopping list' : 'Generate shopping list';
  grid.replaceChildren();

  DAYS.forEach((day, index) => {
    const column = document.createElement('section');
    column.className = 'day';
    column.setAttribute('aria-label', dates.short(dates.addDays(weekStart, index)));

    const heading = document.createElement('h3');
    heading.textContent = dates.short(dates.addDays(weekStart, index));
    if (dates.addDays(weekStart, index) === dates.today()) heading.classList.add('today');
    column.append(heading);

    MEALS.forEach((meal) => column.append(renderSlot(day, meal)));
    grid.append(column);
  });

  grid.classList.toggle('placing', Boolean(picked));
}

function renderSlot(day, meal) {
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.dataset.day = day;
  slot.dataset.meal = meal;
  slot.tabIndex = 0;
  slot.setAttribute('role', 'group');
  slot.setAttribute('aria-label', `${dates.short(dates.addDays(weekStart, DAYS.indexOf(day)))}, ${MEAL_NAMES[meal]}`);

  const label = document.createElement('span');
  label.className = 'slot-label';
  label.textContent = MEAL_NAMES[meal];
  slot.append(label);

  plan.entries
    .filter((entry) => entry.day === day && entry.meal === meal)
    .forEach((entry) => slot.append(renderEntry(entry)));

  // drag and drop
  slot.addEventListener('dragover', (event) => {
    const types = event.dataTransfer.types;
    if (types.includes('application/x-recipe') || types.includes('application/x-entry')) {
      event.preventDefault();
      slot.classList.add('drag-over');
    }
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', (event) => {
    event.preventDefault();
    slot.classList.remove('drag-over');
    const entryId = event.dataTransfer.getData('application/x-entry');
    const recipeId = event.dataTransfer.getData('application/x-recipe');
    if (entryId) moveEntry(entryId, day, meal);
    else if (recipeId) addEntry(recipeId, day, meal);
  });

  // click (or Enter/Space) to place a picked recipe
  const place = () => {
    if (picked) placePicked(day, meal);
  };
  slot.addEventListener('click', (event) => {
    if (event.target === slot || event.target === label) place();
  });
  slot.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === slot) {
      event.preventDefault();
      place();
    }
  });

  return slot;
}

function renderEntry(entry) {
  const chip = document.createElement('div');
  chip.className = entry.recipeMissing ? 'chip missing' : 'chip';
  chip.draggable = !entry.recipeMissing;
  chip.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('application/x-entry', entry.id);
    event.dataTransfer.setData('text/plain', entry.recipeTitle);
    event.dataTransfer.effectAllowed = 'move';
  });

  const title = document.createElement('span');
  title.className = 'chip-title';
  title.textContent = entry.recipeTitle;

  const tools = document.createElement('span');
  tools.className = 'chip-tools';
  if (entry.recipeMissing) {
    // the recipe was deleted from the library: it adds nothing to the list, so offer to remove it
    tools.append(chipButton('Remove', 'Remove this deleted recipe from the plan', () => removeEntry(entry)));
  } else {
    tools.append(
      chipButton('Move', `Move ${entry.recipeTitle}`, () => pick({ action: 'move', entryId: entry.id, title: entry.recipeTitle })),
      chipButton('Copy', `Copy ${entry.recipeTitle} to another slot`, () => pick({ action: 'copy', recipeId: entry.recipeId, title: entry.recipeTitle })),
      chipButton('✕', `Remove ${entry.recipeTitle}`, () => removeEntry(entry))
    );
  }

  chip.append(title, tools);
  return chip;
}

function chipButton(text, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip-button';
  button.textContent = text;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

// ---------- picking (click instead of drag) ----------

function pick(choice) {
  if (!plan) {
    showMessage('Create a plan for this week first.', 'error');
    return;
  }
  picked = choice;
  const verb = { add: 'Put', copy: 'Put a copy of', move: 'Move' }[choice.action];
  pickedText.textContent = `${verb} "${choice.title}": now press a slot.`;
  pickedBar.hidden = false;
  grid.classList.add('placing');
  const firstSlot = grid.querySelector('.slot');
  if (firstSlot) firstSlot.focus();
}

function cancelPick() {
  picked = null;
  pickedBar.hidden = true;
  grid.classList.remove('placing');
}

function placePicked(day, meal) {
  const choice = picked;
  cancelPick();
  if (choice.action === 'move') moveEntry(choice.entryId, day, meal);
  else addEntry(choice.recipeId, day, meal);
}

// ---------- actions ----------

function slotName(day, meal) {
  return `${dates.short(dates.addDays(weekStart, DAYS.indexOf(day)))} ${MEAL_NAMES[meal].toLowerCase()}`;
}

function addEntry(recipeId, day, meal) {
  run(() => api(`/mealplans/${plan.id}/entries`, { method: 'POST', body: { recipeId, day, meal } }),
    `Added to ${slotName(day, meal)}.`);
}

function moveEntry(entryId, day, meal) {
  const entry = plan.entries.find((item) => item.id === entryId);
  if (entry && entry.day === day && entry.meal === meal) return; // dropped where it already was
  run(() => api(`/mealplans/${plan.id}/entries/${entryId}`, { method: 'PATCH', body: { day, meal } }),
    `Moved to ${slotName(day, meal)}.`);
}

function removeEntry(entry) {
  run(() => api(`/mealplans/${plan.id}/entries/${entry.id}`, { method: 'DELETE' }),
    `Removed ${entry.recipeTitle}.`);
}

document.querySelector('#create-plan').addEventListener('click', () => {
  run(() => api('/mealplans', { method: 'POST', body: { weekStart } }), 'Plan created. Now drag some recipes in.');
});

// Making the list again keeps ticks, edits, added and removed items, so no warning is needed.
async function buildList() {
  if (plan.entries.length === 0) {
    showMessage('Add at least one recipe first.', 'error');
    return;
  }
  try {
    showMessage('Building your shopping list...');
    const list = await api(`/mealplans/${plan.id}/shoppinglist`, { method: 'POST' });
    window.location.href = `shopping-list.html?id=${list.id}`;
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.querySelector('#generate-list').addEventListener('click', buildList);
document.querySelector('#update-list').addEventListener('click', buildList);

// Deleting needs two clicks (no pop-up): the first click asks, the second one deletes.
let deleteTimer;
function resetDeleteButton() {
  clearTimeout(deleteTimer);
  deletePlanButton.dataset.armed = '';
  deletePlanButton.textContent = "Delete this week's plan";
}

deletePlanButton.addEventListener('click', () => {
  if (!deletePlanButton.dataset.armed) {
    deletePlanButton.dataset.armed = 'yes';
    deletePlanButton.textContent = 'Click again to delete the plan and its list';
    deleteTimer = setTimeout(resetDeleteButton, 5000);
    return;
  }
  resetDeleteButton();
  run(() => api(`/mealplans/${plan.id}`, { method: 'DELETE' }), "This week's plan and its shopping list were deleted.");
});

document.querySelector('#prev-week').addEventListener('click', () => changeWeek(-7));
document.querySelector('#next-week').addEventListener('click', () => changeWeek(7));
document.querySelector('#cancel-pick').addEventListener('click', cancelPick);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && picked) cancelPick();
});

function changeWeek(days) {
  cancelPick();
  weekStart = dates.addDays(weekStart, days);
  showMessage('');
  loadPlan().catch((error) => showMessage(error.message, 'error'));
}

let searchTimer;
recipeSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadRecipes().catch((error) => showMessage(error.message, 'error')), 250);
});

requireLogin(async () => {
  try {
    await Promise.all([loadPlan(), loadRecipes()]);
  } catch (error) {
    showMessage(error.message, 'error');
  }
});
