// All persistent data lives in one localStorage entry. Rules this module follows:
//  - every storage access is wrapped in try/catch (private mode, blocked storage, full disk);
//  - the data carries a schemaVersion and is run through migrate() on load, so a future app
//    version can reshape it without wiping anything;
//  - before migrating, the untouched old data is copied to a backup key;
//  - data that cannot be read or is from a NEWER app version is never overwritten (read-only mode).
import { nutrientsFor, emptyTotals, addKnown, compactPer100 } from './nutrients.js';
import { getFood, setCustomFoods } from './foods.js';
import { isDateKey, round, uid } from './util.js';

export const SCHEMA_VERSION = 1;

const KEY = 'nutricnt:data';
const BEFORE_IMPORT_KEY = 'nutricnt:before-import';
const RECENTS_LIMIT = 30;

const DEFAULT_SETTINGS = {
  calorieTarget: 2000,
  proteinTarget: 100,
  lastExportAt: null,
};

/** Shown to the user by main.js: storage problems and read-only mode. */
export const status = { storageOk: true, readOnly: false, notices: [] };
export const hooks = { onSaveError: null };

let data = emptyData();

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    customFoods: [],
    foodSnapshots: {}, // foodId -> copy of the food as last seen (keeps history readable if a food disappears)
    days: {}, // 'YYYY-MM-DD' -> { entries: [{ id, foodId, amount, portion, at }] }
    recents: [], // [{ foodId, amount, portion }] most recent first
  };
}

// ---------- migration ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * One function per version step: MIGRATIONS[n] turns schema n into schema n+1.
 * When the data shape changes, bump SCHEMA_VERSION and add the step here.
 */
const MIGRATIONS = {
  // 0 -> 1: data written before schemaVersion existed (or hand-made). normalize() fills the structure.
  0: (d) => ({ ...d }),
};

export class NewerSchemaError extends Error {}

export function migrate(raw) {
  let d = isObj(raw) ? { ...raw } : {};
  let v = Number.isInteger(d.schemaVersion) && d.schemaVersion >= 0 ? d.schemaVersion : 0;
  if (v > SCHEMA_VERSION) {
    throw new NewerSchemaError(`Data is from a newer version of the app (schema ${v}, this app knows ${SCHEMA_VERSION}).`);
  }
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schema version ${v}`);
    d = step(d);
    v += 1;
  }
  d.schemaVersion = SCHEMA_VERSION;
  return normalize(d);
}

const validEntry = (e) =>
  isObj(e) && typeof e.id === 'string' && typeof e.foodId === 'string' && Number.isFinite(e.amount) && e.amount > 0;

/** Fills defaults and drops structurally broken records. Unknown extra fields are kept. */
function normalize(d) {
  const settings = { ...DEFAULT_SETTINGS, ...(isObj(d.settings) ? d.settings : {}) };
  for (const k of ['calorieTarget', 'proteinTarget']) {
    if (!(Number.isFinite(settings[k]) && settings[k] > 0)) settings[k] = DEFAULT_SETTINGS[k];
  }

  const customFoods = (Array.isArray(d.customFoods) ? d.customFoods : []).filter(
    (f) => isObj(f) && typeof f.id === 'string' && typeof f.name === 'string' && isObj(f.per100),
  );

  const foodSnapshots = {};
  if (isObj(d.foodSnapshots)) {
    for (const [id, s] of Object.entries(d.foodSnapshots)) {
      if (isObj(s) && typeof s.name === 'string' && isObj(s.per100)) foodSnapshots[id] = s;
    }
  }

  const days = {};
  if (isObj(d.days)) {
    for (const [date, day] of Object.entries(d.days)) {
      if (!isDateKey(date) || !isObj(day)) continue;
      const entries = (Array.isArray(day.entries) ? day.entries : []).filter(validEntry).map((e) => ({
        ...e,
        portion: isObj(e.portion) ? e.portion : null,
        at: Number.isFinite(e.at) ? e.at : 0,
      }));
      const hasExtras = Object.keys(day).some((k) => k !== 'entries');
      if (entries.length || hasExtras) days[date] = { ...day, entries };
    }
  }

  const recents = (Array.isArray(d.recents) ? d.recents : [])
    .filter((r) => isObj(r) && typeof r.foodId === 'string' && Number.isFinite(r.amount) && r.amount > 0)
    .slice(0, RECENTS_LIMIT);

  return { ...d, schemaVersion: SCHEMA_VERSION, settings, customFoods, foodSnapshots, days, recents };
}

// ---------- localStorage wrappers ----------

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function save() {
  if (!status.storageOk || status.readOnly) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    hooks.onSaveError?.(err);
    return false;
  }
}

// ---------- loading ----------

export function loadStore() {
  data = emptyData();
  status.readOnly = false;
  status.notices = [];

  try {
    localStorage.setItem('nutricnt:probe', '1');
    localStorage.removeItem('nutricnt:probe');
    status.storageOk = true;
  } catch {
    status.storageOk = false;
    status.notices.push('Storage is blocked in this browser, so what you log will not be saved. Open the app normally (not in a private window).');
    setCustomFoods(data.customFoods);
    return;
  }

  const raw = lsGet(KEY);
  if (raw == null) {
    setCustomFoods(data.customFoods);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const kept = lsSet(`${KEY}:corrupt`, raw);
    status.notices.push(
      kept
        ? 'Saved data could not be read. A copy was kept and the app started empty.'
        : 'Saved data could not be read, so it was left untouched and changes will not be saved.',
    );
    if (!kept) status.readOnly = true;
    setCustomFoods(data.customFoods);
    return;
  }

  const oldVersion = isObj(parsed) && Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : 0;
  try {
    data = migrate(parsed);
    if (oldVersion < SCHEMA_VERSION) {
      lsSet(`${KEY}:backup-v${oldVersion}`, raw); // untouched copy of the pre-migration data
      save();
    }
  } catch (err) {
    // Never overwrite data we cannot understand: run read-only instead.
    status.readOnly = true;
    status.notices.push(
      err instanceof NewerSchemaError
        ? 'Your saved data was written by a newer version of the app. It is shown read-only; reload to get the latest app version.'
        : 'Your saved data could not be upgraded, so it is left untouched and changes will not be saved.',
    );
    data = normalizeLoose(parsed);
  }
  setCustomFoods(data.customFoods);
}

function normalizeLoose(parsed) {
  try {
    return normalize(isObj(parsed) ? parsed : {});
  } catch {
    return emptyData();
  }
}

// ---------- settings ----------

export const getSettings = () => data.settings;

export function updateSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  return save();
}

// ---------- foods: snapshots and resolution ----------

function snapshotOf(food) {
  return {
    id: food.id,
    name: food.name,
    unit: food.unit === 'ml' ? 'ml' : 'g',
    per100: compactPer100(food.per100),
    portions: (food.portions ?? []).map((p) => ({ label: p.label, amount: p.amount })),
  };
}

/** Live food (foods.json / custom) first; otherwise the copy saved when it was logged. */
export function resolveFood(foodId) {
  return getFood(foodId) ?? data.foodSnapshots[foodId] ?? null;
}

function rememberFood(food) {
  const snap = snapshotOf(food);
  if (JSON.stringify(data.foodSnapshots[food.id]) !== JSON.stringify(snap)) data.foodSnapshots[food.id] = snap;
}

/** After foods.json loads: keep snapshots in step with the live foods. */
export function refreshSnapshots() {
  let changed = false;
  for (const id of Object.keys(data.foodSnapshots)) {
    const live = getFood(id);
    if (!live) continue;
    const snap = snapshotOf(live);
    if (JSON.stringify(data.foodSnapshots[id]) !== JSON.stringify(snap)) {
      data.foodSnapshots[id] = snap;
      changed = true;
    }
  }
  if (changed) save();
}

// ---------- entries ----------

export const getEntries = (date) => data.days[date]?.entries ?? [];
export const findEntry = (date, id) => getEntries(date).find((e) => e.id === id) ?? null;

function cleanPortion(portion) {
  if (!portion || !portion.label || !Number.isFinite(portion.qty) || portion.qty <= 0) return null;
  return { label: portion.label, qty: round(portion.qty, 3) };
}

function touchRecent({ foodId, amount, portion }) {
  data.recents = [{ foodId, amount, portion }, ...data.recents.filter((r) => r.foodId !== foodId)].slice(0, RECENTS_LIMIT);
}

/** amount is the total in g/ml; portion ({ label, qty }) records how it was entered. */
export function addEntry(date, { foodId, amount, portion }) {
  const food = resolveFood(foodId);
  if (!food) throw new Error('Unknown food');
  rememberFood(food);
  const entry = { id: uid('e'), foodId, amount: round(amount, 2), portion: cleanPortion(portion), at: Date.now() };
  (data.days[date] ??= { entries: [] }).entries.push(entry);
  touchRecent(entry);
  save();
  return entry;
}

export function updateEntry(date, id, { amount, portion }) {
  const entry = findEntry(date, id);
  if (!entry) return null;
  entry.amount = round(amount, 2);
  entry.portion = cleanPortion(portion);
  const food = resolveFood(entry.foodId);
  if (food) rememberFood(food);
  save();
  return entry;
}

export function removeEntry(date, id) {
  const entries = data.days[date]?.entries;
  const index = entries ? entries.findIndex((e) => e.id === id) : -1;
  if (index < 0) return null;
  const [entry] = entries.splice(index, 1);
  const day = data.days[date];
  if (!entries.length && Object.keys(day).every((k) => k === 'entries')) delete data.days[date];
  save();
  return { entry, index };
}

export function restoreEntry(date, entry, index) {
  const day = (data.days[date] ??= { entries: [] });
  day.entries.splice(Math.min(index, day.entries.length), 0, entry);
  save();
}

export function describeEntry(entry) {
  const food = resolveFood(entry.foodId);
  return {
    entry,
    food,
    name: food?.name ?? 'Unknown food',
    unit: food?.unit ?? 'g',
    nutrients: nutrientsFor(food?.per100, entry.amount),
  };
}

export function totalsFor(entries) {
  const totals = emptyTotals();
  for (const entry of entries) addKnown(totals, describeEntry(entry).nutrients);
  return totals;
}

export const dayTotals = (date) => totalsFor(getEntries(date));

/** Days with at least one entry, newest first. */
export function listLoggedDays() {
  return Object.keys(data.days)
    .filter((d) => data.days[d].entries.length > 0)
    .sort()
    .reverse();
}

// ---------- recents ----------

export function getRecents() {
  return data.recents
    .map((r) => ({ ...r, food: resolveFood(r.foodId) }))
    .filter((r) => r.food);
}

// ---------- custom foods ----------

export const getCustomFoods = () => data.customFoods;
export const getCustomFood = (id) => data.customFoods.find((f) => f.id === id) ?? null;

/** Creates (no id) or updates (with id) a custom food. Returns the saved food. */
export function saveCustomFood(food) {
  const record = { ...food, id: food.id ?? uid('custom-'), source: 'custom' };
  const i = data.customFoods.findIndex((f) => f.id === record.id);
  if (i >= 0) data.customFoods[i] = record;
  else data.customFoods.push(record);
  setCustomFoods(data.customFoods);
  if (data.foodSnapshots[record.id]) rememberFood(getFood(record.id));
  save();
  return record;
}

export function deleteCustomFood(id) {
  const food = getCustomFood(id);
  // keep a snapshot so past entries still show the right name and values
  if (food && !data.foodSnapshots[id]) {
    const live = getFood(id);
    if (live) rememberFood(live);
  }
  data.customFoods = data.customFoods.filter((f) => f.id !== id);
  data.recents = data.recents.filter((r) => r.foodId !== id);
  setCustomFoods(data.customFoods);
  save();
}

// ---------- backup: export / import ----------

/** Rough size of the saved data, in bytes (localStorage counts UTF-16, so this is a lower bound). */
export const storageBytes = () => (lsGet(KEY) ?? '').length;

export function buildExport() {
  return { app: 'nutricnt', exportedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, data };
}

export function markExported() {
  data.settings.lastExportAt = Date.now();
  save();
}

export function summarize(d = data) {
  let entries = 0;
  for (const day of Object.values(d.days)) entries += day.entries.length;
  return { days: Object.keys(d.days).length, entries, customFoods: d.customFoods.length };
}

/** Parses and validates a backup file's text. Throws a readable Error when it is not usable. */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isObj(obj) || obj.app !== 'nutricnt' || !isObj(obj.data)) {
    throw new Error('This does not look like a nutriCNT backup file.');
  }
  try {
    return migrate(obj.data);
  } catch (err) {
    if (err instanceof NewerSchemaError) throw new Error('This backup was made by a newer version of the app. Reload the app to update it, then try again.');
    throw err;
  }
}

/** Replaces all data with `incoming` (already validated). The previous data is kept for one undo. */
export function applyImport(incoming) {
  if (status.readOnly || !status.storageOk) throw new Error('Storage is not writable right now.');
  const previousRaw = lsGet(KEY);
  const previous = data;
  data = incoming;
  if (!save()) {
    data = previous;
    throw new Error('Could not save the imported data (storage full?). Nothing was changed.');
  }
  if (previousRaw) lsSet(BEFORE_IMPORT_KEY, previousRaw);
  setCustomFoods(data.customFoods);
}

export const hasUndoImport = () => lsGet(BEFORE_IMPORT_KEY) != null;

export function undoImport() {
  const raw = lsGet(BEFORE_IMPORT_KEY);
  if (raw == null) throw new Error('Nothing to restore.');
  const restored = migrate(JSON.parse(raw));
  const previous = data;
  data = restored;
  if (!save()) {
    data = previous;
    throw new Error('Could not save the restored data.');
  }
  lsRemove(BEFORE_IMPORT_KEY);
  setCustomFoods(data.customFoods);
}
