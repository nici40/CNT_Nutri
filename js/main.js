// App entry: loads data, wires the router and bottom navigation, shows banners.
import { el, isDateKey, todayKey } from './util.js';
import { icon, toast, showBanner } from './ui.js';
import { startRouter, parseRoute, go, refresh } from './router.js';
import { loadFoods } from './foods.js';
import { loadStore, status, hooks, refreshSnapshots } from './store.js';
import { initUpdates } from './updates.js';
import { dayView } from './views/day.js';
import { addView, amountView, entryView } from './views/add.js';
import { historyView } from './views/history.js';
import { settingsView, myFoodsView } from './views/settings.js';
import { foodFormView } from './views/foodform.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');

// ---------- routing ----------

function notFound() {
  return el('div', { class: 'view' }, el('div', { class: 'empty card' }, 'Page not found.'), el('button', { class: 'btn btn-block', type: 'button', onClick: () => go('/', { replace: true }) }, 'Go to today'));
}

/** Maps the URL to a screen. Returns { node, tab } – tab is the highlighted nav item (null hides the nav). */
function resolve({ segments, query }) {
  const [head, a, b] = segments;
  switch (head) {
    case undefined:
      return { node: dayView(todayKey()), tab: 'today' };
    case 'day':
      if (!isDateKey(a)) return { node: notFound(), tab: null };
      return { node: dayView(a), tab: a === todayKey() ? 'today' : 'history' };
    case 'history':
      return { node: historyView(), tab: 'history' };
    case 'settings':
      return { node: settingsView(), tab: 'settings' };
    case 'add':
      if (!isDateKey(a)) return { node: notFound(), tab: null };
      return { node: b ? amountView(a, b) : addView(a), tab: null };
    case 'entry':
      if (!isDateKey(a) || !b) return { node: notFound(), tab: null };
      return { node: entryView(a, b), tab: null };
    case 'myfoods':
      return { node: myFoodsView(), tab: null };
    case 'foodform':
      return { node: foodFormView(a ?? 'new', query), tab: null };
    default:
      return { node: notFound(), tab: null };
  }
}

let renderedToday = todayKey();

function render({ keepScroll }) {
  const scrollY = window.scrollY;
  let result;
  try {
    result = resolve(parseRoute());
  } catch (err) {
    console.error(err);
    result = { node: el('div', { class: 'view' }, el('div', { class: 'empty card' }, `Something went wrong: ${err.message}`)), tab: null };
  }
  renderedToday = todayKey();
  app.replaceChildren(result.node);
  nav.hidden = result.tab === null;
  for (const link of nav.querySelectorAll('[data-tab]')) {
    const active = link.dataset.tab === result.tab;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  window.scrollTo(0, keepScroll ? scrollY : 0);
}

function buildNav() {
  const items = [
    { tab: 'today', label: 'Today', path: '/', icon: 'today' },
    { tab: 'history', label: 'History', path: '/history', icon: 'history' },
    { tab: 'settings', label: 'Settings', path: '/settings', icon: 'settings' },
  ];
  nav.replaceChildren(
    ...items.map((item) =>
      el(
        'button',
        { class: 'nav-item', type: 'button', dataset: { tab: item.tab }, onClick: () => go(item.path, { replace: true }) },
        icon(item.icon),
        el('span', null, item.label),
      ),
    ),
  );
}

// ---------- banners & lifecycle ----------

function showUpdateBanner() {
  showBanner('update', 'Update available — reload to get the latest version.', {
    actionLabel: 'Reload',
    onAction: () => location.reload(),
    dismissible: false,
    tone: 'update',
  });
}

function showStatusNotices() {
  for (const [i, text] of status.notices.entries()) showBanner(`status-${i}`, text, { tone: 'warn' });
}

/** A phone left open overnight must switch to the new day. */
function watchDayChange() {
  const check = () => {
    if (todayKey() !== renderedToday) {
      const { segments } = parseRoute();
      if (segments.length === 0) refresh(); // on the Today screen
      renderedToday = todayKey();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, 60_000);
}

async function boot() {
  loadStore();
  hooks.onSaveError = () => toast('Could not save — storage may be full. Export a backup from Settings.', { duration: 8000 });
  showStatusNotices();

  // ask the browser not to evict our data when storage is tight
  navigator.storage?.persist?.().catch(() => {});

  buildNav();
  startRouter(render);
  watchDayChange();
  initUpdates(showUpdateBanner);

  // foods.json loads in the background; screens already work from saved snapshots
  await loadFoods();
  refreshSnapshots();
  window.dispatchEvent(new Event('foods-loaded')); // the search screen updates itself
  const head = parseRoute().segments[0];
  if (head === undefined || head === 'day' || head === 'history') refresh();
}

boot();
