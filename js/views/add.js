// Add-food flow: search (with recents) -> amount/portion picker -> saved entry.
// The same amount picker is used to edit an existing entry.
import { el, fmt, fmtKcal, fmtG, parseNum, round, formatDate } from '../util.js';
import { icon, iconButton, topbar, toast, amountLabel } from '../ui.js';
import { go, goBack, closeFlow, dayPath, refresh } from '../router.js';
import { searchFoods, foodsMeta } from '../foods.js';
import {
  addEntry,
  updateEntry,
  removeEntry,
  restoreEntry,
  findEntry,
  getRecents,
  resolveFood,
  getCustomFood,
  dayTotals,
  describeEntry,
} from '../store.js';
import { nutrientsFor, NUTRIENT_BY_KEY } from '../nutrients.js';

const MAX_AMOUNT = 10000;
const enc = encodeURIComponent;

// ---------- search ----------

export function addView(date) {
  const input = el('input', {
    class: 'search-input',
    type: 'search',
    placeholder: 'Search: chicken, brânză, творог…',
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-label': 'Search foods',
  });
  input.spellcheck = false;
  input.enterKeyHint = 'search';

  const tally = el('div', { class: 'tally' });
  const list = el('div', { class: 'food-list' });

  const updateTally = () => {
    const t = dayTotals(date);
    tally.textContent = `${formatDate(date, { day: 'numeric', month: 'short' })}: ${fmtKcal(t.kcal)} kcal · ${fmtG(t.protein)} g protein`;
  };

  function renderList() {
    const query = input.value.trim();
    list.replaceChildren();

    if (!query) {
      const recents = getRecents();
      if (recents.length) {
        list.append(el('h2', { class: 'section-title' }, 'Recent'), el('div', { class: 'card list' }, recents.map(recentRow)));
      } else {
        list.append(el('div', { class: 'empty' }, 'Type to search foods in English, Romanian or Russian.', el('br'), 'Foods you add will show up here for one-tap re-adding.'));
      }
      if (foodsMeta.error && !foodsMeta.loaded) {
        list.append(el('div', { class: 'note note-warn' }, 'The food database could not be loaded (offline?). Your custom foods still work.'));
      }
      return;
    }

    const results = searchFoods(query);
    if (results.length) {
      list.append(el('div', { class: 'card list' }, results.map(resultRow)));
    } else {
      list.append(el('div', { class: 'empty' }, `No foods match “${query}”.`));
    }
    list.append(
      el(
        'button',
        { class: 'btn btn-block', type: 'button', onClick: () => go(`/foodform/new?date=${date}&name=${enc(query)}`) },
        icon('plus'),
        `Create custom food “${query}”`,
      ),
    );
  }

  function resultRow({ food, isCustom, matchedAlias }) {
    return el(
      'button',
      { class: 'row', type: 'button', onClick: () => go(`/add/${date}/${enc(food.id)}`) },
      el(
        'div',
        { class: 'row-main' },
        el('div', { class: 'row-title' }, food.name, isCustom ? el('span', { class: 'badge' }, 'Custom') : null),
        el('div', { class: 'row-sub' }, matchedAlias ? `${matchedAlias} · ` : '', per100Summary(food)),
      ),
      icon('chevron'),
    );
  }

  function recentRow(recent) {
    const { food } = recent;
    const entryLike = { amount: recent.amount, portion: recent.portion };
    return el(
      'div',
      { class: 'row recent-row' },
      el(
        'button',
        { class: 'row-main row-button', type: 'button', onClick: () => go(`/add/${date}/${enc(food.id)}`) },
        el('div', { class: 'row-title' }, food.name),
        el('div', { class: 'row-sub' }, `Last: ${amountLabel(entryLike, food.unit)}`),
      ),
      el(
        'button',
        { class: 'quick-add', type: 'button', 'aria-label': `Add ${food.name} again (${amountLabel(entryLike, food.unit)})`, onClick: () => quickAdd(recent) },
        icon('plus'),
      ),
    );
  }

  function quickAdd(recent) {
    const entry = addEntry(date, { foodId: recent.foodId, amount: recent.amount, portion: recent.portion });
    toast(`Added ${recent.food.name}`, {
      actionLabel: 'Undo',
      onAction: () => {
        removeEntry(date, entry.id);
        updateTally();
        renderList();
      },
    });
    updateTally();
    renderList();
  }

  input.addEventListener('input', renderList);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur(); // closes the keyboard so the results are visible
  });

  updateTally();
  renderList();

  // search results come from foods.json: if it is still loading, fill them in when it arrives
  if (!foodsMeta.loaded) {
    window.addEventListener('foods-loaded', () => input.isConnected && renderList(), { once: true });
  }

  const view = el(
    'div',
    { class: 'view add-view' },
    el(
      'header',
      { class: 'searchbar' },
      iconButton('back', 'Back', () => goBack(dayPath(date))),
      el('div', { class: 'searchbox' }, icon('search'), input),
    ),
    tally,
    list,
  );
  return view;
}

/** "per 100 g: 120 kcal · 22.5 g protein" */
function per100Summary(food) {
  const p = food.per100 ?? {};
  const parts = [];
  if (Number.isFinite(p.kcal)) parts.push(`${fmt(p.kcal, 0)} kcal`);
  if (Number.isFinite(p.protein)) parts.push(`${fmt(p.protein, 1)} g protein`);
  return `per 100 ${food.unit}: ${parts.join(' · ') || '–'}`;
}

// ---------- amount picker (new entry) ----------

export function amountView(date, foodId) {
  const food = resolveFood(foodId);
  if (!food) return missingView('This food is no longer available.', dayPath(date));
  const recent = getRecents().find((r) => r.foodId === foodId);

  return amountScreen({
    title: food.name,
    food,
    date,
    initial: recent ? { amount: recent.amount, portion: recent.portion } : null,
    submitLabel: `Add to ${dayLabel(date)}`,
    onSubmit: ({ amount, portion }) => {
      const entry = addEntry(date, { foodId, amount, portion });
      toast(`Added ${food.name}`, {
        actionLabel: 'Undo',
        onAction: () => {
          removeEntry(date, entry.id);
          refresh();
        },
      });
      closeFlow(dayPath(date));
    },
  });
}

// ---------- amount picker (edit entry) ----------

export function entryView(date, entryId) {
  const entry = findEntry(date, entryId);
  if (!entry) return missingView('This entry no longer exists.', dayPath(date));
  const food = describeEntry(entry).food;

  const onDelete = () => {
    const removed = removeEntry(date, entryId);
    toast('Entry deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        if (removed) restoreEntry(date, removed.entry, removed.index);
        refresh();
      },
    });
    closeFlow(dayPath(date));
  };

  if (!food) {
    return el(
      'div',
      { class: 'view' },
      topbar('Entry', dayPath(date)),
      el('div', { class: 'empty card' }, 'The food for this entry is no longer available, so it cannot be edited.'),
      el('button', { class: 'btn btn-danger btn-block', type: 'button', onClick: onDelete }, 'Delete entry'),
    );
  }

  return amountScreen({
    title: food.name,
    food,
    date,
    initial: { amount: entry.amount, portion: entry.portion },
    submitLabel: 'Save changes',
    onDelete,
    onSubmit: ({ amount, portion }) => {
      updateEntry(date, entryId, { amount, portion });
      toast('Saved');
      closeFlow(dayPath(date));
    },
  });
}

function missingView(message, fallback) {
  return el(
    'div',
    { class: 'view' },
    topbar('Not found', fallback),
    el('div', { class: 'empty card' }, message),
    el('button', { class: 'btn btn-block', type: 'button', onClick: () => goBack(fallback) }, 'Go back'),
  );
}

function dayLabel(date) {
  return dayPath(date) === '/' ? 'today' : formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------- the picker itself ----------

const PREVIEW_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sugar'];

function amountScreen({ title, food, date, initial, submitLabel, onSubmit, onDelete }) {
  const unit = food.unit;
  const portions = food.portions ?? [];

  // Starting state: how the entry was entered before, else the first portion, else 100 g.
  let mode = 'amount'; // 'amount' or an index into portions
  let qtyText = '1';
  let amountText = '';
  const portionIndex = initial?.portion ? portions.findIndex((p) => p.label === initial.portion.label) : -1;
  if (portionIndex >= 0) {
    mode = portionIndex;
    qtyText = String(round(initial.portion.qty, 3));
  } else if (initial?.amount) {
    amountText = String(round(initial.amount, 2));
  } else if (portions.length) {
    mode = 0;
  } else {
    amountText = '100';
  }
  if (mode === 'amount' && !amountText) amountText = '100';

  // --- inputs ---
  const amountInput = el('input', {
    type: 'text',
    inputMode: 'decimal',
    autocomplete: 'off',
    value: amountText,
    'aria-label': `Amount in ${unit}`,
    onInput: update,
  });
  const qtyInput = el('input', {
    class: 'qty-input',
    type: 'text',
    inputMode: 'decimal',
    autocomplete: 'off',
    value: qtyText,
    'aria-label': 'Number of portions',
    onInput: update,
  });
  const stepQty = (delta) => {
    const current = parseNum(qtyInput.value);
    const base = Number.isFinite(current) ? current : 1;
    const next = Math.max(0.5, Math.round((base + delta) * 2) / 2); // half-portion steps
    qtyInput.value = String(next);
    update();
  };

  const amountField = el(
    'label',
    { class: 'field' },
    el('span', { class: 'field-label' }, unit === 'ml' ? 'Amount (ml)' : 'Amount (g)'),
    el('div', { class: 'input-suffix' }, amountInput, el('span', null, unit)),
  );
  const portionCaption = el('div', { class: 'portion-caption' });
  const qtyField = el(
    'div',
    { class: 'field' },
    el('span', { class: 'field-label' }, 'How many?'),
    el(
      'div',
      { class: 'stepper' },
      iconButton('minus', 'Less', () => stepQty(-0.5)),
      qtyInput,
      iconButton('plus', 'More', () => stepQty(0.5)),
    ),
    portionCaption,
  );

  // --- mode chips ---
  const chipsHost = el('div', { class: 'chips', role: 'group', 'aria-label': 'Amount type' });
  function renderChips() {
    chipsHost.replaceChildren(
      chip(unit === 'ml' ? 'Millilitres' : 'Grams', mode === 'amount', () => setMode('amount')),
      ...portions.map((p, i) => chip(`${p.label} · ${fmt(p.amount, 1)} ${unit}`, mode === i, () => setMode(i))),
    );
  }
  function chip(label, active, onClick) {
    return el('button', { class: `chip${active ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(active), onClick }, label);
  }
  function setMode(next) {
    mode = next;
    renderChips();
    update();
    if (mode === 'amount') {
      amountInput.focus();
      amountInput.select();
    }
  }

  // --- live preview ---
  const tiles = {};
  const previewKeys = [...PREVIEW_KEYS, ...(Number.isFinite(food.per100?.caffeine) ? ['caffeine'] : [])];
  const preview = el(
    'div',
    { class: 'preview card' },
    previewKeys.map((key) => {
      const valueEl = el('div', { class: 'tile-value' }, '–');
      tiles[key] = valueEl;
      const n = NUTRIENT_BY_KEY[key];
      return el('div', { class: `tile tile-${key}` }, valueEl, el('div', { class: 'tile-label' }, n.label));
    }),
  );

  const submitBtn = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, submitLabel);

  function currentAmount() {
    if (mode === 'amount') {
      const v = parseNum(amountInput.value);
      return Number.isFinite(v) && v > 0 ? v : null;
    }
    const q = parseNum(qtyInput.value);
    return Number.isFinite(q) && q > 0 ? q * portions[mode].amount : null;
  }

  function update() {
    amountField.hidden = mode !== 'amount';
    qtyField.hidden = mode === 'amount';
    const amount = currentAmount();
    const valid = amount != null && amount <= MAX_AMOUNT;
    if (mode !== 'amount') {
      const q = parseNum(qtyInput.value);
      portionCaption.textContent = valid ? `${fmt(q, 2)} × ${fmt(portions[mode].amount, 1)} ${unit} = ${fmt(amount, 1)} ${unit}` : 'Enter a number above 0';
    }
    const n = nutrientsFor(food.per100, valid ? amount : 0);
    for (const key of previewKeys) {
      const v = n[key];
      tiles[key].textContent = !valid || v == null ? '–' : key === 'kcal' ? fmtKcal(v) : fmtG(v);
    }
    submitBtn.disabled = !valid;
  }

  const form = el(
    'form',
    {
      class: 'amount-form',
      onSubmit: (e) => {
        e.preventDefault();
        const amount = currentAmount();
        if (amount == null || amount > MAX_AMOUNT) return;
        const portion = mode === 'amount' ? null : { label: portions[mode].label, qty: parseNum(qtyInput.value) };
        onSubmit({ amount, portion });
      },
    },
    el('div', { class: 'per100-line' }, per100Summary(food)),
    chipsHost,
    amountField,
    qtyField,
    preview,
    submitBtn,
    onDelete
      ? el('button', { class: 'btn btn-danger btn-block', type: 'button', onClick: () => onDelete() }, icon('trash'), 'Delete entry')
      : null,
    getCustomFood(food.id)
      ? el('button', { class: 'btn btn-ghost btn-block', type: 'button', onClick: () => go(`/foodform/${enc(food.id)}`) }, 'Edit this food')
      : null,
  );

  renderChips();
  update();

  const view = el('div', { class: 'view amount-view' }, topbar(title, dayPath(date)), form);
  // focus the number field so the keyboard is ready (runs after the view is attached)
  setTimeout(() => {
    if (mode === 'amount') {
      amountInput.focus();
      amountInput.select();
    }
  }, 0);
  return view;
}
