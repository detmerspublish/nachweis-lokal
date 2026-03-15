<script>
  import { currentView } from '../lib/stores/navigation.js';
  import { saveTemplate, saveTemplateItems } from '../lib/db.js';

  let { embedded = false } = $props();

  let csvText = $state('');
  let preview = $state([]);
  let importing = $state(false);
  let result = $state(null);

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(';').map(h => h.trim().toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(';').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
      rows.push(row);
    }
    return rows;
  }

  const FIELD_MAP = {
    name: 'name', vorlage: 'name',
    beschreibung: 'description', beschr: 'description',
    kategorie: 'category',
    intervall: 'interval_days',
    pruefpunkte: 'items',
  };

  function mapRow(raw) {
    const mapped = {};
    for (const [key, val] of Object.entries(raw)) {
      const target = FIELD_MAP[key];
      if (target && val) mapped[target] = val;
    }
    return mapped;
  }

  function handlePreview() {
    const rows = parseCSV(csvText);
    preview = rows.map(mapRow).filter(r => r.name);
  }

  async function handleImport() {
    importing = true;
    let imported = 0, errors = 0;
    for (const row of preview) {
      try {
        const id = await saveTemplate({
          name: row.name,
          description: row.description || null,
          category: row.category || null,
          interval_days: row.interval_days ? parseInt(row.interval_days) : null,
        });
        if (row.items) {
          const items = row.items.split('|').map(label => ({
            label: label.trim(), hint: null, required: true,
          })).filter(i => i.label);
          if (items.length > 0) {
            await saveTemplateItems(id, items);
          }
        }
        imported++;
      } catch { errors++; }
    }
    result = { imported, errors };
    importing = false;
  }
</script>

<div class="page">
  {#if !embedded}
    <h1>Checklisten importieren</h1>
  {/if}
  <p class="hint">
    CSV mit Semikolon-Trennung einfügen. Spalten: Name, Beschreibung, Kategorie, Intervall (Tage), Prüfpunkte (getrennt mit |)
  </p>

  <textarea bind:value={csvText} rows="10" placeholder="Name;Beschreibung;Kategorie;Intervall;Prüfpunkte&#10;Feuerlöscher-Prüfung;Jährliche Sichtprüfung;Brandschutz;365;Plombierung|Druck|Schlauch|Beschilderung"></textarea>

  <div class="actions">
    <button class="btn-secondary" onclick={handlePreview} disabled={!csvText.trim()}>Vorschau</button>
    {#if preview.length > 0 && !result}
      <button class="btn-primary" onclick={handleImport} disabled={importing}>
        {importing ? 'Importiere...' : `${preview.length} Checkliste(n) importieren`}
      </button>
    {/if}
  </div>

  {#if result}
    <div class="result">
      Importiert: {result.imported}, Fehler: {result.errors}
      <button class="btn-secondary" onclick={() => currentView.set('templates')}>Zu den Checklisten</button>
    </div>
  {/if}

  {#if preview.length > 0 && !result}
    <table>
      <thead>
        <tr><th>Name</th><th>Kategorie</th><th>Intervall</th><th>Prüfpunkte</th></tr>
      </thead>
      <tbody>
        {#each preview as row}
          <tr>
            <td>{row.name}</td>
            <td>{row.category ?? '-'}</td>
            <td>{row.interval_days ? `${row.interval_days} Tage` : '-'}</td>
            <td class="muted">{row.items ?? '-'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .page { max-width: 800px; display: flex; flex-direction: column; gap: 1rem; }
  .hint { color: var(--color-text-muted); font-size: 0.8125rem; }
  textarea { width: 100%; font-family: monospace; font-size: 0.8125rem; }
  .actions { display: flex; gap: 0.75rem; }
  .result { padding: 1rem; background: #c6f6d5; border-radius: 0.375rem; display: flex; justify-content: space-between; align-items: center; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; }
  .muted { color: var(--color-text-muted); font-size: 0.8125rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
</style>
