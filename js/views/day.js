// The day screen: totals with progress bars, the list of entries, and the Add food button.
// Used for Today and, with another date, for viewing/editing past days.
import { el, fmt, fmtKcal, fmtG, todayKey, addDays, formatDate, isDateKey } from '../util.js';
import { icon, iconButton, amountLabel } from '../ui.js';
import { go, dayPath } from '../router.js';
import { getSettings, getEntries, dayTotals, describeEntry } from '../store.js';

export function dayView(date) {
  const today = todayKey();
  const isToday = date === today;
  const settings = getSettings();
  const entries = getEntries(date);
  const totals = dayTotals(date);

  const title = isToday
    ? 'Today'
    : date === addDays(today, -1)
      ? 'Yesterday'
      : formatDate(date, { weekday: 'long' });
  const subtitle = formatDate(date, { weekday: isToday ? 'long' : undefined, day: 'numeric', month: 'long', year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });

  const datePicker = el('input', {
    class: 'date-overlay',
    type: 'date',
    value: date,
    max: today,
    'aria-label': 'Choose a date',
    onChange: (e) => {
      if (isDateKey(e.target.value) && e.target.value <= today) go(dayPath(e.target.value), { replace: true });
    },
  });

  const nextBtn = iconButton('next', 'Next day', () => go(dayPath(addDays(date, 1)), { replace: true }));
  nextBtn.disabled = isToday; // no logging in the future

  const header = el(
    'header',
    { class: 'day-header' },
    iconButton('prev', 'Previous day', () => go(dayPath(addDays(date, -1)), { replace: true })),
    el('div', { class: 'day-title' }, el('h1', null, title), el('div', { class: 'day-sub' }, subtitle)),
    el('label', { class: 'icon-btn date-btn', title: 'Pick a date' }, icon('calendar'), datePicker),
    nextBtn,
  );

  const pastNote = isToday
    ? null
    : el(
        'div',
        { class: 'note' },
        `Viewing ${formatDate(date, { day: 'numeric', month: 'short' })} — changes here edit that day. `,
        el('button', { class: 'link', type: 'button', onClick: () => go('/', { replace: true }) }, 'Back to today'),
      );

  const summary = el(
    'section',
    { class: 'card summary', 'aria-label': 'Daily totals' },
    el(
      'div',
      { class: 'metrics' },
      metric({ label: 'Calories', total: totals.kcal, target: settings.calorieTarget, unit: 'kcal', tone: 'kcal', overIsBad: true, format: fmtKcal }),
      metric({ label: 'Protein', total: totals.protein, target: settings.proteinTarget, unit: 'g', tone: 'protein', overIsBad: false, format: fmtG }),
    ),
    el(
      'div',
      { class: 'stats' },
      stat('Carbs', totals.carbs, 'g'),
      stat('Fat', totals.fat, 'g'),
      stat('Sugar', totals.sugar, 'g'),
      totals.caffeine > 0 ? stat('Caffeine', totals.caffeine, 'mg') : null,
    ),
  );

  const list = entries.length
    ? el(
        'div',
        { class: 'card list' },
        entries.map((entry) => entryRow(date, entry)),
      )
    : el('div', { class: 'empty card' }, isToday ? 'Nothing logged yet today.' : 'Nothing logged on this day.', el('br'), 'Tap “Add food” to start.');

  const fab = el(
    'button',
    { class: 'fab', type: 'button', onClick: () => go(`/add/${date}`, { flow: true }) },
    icon('plus'),
    el('span', null, 'Add food'),
  );

  return el(
    'div',
    { class: 'view day-view' },
    header,
    pastNote,
    summary,
    el('h2', { class: 'section-title' }, entries.length ? `Logged (${entries.length})` : 'Logged'),
    list,
    fab,
  );
}

function metric({ label, total, target, unit, tone, overIsBad, format }) {
  const ratio = target > 0 ? total / target : 0;
  const over = total > target;
  const diff = Math.abs(target - total);
  const remaining = over
    ? overIsBad
      ? `${format(diff)} ${unit} over`
      : 'Target reached'
    : `${format(diff)} ${unit} left`;
  return el(
    'div',
    { class: `metric metric-${tone}${over && overIsBad ? ' is-over' : ''}${over && !overIsBad ? ' is-done' : ''}` },
    el('div', { class: 'metric-label' }, label),
    el('div', { class: 'metric-value' }, el('span', { class: 'num' }, format(total)), el('span', { class: 'unit' }, unit)),
    el(
      'div',
      {
        class: 'bar',
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': Math.round(target),
        'aria-valuenow': Math.round(total),
      },
      el('div', { class: 'bar-fill', style: `width:${Math.min(ratio, 1) * 100}%` }),
    ),
    el('div', { class: 'metric-target' }, `of ${format(target)} ${unit}`),
    el('div', { class: 'metric-left' }, remaining),
  );
}

function stat(label, value, unit) {
  return el(
    'div',
    { class: 'stat' },
    el('div', { class: 'stat-value' }, `${fmtG(value)}`, el('span', { class: 'unit' }, unit)),
    el('div', { class: 'stat-label' }, label),
  );
}

function entryRow(date, entry) {
  const d = describeEntry(entry);
  const kcal = d.nutrients.kcal;
  const protein = d.nutrients.protein;
  return el(
    'button',
    {
      class: 'row entry-row',
      type: 'button',
      onClick: () => go(`/entry/${date}/${encodeURIComponent(entry.id)}`, { flow: true }),
    },
    el('div', { class: 'row-main' }, el('div', { class: 'row-title' }, d.name), el('div', { class: 'row-sub' }, amountLabel(entry, d.unit))),
    el(
      'div',
      { class: 'row-side' },
      el('div', { class: 'row-strong' }, kcal == null ? '– kcal' : `${fmtKcal(kcal)} kcal`),
      el('div', { class: 'row-sub' }, protein == null ? 'P –' : `P ${fmt(protein, 1)} g`),
    ),
  );
}
