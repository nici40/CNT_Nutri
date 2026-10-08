# nutriCNT

A personal nutrition tracker that runs as an installable web app (PWA) on your phone.
Plain HTML, CSS and JavaScript — no frameworks, no build step, no backend. Your data is stored on the
phone itself; the food database is a JSON file in this repository.

**Status: Phase 1 (core app).** Phase 2 adds the full food database with micronutrients, Phase 3 adds
long-term nutrient reports.

## What it does (Phase 1)

- **Today** — big protein and calorie totals with progress bars towards the targets you set in
  Settings, plus carbs, fat, sugar (and caffeine when you had some).
- **Add food** — search by name, then enter grams/ml **or** pick a portion ("1 cup · 90 g", "1 can · 355 ml").
  Values are calculated live. Search works in **English, Romanian and Russian**, ignoring case and
  diacritics (`branza` finds `brânză`, `ТВОРОГ` finds `творог`).
- **Recent foods** — shown when the search box is empty; the **+** button re-adds the last amount in one tap
  (with Undo).
- **Edit / delete** entries by tapping them.
- **Custom foods** — values per 100 g (or 100 ml), optional portions and optional extra nutrients; saved on the
  phone and included in search. Manage them in Settings → My custom foods.
- **History** — every logged day, tap to view or edit; "Go to date" reaches any day, including ones you missed.
- **Backup** — Settings → Export / Import all data as one JSON file.
- **Offline** — after the first visit the app starts and works without a connection.
- Dates use the phone's local timezone; a day runs 00:00–23:59.

## Publishing on GitHub Pages

1. Push this repository to GitHub.
2. Repository **Settings → Pages → Build and deployment**: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. After a minute the app is at `https://<your-user>.github.io/<repo-name>/`.

All paths are relative, so it works under a repository sub-path. `.nojekyll` stops GitHub from processing the files.

## Installing on the phone

- **Android (Chrome):** open the address → menu ⋮ → *Install app* / *Add to Home screen*.
- **iPhone (Safari):** open the address → Share → *Add to Home Screen*.

> **iPhone note:** the installed app and Safari keep **separate** storage. Install first, then use only the
> installed app. To move data between them (or between phones), use Export and Import.

## Your data and updates

- Everything is in `localStorage` under the key `nutricnt:data`, with a `schemaVersion` field. On load the data
  goes through a migration function, so future versions can change the format without wiping anything. Before a
  migration the old data is copied to `nutricnt:data:backup-v<N>`.
- If saved data can't be read, or was written by a *newer* version of the app, the app starts read-only and
  **never overwrites it**. An unreadable file is kept as `nutricnt:data:corrupt`.
- Importing a backup replaces everything on the phone but keeps the previous data for one **Undo last import**.
- Past entries use the *current* values of a food, so correcting a food in `foods.json` (or editing a custom food)
  also corrects history. If a food is later removed, the values saved when you logged it are used instead.

### How updates reach the phone

- The service worker (`sw.js`) is **network-first** for the app files and `foods.json`: when online it always
  fetches the latest from GitHub Pages (revalidating, so GitHub's 10-minute cache doesn't delay it) and only
  falls back to its saved copy when offline or the connection is very slow (4 s).
- A few seconds after opening, and whenever you come back to the app (at most once a minute), it checks whether
  anything changed. If so, a green **"Update available — Reload"** banner appears. Settings → *Check for updates*
  does the same on demand.
- There is no version number to bump: the check compares the actual files.
- If you add a new file to the project, add it to the `PRECACHE` list at the top of `sw.js` so it is available
  on the very first offline start.

## Adding a food to `foods.json`

Open `foods.json`, add an object to the `foods` list, commit and push. The app picks it up on the next open
(or via the update banner). Example (illustrative numbers — use the label of your own product):

```json
{
  "id": "brinza-telemea",
  "name": "Telemea cheese",
  "aliases": {
    "en": ["feta-style cheese"],
    "ro": ["telemea", "brânză telemea"],
    "ru": ["брынза", "телемеа"]
  },
  "unit": "g",
  "per100": { "kcal": 264, "protein": 14, "carbs": 1.4, "fat": 21, "sugar": 1.4 },
  "portions": [{ "label": "1 slice", "amount": 30 }],
  "source": "Package label"
}
```

| field | meaning |
|---|---|
| `id` | unique, never changes once you have logged the food (entries refer to it) |
| `name` | English display name |
| `aliases` | other names, per language; search checks the name and all aliases (diacritics don't matter) |
| `unit` | `"g"` for solids or `"ml"` for drinks — all values are per 100 of this unit |
| `per100` | `kcal`, `protein`, `carbs`, `fat`, `sugar` (g) and optionally `caffeine` (mg) and micronutrients: `fibre` (g), `iron`, `calcium`, `magnesium`, `potassium`, `zinc`, `vitC` (mg), `vitD`, `b12`, `folate` (µg), `omega3` (g). **Leave out or use `null` for unknown values — never `0`.** |
| `portions` | optional list of `{ "label", "amount" }` where `amount` is in g/ml. Put the most common portion **first** — it is the default. |
| `source` | where the numbers came from |

Bump `"updated"` at the top of the file to the date of your change (it is shown in Settings so you can see which
version is on the phone).

## Project layout

```
index.html, styles.css, manifest.webmanifest, sw.js   app shell, PWA manifest, service worker
foods.json                                            food database (data only)
icons/                                                app icons
js/main.js                                            startup, routing table, bottom navigation
js/store.js                                           saved data: storage, migration, entries, backup
js/foods.js                                           food database + multilingual search
js/nutrients.js                                       list of nutrients and unit/scaling helpers
js/router.js, js/ui.js, js/util.js, js/updates.js     router, shared UI pieces, helpers, update banner
js/views/                                             screens: day, add, history, settings, food form
```

To change the saved-data format later: bump `SCHEMA_VERSION` in `js/store.js` and add a step to `MIGRATIONS`.

## Running locally

Any static file server works, for example:

```
npx serve .
```

(The service worker only runs on `https://` or `http://localhost`.)
