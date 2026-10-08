// The nutrients the app knows about. Every food stores values per 100 g (or per 100 ml for drinks).
// A missing value or null means "unknown" – it is never treated as 0 where that would matter.

export const NUTRIENTS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', group: 'macro' },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'macro' },
  { key: 'carbs', label: 'Carbs', unit: 'g', group: 'macro' },
  { key: 'fat', label: 'Fat', unit: 'g', group: 'macro' },
  { key: 'sugar', label: 'Sugar', unit: 'g', group: 'macro' },
  { key: 'caffeine', label: 'Caffeine', unit: 'mg', group: 'other' },
  { key: 'fibre', label: 'Fibre', unit: 'g', group: 'micro' },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'micro' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'micro' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'micro' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'micro' },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'micro' },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'micro' },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', group: 'micro' },
  { key: 'b12', label: 'Vitamin B12', unit: 'µg', group: 'micro' },
  { key: 'folate', label: 'Folate', unit: 'µg', group: 'micro' },
  { key: 'omega3', label: 'Omega-3', unit: 'g', group: 'micro' },
];

export const NUTRIENT_BY_KEY = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));
export const MACRO_KEYS = NUTRIENTS.filter((n) => n.group === 'macro').map((n) => n.key);
export const MICRO_KEYS = NUTRIENTS.filter((n) => n.group === 'micro').map((n) => n.key);

const isKnown = (v) => typeof v === 'number' && Number.isFinite(v);

/** Values for `amount` g/ml of a food with the given per-100 values. Unknown stays null. */
export function nutrientsFor(per100, amount) {
  const out = {};
  for (const { key } of NUTRIENTS) {
    const v = per100?.[key];
    out[key] = isKnown(v) ? (v * amount) / 100 : null;
  }
  return out;
}

export function emptyTotals() {
  return Object.fromEntries(NUTRIENTS.map((n) => [n.key, 0]));
}

/** Adds the known values of `values` into `totals`. */
export function addKnown(totals, values) {
  for (const { key } of NUTRIENTS) {
    if (isKnown(values[key])) totals[key] += values[key];
  }
}

/** Keeps only known numeric values, rounded – used for compact storage snapshots. */
export function compactPer100(per100) {
  const out = {};
  for (const { key } of NUTRIENTS) {
    const v = per100?.[key];
    if (isKnown(v)) out[key] = Math.round(v * 1000) / 1000;
  }
  return out;
}
