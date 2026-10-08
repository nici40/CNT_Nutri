// Food database: foods.json (shipped with the app) + custom foods (saved on the phone), and search.
import { norm } from './util.js';

export const foodsMeta = { loaded: false, error: null, updated: null, builtInCount: 0 };

let builtIn = [];
let custom = [];
let byId = new Map();
let index = []; // [{ food, isCustom, variants: [{ raw, n }] }]

const isStr = (v) => typeof v === 'string' && v.trim() !== '';

/** Aliases may be an array or an object like { en: [...], ro: [...], ru: [...] }. */
function flatAliases(aliases) {
  if (!aliases) return [];
  const list = Array.isArray(aliases) ? aliases : Object.values(aliases).flat();
  return list.filter(isStr);
}

/** Returns a cleaned food, or null when it is unusable. */
function cleanFood(raw) {
  if (!raw || !isStr(raw.id) || !isStr(raw.name) || typeof raw.per100 !== 'object' || raw.per100 === null) return null;
  const portions = (Array.isArray(raw.portions) ? raw.portions : [])
    .filter((p) => p && isStr(p.label) && Number.isFinite(p.amount) && p.amount > 0)
    .map((p) => ({ label: p.label.trim(), amount: p.amount }));
  return { ...raw, unit: raw.unit === 'ml' ? 'ml' : 'g', portions };
}

function rebuild() {
  byId = new Map();
  index = [];
  const sources = [
    [builtIn, false],
    [custom, true],
  ];
  for (const [list, isCustom] of sources) {
    for (const food of list) {
      byId.set(food.id, food);
      const raws = [food.name, ...flatAliases(food.aliases)];
      const variants = raws.map((raw) => ({ raw, n: norm(raw) })).filter((v) => v.n);
      index.push({ food, isCustom, variants });
    }
  }
}

/** Fetches foods.json (revalidating so Git updates arrive) and rebuilds the search index. */
export async function loadFoods() {
  try {
    const res = await fetch('foods.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json) ? json : json.foods;
    if (!Array.isArray(list)) throw new Error('foods.json has no "foods" list');
    builtIn = [];
    for (const raw of list) {
      const food = cleanFood(raw);
      if (food) builtIn.push(food);
      else console.warn('Skipping invalid food in foods.json:', raw);
    }
    foodsMeta.loaded = true;
    foodsMeta.error = null;
    foodsMeta.updated = json.updated ?? null;
    foodsMeta.builtInCount = builtIn.length;
  } catch (err) {
    foodsMeta.error = err.message || String(err);
    console.warn('Could not load foods.json:', err);
  }
  rebuild();
}

export function setCustomFoods(list) {
  custom = list.map(cleanFood).filter(Boolean);
  rebuild();
}

export const getFood = (id) => byId.get(id) ?? null;

function scoreVariant(text, tokens, whole) {
  const words = text.split(' ');
  let allPrefix = true;
  for (const t of tokens) {
    if (!text.includes(t)) return 0;
    if (!words.some((w) => w.startsWith(t))) allPrefix = false;
  }
  let score = allPrefix ? 50 : 20;
  if (text === whole) score += 50;
  else if (text.startsWith(whole)) score += 30;
  return score - Math.min(text.length, 40) * 0.1;
}

/**
 * Searches names and aliases in every language at once.
 * Case- and diacritic-insensitive; every word typed must appear in the same name/alias.
 * Returns [{ food, isCustom, matchedAlias }] best match first.
 */
export function searchFoods(query, limit = 40) {
  const whole = norm(query);
  if (!whole) return [];
  const tokens = whole.split(' ');
  const results = [];
  for (const entry of index) {
    let best = null;
    for (const variant of entry.variants) {
      const score = scoreVariant(variant.n, tokens, whole);
      if (score > 0 && (!best || score > best.score)) best = { score, variant };
    }
    if (best) {
      results.push({
        food: entry.food,
        isCustom: entry.isCustom,
        score: best.score + (entry.isCustom ? 3 : 0),
        matchedAlias: best.variant.raw !== entry.food.name ? best.variant.raw : null,
      });
    }
  }
  results.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return results.slice(0, limit);
}
