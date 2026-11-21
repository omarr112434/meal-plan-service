// Pantry page: what the user already has at home. Add an item, change its amount,
// or remove it when it's used up. Names are user input, so only textContent is used.
const itemsList = document.querySelector('#pantry-items');
const emptyPantry = document.querySelector('#empty-pantry');
const message = document.querySelector('#message');

let items = [];

function showMessage(text, kind = '') {
  message.textContent = text;
  message.className = `message ${kind}`.trim();
}

function amountText(item) {
  if (item.quantity === null) return 'plenty';
  return item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
}

async function loadPantry() {
  const pantry = await api('/pantry');
  items = pantry.items;
  render();
}

function render() {
  emptyPantry.hidden = items.length > 0;
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  itemsList.replaceChildren(...sorted.map(renderItem));
}

function renderItem(item) {
  const row = document.createElement('li');
  row.className = 'item pantry-item';

  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;

  // change the amount right in the row
  const amount = document.createElement('input');
  amount.type = 'number';
  amount.min = '0.01';
  amount.max = '10000';
  amount.step = '0.01';
  amount.value = item.quantity === null ? '' : String(item.quantity);
  amount.placeholder = 'plenty';
  amount.setAttribute('aria-label', `Amount of ${item.name}`);
  amount.addEventListener('change', () => saveAmount(item, amount));

  const unit = document.createElement('span');
  unit.className = 'item-amount';
  unit.textContent = item.unit;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button-quiet';
  remove.textContent = 'Used it up';
  remove.setAttribute('aria-label', `Remove ${item.name} from the pantry`);
  remove.addEventListener('click', () => removeItem(item));

  row.append(name, amount, unit, remove);
  return row;
}

async function saveAmount(item, input) {
  const text = input.value.trim();
  try {
    const updated = await api(`/pantry/items/${item.id}`, {
      method: 'PATCH',
      body: { quantity: text === '' ? null : Number(text) }
    });
    items = items.map((entry) => (entry.id === updated.id ? updated : entry));
    showMessage(`${updated.name}: ${amountText(updated)}. Update your shopping list to use it.`, 'ok');
    render();
  } catch (error) {
    showMessage(error.message, 'error');
    input.value = item.quantity === null ? '' : String(item.quantity);
  }
}

async function removeItem(item) {
  try {
    await api(`/pantry/items/${item.id}`, { method: 'DELETE' });
    items = items.filter((entry) => entry.id !== item.id);
    showMessage(`Removed ${item.name}.`, 'ok');
    render();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.querySelector('#add-pantry-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.querySelector('#pantry-name').value.trim();
  const quantityText = form.querySelector('#pantry-quantity').value.trim();
  const unit = form.querySelector('#pantry-unit').value.trim();
  if (/[<>]/.test(name)) {
    showMessage('Names can only be plain text (no < or >).', 'error');
    return;
  }
  try {
    const item = await api('/pantry/items', {
      method: 'POST',
      body: { name, quantity: quantityText === '' ? null : Number(quantityText), unit }
    });
    items.push(item);
    form.reset();
    showMessage(`Added ${item.name}.`, 'ok');
    render();
  } catch (error) {
    showMessage(error.message, 'error');
  }
});

requireLogin(() => loadPantry().catch((error) => showMessage(error.message, 'error')));
