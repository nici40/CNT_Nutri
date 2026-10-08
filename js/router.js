// Tiny hash router that keeps the phone's Back button sensible.
//
// Routes look like  #/day/2026-10-08  or  #/add/2026-10-08/chicken-breast-raw?x=1
// A "flow" (add food -> pick amount -> save) is closed with closeFlow(), which jumps back to
// where the flow started instead of leaving the half-finished screens in the history.

import { todayKey } from './util.js';

/** Route of the day screen: today lives at the root so the Today tab is always "now". */
export const dayPath = (date) => (date === todayKey() ? '/' : `/day/${date}`);

let renderFn = () => {};
let position = 0; // index of the current history entry (kept in history.state)
let flowOrigin = null; // { position } of the screen the current flow started from

export function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, queryString = ''] = raw.split('?');
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  return { segments, query: Object.fromEntries(new URLSearchParams(queryString)) };
}

export function startRouter(render) {
  renderFn = render;
  history.scrollRestoration = 'manual';
  position = history.state?.position ?? 0;
  history.replaceState({ position }, '', location.href);
  window.addEventListener('popstate', (event) => {
    position = event.state?.position ?? 0;
    renderFn({ keepScroll: false });
  });
  renderFn({ keepScroll: false });
}

/** Navigate to a path such as '/day/2026-10-08'. `flow` marks the current screen as the flow's origin. */
export function go(path, { replace = false, flow = false } = {}) {
  if (flow) flowOrigin = { position };
  const url = `#${path}`;
  if (replace) {
    history.replaceState({ position }, '', url);
  } else {
    position += 1;
    history.pushState({ position }, '', url);
  }
  renderFn({ keepScroll: false });
}

/** Leave a multi-step flow: back to where it started (or to `fallback` if that is unknown). */
export function closeFlow(fallback) {
  if (flowOrigin && flowOrigin.position < position) {
    const steps = position - flowOrigin.position;
    flowOrigin = null;
    history.go(-steps); // popstate re-renders the origin screen
  } else {
    flowOrigin = null;
    go(fallback, { replace: true });
  }
}

/** Back arrow in a screen header. */
export function goBack(fallback) {
  if (position > 0) history.back();
  else go(fallback, { replace: true });
}

/** Re-render the current screen (after data changed), keeping the scroll position. */
export function refresh() {
  renderFn({ keepScroll: true });
}
