// Small shared helpers: DOM building, number parsing/formatting, local dates, text normalisation.

// ---------- DOM ----------

/** el('div', {class: 'x', onClick: fn}, 'text', childNode, [more children]) */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in node && key !== 'list' && key !== 'form') node[key] = value;
      else node.setAttribute(key, value === true ? '' : value);
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

// ---------- numbers ----------

const formatters = new Map();

/** Locale-aware number, trimmed to at most `maxDecimals` decimals. */
export function fmt(value, maxDecimals = 1) {
  if (value == null || !Number.isFinite(value)) return '–';
  if (Object.is(value, -0)) value = 0;
  let nf = formatters.get(maxDecimals);
  if (!nf) {
    nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: maxDecimals });
    formatters.set(maxDecimals, nf);
  }
  return nf.format(value);
}

export const fmtKcal = (v) => fmt(Math.round(v), 0);
/** Grams/mg: one decimal below 100, none above. */
export const fmtG = (v) => fmt(v, v != null && Math.abs(v) >= 100 ? 0 : 1);

/**
 * Parses what a person types into a number field. Accepts "1,5" as well as "1.5"
 * (phones with Romanian/Russian keyboards produce commas).
 * Returns null for blank input and NaN for garbage.
 */
export function parseNum(text) {
  const s = String(text ?? '').trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

export function round(value, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---------- text ----------

/**
 * Case- and diacritic-insensitive form used for searching:
 * "Brânză de Vaci" -> "branza de vaci", "Ёжик" -> "ежик".
 */
export function norm(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// ---------- dates (always the phone's local timezone) ----------

const pad2 = (n) => String(n).padStart(2, '0');

/** Local calendar day as "YYYY-MM-DD" (never via toISOString, which is UTC). */
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar arithmetic that is safe across daylight-saving changes. */
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

export function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(keyToDate(value)) === value;
}

export function formatDate(key, options) {
  return new Intl.DateTimeFormat(undefined, options).format(keyToDate(key));
}

export const todayKey = () => dateKey(new Date());
