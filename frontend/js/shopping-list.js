// Shopping list page: tick items off, edit, add and remove items, and update the list
// when the plan or the pantry changed. Everything is drawn with createElement and
// textContent (no innerHTML anywhere on this page), because names are user input.
const listId = new URLSearchParams(window.location.search).get('id');

const noList = document.querySelector('#no-list');
const listView = document.querySelector('#list-view');
const listTitle = document.querySelector('#list-title');
const listProgress = document.querySelector('#list-progress');
const progressBar = document.querySelector('#progress-bar');
const itemsList = document.querySelector('#items');
const homeSection = document.querySelector('#home-section');
const homeItems = document.querySelector('#home-items');
const staleBanner = document.querySelector('#stale-banner');
const warningsList = document.querySelector('#warnings');
const message = document.querySelector('#message');

let list = null;
let editingId = null;

// units written as short symbols are not made plural
const SYMBOLS = new Set(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'oz', 'lb']);

function showMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function amountText(quantity, unit) {
  if (quantity === null) return 'as needed';
  const number = String(quantity);
  if (!unit) return number;
  let shown = unit;
  if (quantity > 1 && !SYMBOLS.has(shown) && !shown.endsWith('s')) {
    shown += /(ch|sh)$/.test(shown) ? 'es' : 's';
  }
  return `${number} ${shown}`;
}

async function loadList() {
  if (!listId) {
    noList.hidden = false;
    return;
  }
  try {
    list = await api(`/shoppinglists/${encodeURIComponent(listId)}`);
    render();
  } catch (error) {
    noList.hidden = false;
    listView.hidden = true;
    showMessage(error.status === 404 ? 'That shopping list was not found.' : error.message, 'error');
  }
}

function render() {
  listView.hidden = false;
  noList.hidden = true;
  listTitle.textContent = `Shopping list: week of ${dates.long(list.weekStart)}`;
  document.querySelector('#back-to-plan').href = `planner.html?week=${list.weekStart}`;
  document.querySelector('#nav-planner').href = `planner.html?week=${list.weekStart}`;

  staleBanner.hidden = !list.outOfDate;
  warningsList.hidden = list.warnings.length === 0;
  warningsList.replaceChildren(...list.warnings.map((warning) => {
    const line = document.createElement('li');
    line.textContent = warning.message;
    return line;
  }));

  // "covered" items are fully in the pantry: shown in their own section, nothing to buy
  const toBuy = list.items.filter((item) => !item.covered);
  const atHome = list.items.filter((item) => item.covered);

  const done = toBuy.filter((item) => item.checked).length;
  listProgress.textContent = `${done} of ${toBuy.length} ticked off`;
  progressBar.max = Math.max(toBuy.length, 1);
  progressBar.value = done;

  // not-yet-bought items first, then the ticked ones; alphabetical inside each group
  const sorted = [...toBuy].sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));
  itemsList.replaceChildren(...sorted.map((item) => (item.id === editingId ? renderEditor(item) : renderItem(item))));

  homeSection.hidden = atHome.length === 0;
  homeItems.replaceChildren(...atHome.map(renderHomeItem));
}

function note(text, className = 'item-recipes') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function renderItem(item) {
  const row = document.createElement('li');
  row.className = item.checked ? 'item checked' : 'item';

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = `item-${item.id}`;
  box.checked = item.checked;
  box.addEventListener('change', () => saveItem(item, { checked: box.checked }, box));

  const label = document.createElement('label');
  label.htmlFor = box.id;
  label.className = 'item-text';

  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;

  const amount = document.createElement('span');
  amount.className = item.quantity === null ? 'item-amount muted' : 'item-amount';
  amount.textContent = amountText(item.quantity, item.unit);
  label.append(name, amount);

  if (item.source === 'manual') {
    label.append(note('added by you'));
  } else if (item.recipes.length > 0) {
    label.append(note(`for ${item.recipes.join(', ')}`));
  }
  if (item.atHome && item.atHome.quantity !== null && !item.edited) {
    label.append(note(`${amountText(item.atHome.quantity, item.atHome.unit)} already at home, so less to buy`, 'item-home'));
  }
  if (item.edited && item.needed && item.needed.quantity !== item.quantity) {
    label.append(note(`you changed this; the plan needs ${amountText(item.needed.quantity, item.needed.unit)}`, 'item-home'));
  }

  const tools = document.createElement('span');
  tools.className = 'item-tools';
  tools.append(
    toolButton('Edit', `Edit ${item.name}`, () => {
      editingId = item.id;
      render();
      document.querySelector('#edit-name').focus();
    }),
    toolButton('✕', `Remove ${item.name} from the list`, () => removeItem(item))
  );

  row.append(box, label, tools);
  return row;
}

function renderHomeItem(item) {
  const row = document.createElement('li');
  row.className = 'item at-home';
  const text = document.createElement('span');
  text.className = 'item-text';
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;
  text.append(name);
  if (item.needed) text.append(note(`the plan needs ${amountText(item.needed.quantity, item.needed.unit)}`));
  row.append(text);
  return row;
}

function toolButton(text, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button-quiet';
  button.textContent = text;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function renderEditor(item) {
  const row = document.createElement('li');
  row.className = 'item editing';

  const form = document.createElement('form');
  form.className = 'item-form';

  const field = (labelText, id, attributes, value) => {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.id = id;
    Object.entries(attributes).forEach(([key, val]) => input.setAttribute(key, val));
    input.value = value;
    label.append(input);
    return label;
  };

  const buttons = document.createElement('div');
  buttons.className = 'form-buttons';
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'button-primary';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button-quiet';
  cancel.id = 'cancel-edit';
  cancel.textContent = 'Cancel';
  buttons.append(save, cancel);

  form.append(
    field('Name', 'edit-name', { maxlength: '60', required: '' }, item.name),
    field('Amount', 'edit-quantity', { type: 'number', min: '0.01', max: '10000', step: '0.01' }, item.quantity === null ? '' : String(item.quantity)),
    field('Unit', 'edit-unit', { maxlength: '15', pattern: '[A-Za-z ]*' }, item.unit),
    buttons
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = form.querySelector('#edit-name').value.trim();
    const quantityText = form.querySelector('#edit-quantity').value.trim();
    const unit = form.querySelector('#edit-unit').value.trim();
    if (/[<>]/.test(name)) {
      showMessage('Names can only be plain text (no < or >).', 'error');
      return;
    }
    saveItem(item, { name, quantity: quantityText === '' ? null : Number(quantityText), unit }, null, true);
  });
  form.querySelector('#cancel-edit').addEventListener('click', () => {
    editingId = null;
    showMessage('');
    render();
  });

  row.append(form);
  return row;
}

async function saveItem(item, changes, control, closeEditor = false) {
  if (control) control.disabled = true;
  try {
    const updated = await api(`/shoppinglists/${list.id}/items/${item.id}`, { method: 'PATCH', body: changes });
    list.items = list.items.map((entry) => (entry.id === updated.id ? updated : entry));
    if (closeEditor) editingId = null;
    showMessage(closeEditor ? `Saved ${updated.name}.` : '');
    render();
  } catch (error) {
    showMessage(error.message, 'error');
    if (control) {
      control.checked = item.checked; // put the checkbox back
      control.disabled = false;
    }
  }
}

async function removeItem(item) {
  try {
    await api(`/shoppinglists/${list.id}/items/${item.id}`, { method: 'DELETE' });
    list.items = list.items.filter((entry) => entry.id !== item.id);
    showMessage(`Removed ${item.name}. It stays off the list even when the list is updated.`, 'ok');
    render();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.querySelector('#add-item-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.querySelector('#new-name').value.trim();
  const quantityText = form.querySelector('#new-quantity').value.trim();
  const unit = form.querySelector('#new-unit').value.trim();
  if (/[<>]/.test(name)) {
    showMessage('Names can only be plain text (no < or >).', 'error');
    return;
  }
  try {
    const item = await api(`/shoppinglists/${list.id}/items`, {
      method: 'POST',
      body: { name, quantity: quantityText === '' ? null : Number(quantityText), unit }
    });
    list.items.push(item);
    form.reset();
    showMessage(`Added ${item.name}.`, 'ok');
    render();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

// Making the list again keeps ticks, edits, added and removed items.
document.querySelector('#update-list').addEventListener('click', async () => {
  try {
    showMessage('Updating the list...');
    list = await api(`/mealplans/${list.mealPlanId}/shoppinglist`, { method: 'POST' });
    showMessage('The list is up to date. Your ticks and changes were kept.', 'ok');
    render();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

document.querySelector('#print-list').addEventListener('click', () => window.print());

requireLogin(() => loadList());
