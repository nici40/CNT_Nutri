// Registers the service worker and tells the user when a newer version has been deployed.
// The worker re-fetches the app files and compares them with its cached copies (see sw.js).

const CHECK_INTERVAL_MS = 60_000; // at most one automatic check per minute

let registration = null;
let lastCheck = 0;
let onUpdate = () => {};
let pendingCheck = null; // resolver for checkNow()

export async function initUpdates(callback) {
  onUpdate = callback;
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'UPDATE_CHECK_RESULT') return;
    if (event.data.changed) onUpdate();
    pendingCheck?.(event.data.changed);
    pendingCheck = null;
  });

  // A new service worker (sw.js itself changed) took over while the app was open.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate();
  });

  try {
    registration = await navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return;
  }

  setTimeout(() => check(), 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_INTERVAL_MS) check();
  });
}

function check() {
  lastCheck = Date.now();
  registration?.update().catch(() => {});
  const worker = navigator.serviceWorker.controller || registration?.active;
  worker?.postMessage({ type: 'CHECK_UPDATE' });
  return Boolean(worker);
}

/**
 * Manual "check for updates". Resolves true (update found), false (up to date),
 * or null (no service worker / offline / no answer).
 */
export function checkNow() {
  return new Promise((resolve) => {
    if (!check()) return resolve(null);
    const timer = setTimeout(() => {
      pendingCheck = null;
      resolve(null);
    }, 8000);
    pendingCheck = (changed) => {
      clearTimeout(timer);
      resolve(changed);
    };
  });
}
