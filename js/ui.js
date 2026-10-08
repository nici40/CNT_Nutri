// Shared UI pieces: icons, headers, toasts, confirm dialog, banners.
import { el, fmt } from './util.js';
import { goBack } from './router.js';

const ICONS = {
  today: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  history: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
};

export function icon(name) {
  const span = document.createElement('span');
  span.className = 'icon';
  // static, trusted markup only
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
  return span;
}

export function iconButton(name, label, onClick, extraClass = '') {
  return el('button', { class: `icon-btn ${extraClass}`.trim(), type: 'button', 'aria-label': label, title: label, onClick }, icon(name));
}

/** Header for screens opened from another screen: back arrow + title (+ right-hand nodes). */
export function topbar(title, backFallback, ...right) {
  return el(
    'header',
    { class: 'topbar' },
    iconButton('back', 'Back', () => goBack(backFallback)),
    el('h1', { class: 'topbar-title' }, title),
    ...right,
  );
}

/** "150 g", "2 large · 100 g", "1.5 cup · 135 g" – how an entry's amount is shown. */
export function amountLabel(entry, unit) {
  const base = `${fmt(entry.amount, 1)} ${unit}`;
  const p = entry.portion;
  if (!p) return base;
  const m = /^1\s+(.+)$/.exec(p.label);
  const portionText = m ? `${fmt(p.qty, 2)} ${m[1]}` : `${fmt(p.qty, 2)} × ${p.label}`;
  return `${portionText} · ${base}`;
}

// ---------- toasts ----------

let toastTimer = null;

/** Brief message at the bottom; optional action button (e.g. Undo). */
export function toast(message, { actionLabel, onAction, duration = 4500 } = {}) {
  const host = document.getElementById('toasts');
  clearTimeout(toastTimer);
  host.replaceChildren();
  const node = el(
    'div',
    { class: 'toast', role: 'status' },
    el('span', { class: 'toast-text' }, message),
    actionLabel
      ? el(
          'button',
          {
            class: 'toast-action',
            type: 'button',
            onClick: () => {
              host.replaceChildren();
              onAction?.();
            },
          },
          actionLabel,
        )
      : null,
  );
  host.append(node);
  toastTimer = setTimeout(() => host.replaceChildren(), duration);
}

// ---------- confirm dialog ----------

/** Resolves true when the user confirms. */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const close = (result) => {
      overlay.remove();
      previousFocus?.focus?.();
      resolve(result);
    };
    const cancelBtn = el('button', { class: 'btn', type: 'button', onClick: () => close(false) }, cancelLabel);
    const okBtn = el(
      'button',
      { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', onClick: () => close(true) },
      confirmLabel,
    );
    const overlay = el(
      'div',
      {
        class: 'modal-overlay',
        onClick: (e) => {
          if (e.target === overlay) close(false);
        },
      },
      el(
        'div',
        { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title },
        el('h2', null, title),
        message ? el('p', null, message) : null,
        el('div', { class: 'modal-actions' }, cancelBtn, okBtn),
      ),
    );
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(false);
    });
    document.body.append(overlay);
    cancelBtn.focus();
  });
}

// ---------- banners (top of the screen) ----------

/** Adds (or replaces) a banner identified by `id`. Returns the node. */
export function showBanner(id, text, { actionLabel, onAction, dismissible = true, tone = 'info' } = {}) {
  const host = document.getElementById('banners');
  host.querySelector(`[data-banner="${id}"]`)?.remove();
  const node = el(
    'div',
    { class: `banner banner-${tone}`, role: 'status', dataset: { banner: id } },
    el('span', { class: 'banner-text' }, text),
    actionLabel ? el('button', { class: 'banner-action', type: 'button', onClick: onAction }, actionLabel) : null,
    dismissible
      ? el('button', { class: 'banner-close', type: 'button', 'aria-label': 'Dismiss', onClick: () => node.remove() }, icon('close'))
      : null,
  );
  host.append(node);
  return node;
}

export function hideBanner(id) {
  document.getElementById('banners')?.querySelector(`[data-banner="${id}"]`)?.remove();
}
