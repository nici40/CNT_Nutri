// Create / edit a custom food: values per 100 g (or ml), optional portions, optional extra nutrients.
import { el, parseNum } from '../util.js';
import { icon, topbar, toast, confirmDialog } from '../ui.js';
import { go, goBack } from '../router.js';
import { getCustomFood, saveCustomFood, deleteCustomFood } from '../store.js';
import { NUTRIENTS } from '../nutrients.js';

const MACRO_FIELDS = NUTRIENTS.filter((n) => n.group === 'macro');
const EXTRA_FIELDS = NUTRIENTS.filter((n) => n.group !== 'macro');

export function foodFormView(id, query) {
  const isNew = id === 'new';
  const existing = isNew ? null : getCustomFood(id);
  if (!isNew && !existing) {
    return el(
      'div',
      { class: 'view' },
      topbar('Food not found', '/myfoods'),
      el('div', { class: 'empty card' }, 'This custom food no longer exists.'),
    );
  }

  const start = existing ?? { name: query.name ?? '', unit: 'g', aliases: [], per100: {}, portions: [] };
  let unit = start.unit === 'ml' ? 'ml' : 'g';

  // ----- basic fields -----
  const nameInput = el('input', { type: 'text', value: start.name, autocomplete: 'off', required: true, 'aria-label': 'Food name' });
  const aliasInput = el('input', {
    type: 'text',
    value: (Array.isArray(start.aliases) ? start.aliases : []).join(', '),
    autocomplete: 'off',
    placeholder: 'e.g. brânză, творог',
    'aria-label': 'Other names',
  });

  const unitChips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Measured in' });
  const perLabel = el('h2', { class: 'section-title' });
  const portionUnitLabels = [];

  function renderUnit() {
    unitChips.replaceChildren(
      ...['g', 'ml'].map((u) =>
        el(
          'button',
          {
            class: `chip${unit === u ? ' is-active' : ''}`,
            type: 'button',
            'aria-pressed': String(unit === u),
            onClick: () => {
              unit = u;
              renderUnit();
            },
          },
          u === 'g' ? 'Solid (grams)' : 'Liquid (ml)',
        ),
      ),
    );
    perLabel.textContent = `Values per 100 ${unit}`;
    for (const node of portionUnitLabels) node.textContent = unit;
  }

  // ----- nutrient fields -----
  const inputs = {};
  function nutrientField(n, required) {
    const input = el('input', {
      type: 'text',
      inputMode: 'decimal',
      autocomplete: 'off',
      value: Number.isFinite(start.per100?.[n.key]) ? String(start.per100[n.key]) : '',
      'aria-label': `${n.label} per 100`,
    });
    inputs[n.key] = input;
    return el(
      'label',
      { class: 'field' },
      el('span', { class: 'field-label' }, `${n.label} (${n.unit})${required ? ' *' : ''}`),
      input,
    );
  }

  const hasExtras = EXTRA_FIELDS.some((n) => Number.isFinite(start.per100?.[n.key]));

  // ----- portions -----
  const portionsHost = el('div', { class: 'portion-rows' });
  const portionRows = [];
  function addPortionRow(label = '', amount = '') {
    const labelInput = el('input', { type: 'text', value: label, autocomplete: 'off', placeholder: 'e.g. 1 cup', 'aria-label': 'Portion name' });
    const amountInput = el('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', value: String(amount), placeholder: 'amount', 'aria-label': 'Portion amount' });
    const unitSpan = el('span', null, unit);
    portionUnitLabels.push(unitSpan);
    const row = el(
      'div',
      { class: 'portion-row' },
      labelInput,
      el('div', { class: 'input-suffix' }, amountInput, unitSpan),
      el(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          'aria-label': 'Remove portion',
          onClick: () => {
            row.remove();
            portionRows.splice(portionRows.indexOf(entry), 1);
            portionUnitLabels.splice(portionUnitLabels.indexOf(unitSpan), 1);
          },
        },
        icon('trash'),
      ),
    );
    const entry = { labelInput, amountInput };
    portionRows.push(entry);
    portionsHost.append(row);
  }
  for (const p of start.portions ?? []) addPortionRow(p.label, p.amount);

  // ----- validation & saving -----
  const errorBox = el('div', { class: 'form-error', role: 'alert', hidden: true });
  function fail(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return null;
  }

  function collect() {
    errorBox.hidden = true;
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return fail('Enter a name for the food.');
    }

    const per100 = {};
    for (const n of NUTRIENTS) {
      const v = parseNum(inputs[n.key].value);
      if (Number.isNaN(v)) return fail(`${n.label} is not a valid number.`);
      if (v == null) continue;
      if (v < 0) return fail(`${n.label} cannot be negative.`);
      per100[n.key] = v;
    }
    if (per100.kcal == null) return fail('Enter the calories per 100.');
    if (per100.protein == null) return fail('Enter the protein per 100 (use 0 if there is none).');
    if (per100.kcal > 1000) return fail('Calories per 100 look too high (the maximum is about 900 for pure fat).');
    const macroSum = (per100.protein ?? 0) + (per100.carbs ?? 0) + (per100.fat ?? 0);
    if (macroSum > 100.5) return fail('Protein + carbs + fat cannot add up to more than 100 per 100.');
    if (per100.sugar != null && per100.carbs != null && per100.sugar > per100.carbs + 0.5) {
      return fail('Sugar cannot be more than total carbs.');
    }

    const portions = [];
    for (const { labelInput, amountInput } of portionRows) {
      const label = labelInput.value.trim();
      const amount = parseNum(amountInput.value);
      if (!label && amount == null) continue; // untouched row
      if (!label) return fail('Give each portion a name, e.g. “1 cup”.');
      if (!Number.isFinite(amount) || amount <= 0) return fail(`Enter an amount above 0 for the portion “${label}”.`);
      portions.push({ label, amount });
    }

    const seen = new Set();
    const aliases = aliasInput.value
      .split(/[,;\n]/)
      .map((a) => a.trim())
      .filter((a) => a && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()));

    return { name, unit, aliases, per100, portions };
  }

  const form = el(
    'form',
    {
      class: 'food-form',
      onSubmit: (e) => {
        e.preventDefault();
        const data = collect();
        if (!data) return;
        const saved = saveCustomFood({ ...(existing ?? {}), ...data, id: existing?.id });
        toast(isNew ? 'Food saved' : 'Changes saved');
        if (isNew && query.date) go(`/add/${query.date}/${encodeURIComponent(saved.id)}`, { replace: true });
        else goBack('/myfoods');
      },
    },
    el(
      'div',
      { class: 'card form-card' },
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Name *'), nameInput),
      el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Other names (optional, comma-separated, any language)'), aliasInput),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Measured in'), unitChips),
    ),
    perLabel,
    el(
      'div',
      { class: 'card form-card grid-2' },
      MACRO_FIELDS.map((n) => nutrientField(n, n.key === 'kcal' || n.key === 'protein')),
    ),
    el(
      'details',
      { class: 'card more', open: hasExtras },
      el('summary', null, 'More nutrients (optional)'),
      el('p', { class: 'hint' }, 'Leave blank when unknown — blank means “not known”, not zero.'),
      el('div', { class: 'grid-2' }, EXTRA_FIELDS.map((n) => nutrientField(n, false))),
    ),
    el('h2', { class: 'section-title' }, 'Portions (optional)'),
    el(
      'div',
      { class: 'card form-card' },
      portionsHost,
      el('button', { class: 'btn btn-block', type: 'button', onClick: () => addPortionRow() }, icon('plus'), 'Add a portion'),
    ),
    errorBox,
    el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isNew ? 'Save food' : 'Save changes'),
    existing
      ? el(
          'button',
          {
            class: 'btn btn-danger btn-block',
            type: 'button',
            onClick: async () => {
              const ok = await confirmDialog({
                title: `Delete “${existing.name}”?`,
                message: 'Entries you already logged with it keep their values.',
                confirmLabel: 'Delete',
                danger: true,
              });
              if (!ok) return;
              deleteCustomFood(existing.id);
              toast('Food deleted');
              goBack('/myfoods');
            },
          },
          icon('trash'),
          'Delete food',
        )
      : null,
  );

  renderUnit();

  return el('div', { class: 'view' }, topbar(isNew ? 'New custom food' : 'Edit food', '/myfoods'), form);
}
