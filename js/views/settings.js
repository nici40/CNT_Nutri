// Settings (targets, backup, custom foods, about) and the "My foods" list.
import { el, fmt, parseNum, round, todayKey, dateKey, formatDate } from '../util.js';
import { icon, topbar, toast, confirmDialog } from '../ui.js';
import { go, refresh } from '../router.js';
import { foodsMeta } from '../foods.js';
import { checkNow } from '../updates.js';
import {
  status,
  getSettings,
  updateSettings,
  getCustomFoods,
  buildExport,
  markExported,
  parseBackup,
  applyImport,
  summarize,
  hasUndoImport,
  undoImport,
  refreshSnapshots,
  storageBytes,
} from '../store.js';

export function settingsView() {
  const settings = getSettings();

  // ----- targets -----
  const targetField = (label, unit, key, min, max) => {
    const input = el('input', {
      type: 'text',
      inputMode: 'decimal',
      autocomplete: 'off',
      value: String(settings[key]),
      'aria-label': `${label} target`,
      onChange: () => {
        const v = parseNum(input.value);
        if (!Number.isFinite(v) || v < min || v > max) {
          toast(`${label} target must be between ${min} and ${max} ${unit}.`);
          input.value = String(getSettings()[key]);
          return;
        }
        updateSettings({ [key]: round(v, 1) });
        input.value = String(round(v, 1));
        toast(`${label} target saved`);
      },
    });
    return el(
      'label',
      { class: 'field' },
      el('span', { class: 'field-label' }, `${label} target (${unit} per day)`),
      el('div', { class: 'input-suffix' }, input, el('span', null, unit)),
    );
  };

  // ----- backup -----
  async function exportBackup(share) {
    const json = JSON.stringify(buildExport(), null, 2);
    const filename = `nutricnt-backup-${todayKey()}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    try {
      if (share) {
        const file = new File([blob], filename, { type: 'application/json' });
        await navigator.share({ files: [file], title: 'nutriCNT backup' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: filename, hidden: true });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
      markExported();
      toast(share ? 'Backup shared' : `Backup saved as ${filename}`);
      refresh();
    } catch (err) {
      if (err?.name !== 'AbortError') toast(`Export failed: ${err.message || err}`);
    }
  }

  const canShareFiles = (() => {
    try {
      const probe = new File(['{}'], 'x.json', { type: 'application/json' });
      return Boolean(navigator.canShare?.({ files: [probe] }));
    } catch {
      return false;
    }
  })();

  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onChange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      let incoming;
      try {
        incoming = parseBackup(await file.text());
      } catch (err) {
        toast(err.message || 'Could not read that file.', { duration: 7000 });
        return;
      }
      const inc = summarize(incoming);
      const cur = summarize();
      const ok = await confirmDialog({
        title: 'Replace all data with this backup?',
        message: `The backup has ${inc.days} logged days, ${inc.entries} entries and ${inc.customFoods} custom foods. This phone currently has ${cur.days} days, ${cur.entries} entries and ${cur.customFoods} custom foods, which will be replaced. You can undo the import afterwards from Settings.`,
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
      try {
        applyImport(incoming);
        refreshSnapshots();
        toast('Backup imported');
        go('/', { replace: true });
      } catch (err) {
        toast(err.message || 'Import failed.', { duration: 7000 });
      }
    },
  });

  const undoSection = hasUndoImport()
    ? el(
        'button',
        {
          class: 'btn btn-block',
          type: 'button',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Undo the last import?',
              message: 'Your data from just before the import will be restored. Anything logged since will be lost.',
              confirmLabel: 'Restore',
              danger: true,
            });
            if (!ok) return;
            try {
              undoImport();
              toast('Previous data restored');
              go('/', { replace: true });
            } catch (err) {
              toast(err.message || 'Could not restore.');
            }
          },
        },
        'Undo last import',
      )
    : null;

  const last = settings.lastExportAt;
  const lastText = last ? `Last backup: ${formatDate(dateKey(new Date(last)), { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No backup yet';
  const sum = summarize();

  // ----- about -----
  const updateBtn = el(
    'button',
    {
      class: 'btn btn-block',
      type: 'button',
      onClick: async () => {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Checking…';
        const result = await checkNow();
        updateBtn.disabled = false;
        updateBtn.textContent = 'Check for updates';
        if (result === true) toast('Update found — use the banner at the top to reload.');
        else if (result === false) toast('You have the latest version.');
        else toast('Could not check right now (offline?).');
      },
    },
    'Check for updates',
  );

  return el(
    'div',
    { class: 'view' },
    el('header', { class: 'page-header' }, el('h1', null, 'Settings')),

    el('h2', { class: 'section-title' }, 'Daily targets'),
    el('div', { class: 'card form-card' }, targetField('Calorie', 'kcal', 'calorieTarget', 500, 10000), targetField('Protein', 'g', 'proteinTarget', 10, 500)),

    el('h2', { class: 'section-title' }, 'Foods'),
    el(
      'div',
      { class: 'card list' },
      el(
        'button',
        { class: 'row', type: 'button', onClick: () => go('/myfoods') },
        el('div', { class: 'row-main' }, el('div', { class: 'row-title' }, 'My custom foods'), el('div', { class: 'row-sub' }, `${getCustomFoods().length} saved on this phone`)),
        icon('chevron'),
      ),
    ),

    el('h2', { class: 'section-title' }, 'Backup'),
    el(
      'div',
      { class: 'card form-card' },
      el('p', { class: 'hint' }, `${sum.days} days · ${sum.entries} entries · ${sum.customFoods} custom foods · ~${Math.max(1, Math.round(storageBytes() / 1024))} KB. ${lastText}.`),
      el('p', { class: 'hint' }, 'Your data lives only on this phone. Export a backup now and then.'),
      el(
        'div',
        { class: 'btn-row' },
        el('button', { class: 'btn btn-primary', type: 'button', onClick: () => exportBackup(false) }, 'Export backup'),
        canShareFiles ? el('button', { class: 'btn', type: 'button', onClick: () => exportBackup(true) }, 'Share…') : null,
      ),
      el('button', { class: 'btn btn-block', type: 'button', disabled: status.readOnly, onClick: () => fileInput.click() }, 'Import backup…'),
      fileInput,
      undoSection,
    ),

    el('h2', { class: 'section-title' }, 'About'),
    el(
      'div',
      { class: 'card form-card' },
      el(
        'p',
        { class: 'hint' },
        foodsMeta.loaded
          ? `Food database: ${foodsMeta.builtInCount} foods${foodsMeta.updated ? `, updated ${foodsMeta.updated}` : ''}.`
          : `Food database not loaded${foodsMeta.error ? ` (${foodsMeta.error})` : ''}.`,
      ),
      updateBtn,
      el('button', { class: 'btn btn-block', type: 'button', onClick: () => location.reload() }, 'Reload app'),
    ),
  );
}

export function myFoodsView() {
  const foods = getCustomFoods().slice().sort((a, b) => a.name.localeCompare(b.name));
  const rows = foods.map((food) =>
    el(
      'button',
      { class: 'row', type: 'button', onClick: () => go(`/foodform/${encodeURIComponent(food.id)}`) },
      el(
        'div',
        { class: 'row-main' },
        el('div', { class: 'row-title' }, food.name),
        el('div', { class: 'row-sub' }, `per 100 ${food.unit ?? 'g'}: ${fmt(food.per100?.kcal, 0)} kcal · ${fmt(food.per100?.protein, 1)} g protein`),
      ),
      icon('chevron'),
    ),
  );
  return el(
    'div',
    { class: 'view' },
    topbar('My foods', '/settings'),
    foods.length
      ? el('div', { class: 'card list' }, rows)
      : el('div', { class: 'empty card' }, 'No custom foods yet.', el('br'), 'Add products that are not in the database, with values per 100 g.'),
    el('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: () => go('/foodform/new', { flow: true }) }, icon('plus'), 'New custom food'),
  );
}
