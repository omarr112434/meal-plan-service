// Shopping list page: tick items off, edit an item (name, amount, unit).
const listId = new URLSearchParams(window.location.search).get('id');

const noList = document.querySelector('#no-list');
const listView = document.querySelector('#list-view');
const listTitle = document.querySelector('#list-title');
const listProgress = document.querySelector('#list-progress');
const progressBar = document.querySelector('#progress-bar');
const itemsList = document.querySelector('#items');
const message = document.querySelector('#message');

let list = null;
let editingId = null;

// units written as short symbols are not made plural
const SYMBOLS = new Set(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'oz', 'lb']);

function showMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function amountText(item) {
  if (item.quantity === null) return 'as needed';
  const number = String(item.quantity);
  if (!item.unit) return number;
  let unit = item.unit;
  if (item.quantity > 1 && !SYMBOLS.has(unit) && !unit.endsWith('s')) {
    unit += /(ch|sh)$/.test(unit) ? 'es' : 's';
  }
  return `${number} ${unit}`;
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
    showMessage(error.status === 404 ? 'That shopping list was not found.' : error.message, 'error');
  }
}

function render() {
  listView.hidden = false;
  noList.hidden = true;
  listTitle.textContent = `Shopping list: week of ${dates.long(list.weekStart)}`;
  document.querySelector('#back-to-plan').href = `planner.html?week=${list.weekStart}`;
  document.querySelector('#nav-planner').href = `planner.html?week=${list.weekStart}`;

  const done = list.items.filter((item) => item.checked).length;
  listProgress.textContent = `${done} of ${list.items.length} ticked off`;
  progressBar.max = Math.max(list.items.length, 1);
  progressBar.value = done;

  // not-yet-bought items first, then the ticked ones; alphabetical inside each group
  const sorted = [...list.items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.name.localeCompare(b.name));
  itemsList.replaceChildren(...sorted.map((item) => (item.id === editingId ? renderEditor(item) : renderItem(item))));
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
  name.textContent = item.name; // textContent only: names are user input

  const amount = document.createElement('span');
  amount.className = item.quantity === null ? 'item-amount muted' : 'item-amount';
  amount.textContent = amountText(item);

  label.append(name, amount);
  if (item.recipes.length > 0) {
    const used = document.createElement('span');
    used.className = 'item-recipes';
    used.textContent = `for ${item.recipes.join(', ')}`;
    label.append(used);
  }

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'button-quiet';
  edit.textContent = 'Edit';
  edit.setAttribute('aria-label', `Edit ${item.name}`);
  edit.addEventListener('click', () => {
    editingId = item.id;
    render();
    document.querySelector('#edit-name').focus();
  });

  row.append(box, label, edit);
  return row;
}

function renderEditor(item) {
  const row = document.createElement('li');
  row.className = 'item editing';

  const form = document.createElement('form');
  form.className = 'item-form';

  // built with createElement and .value (no innerHTML anywhere on this page)
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

document.querySelector('#print-list').addEventListener('click', () => window.print());

requireLogin(() => loadList());
