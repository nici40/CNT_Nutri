// History: every day that has entries, newest first, plus a date picker to reach any day.
import { el, fmtKcal, fmtG, todayKey, addDays, formatDate, isDateKey } from '../util.js';
import { icon } from '../ui.js';
import { go, dayPath } from '../router.js';
import { getSettings, listLoggedDays, dayTotals, getEntries } from '../store.js';

const PAGE = 30;

export function historyView() {
  const today = todayKey();
  const settings = getSettings();
  const days = listLoggedDays();
  let shown = PAGE;

  const jump = el('input', {
    class: 'date-overlay',
    type: 'date',
    max: today,
    'aria-label': 'Jump to a date',
    onChange: (e) => {
      if (isDateKey(e.target.value) && e.target.value <= today) go(dayPath(e.target.value));
    },
  });

  const listHost = el('div');

  function dayLabel(date) {
    if (date === today) return 'Today';
    if (date === addDays(today, -1)) return 'Yesterday';
    return formatDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
  }

  function row(date) {
    const t = dayTotals(date);
    const count = getEntries(date).length;
    return el(
      'button',
      { class: 'row history-row', type: 'button', onClick: () => go(dayPath(date)) },
      el(
        'div',
        { class: 'row-main' },
        el('div', { class: 'row-title' }, dayLabel(date)),
        el('div', { class: 'row-sub' }, `${count} ${count === 1 ? 'entry' : 'entries'}`),
        el(
          'div',
          { class: 'mini-bars', 'aria-hidden': 'true' },
          miniBar('kcal', t.kcal / settings.calorieTarget),
          miniBar('protein', t.protein / settings.proteinTarget),
        ),
      ),
      el(
        'div',
        { class: 'row-side' },
        el('div', { class: 'row-strong' }, `${fmtKcal(t.kcal)} kcal`),
        el('div', { class: 'row-sub' }, `${fmtG(t.protein)} g protein`),
      ),
    );
  }

  function renderList() {
    listHost.replaceChildren();
    if (!days.length) {
      listHost.append(el('div', { class: 'empty card' }, 'No history yet.', el('br'), 'Days you log will appear here.'));
      return;
    }
    listHost.append(el('div', { class: 'card list' }, days.slice(0, shown).map(row)));
    if (days.length > shown) {
      listHost.append(
        el(
          'button',
          {
            class: 'btn btn-block',
            type: 'button',
            onClick: () => {
              shown += PAGE;
              renderList();
            },
          },
          `Show older days (${days.length - shown} more)`,
        ),
      );
    }
  }

  renderList();

  return el(
    'div',
    { class: 'view' },
    el(
      'header',
      { class: 'page-header' },
      el('h1', null, 'History'),
      el('label', { class: 'btn btn-small date-jump', title: 'Jump to a date' }, icon('calendar'), 'Go to date', jump),
    ),
    el('p', { class: 'hint' }, 'Tap a day to view or edit it. Use “Go to date” to add food to a day you missed.'),
    listHost,
  );
}

function miniBar(tone, ratio) {
  return el('div', { class: `mini-bar mini-${tone}` }, el('div', { class: 'mini-fill', style: `width:${Math.min(Math.max(ratio, 0), 1) * 100}%` }));
}
