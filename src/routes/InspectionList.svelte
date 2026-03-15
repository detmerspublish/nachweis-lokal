<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { inspections, searchQuery, statusFilter, filteredInspections } from '../lib/stores/inspections.js';
  import { getInspections, getInspectionResults, exportInspectionsCSV, getOrgProfile } from '../lib/db.js';
  import { generateListPdf, generateBatchProtocolPdf } from '../lib/pdf.js';

  let generatingBatch = $state(false);

  onMount(async () => {
    inspections.set(await getInspections());
  });

  function statusClass(status) {
    if (status === 'bestanden') return 'badge-success';
    if (status === 'bemaengelt') return 'badge-danger';
    if (status === 'offen') return 'badge-muted';
    return 'badge-muted';
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  async function handleExportCSV() {
    const csv = await exportInspectionsCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pruefungen-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPDF() {
    const profile = await getOrgProfile();
    const data = $filteredInspections;
    const columns = [
      { text: 'Datum', width: 60 },
      { text: 'Titel', width: '*' },
      { text: 'Checkliste', width: 100 },
      { text: 'Gerät / Raum', width: 80 },
      { text: 'Prüfer', width: 80 },
      { text: 'Status', width: 60 },
    ];
    const rows = data.map(i => [
      formatDate(i.inspection_date), i.title, i.template_name ?? '-',
      i.object_name ?? '-', i.inspector, i.status,
    ]);
    generateListPdf('Prüfungsliste', columns, rows, profile, false);
  }

  async function handleBatchPdf() {
    const data = $filteredInspections;
    if (data.length === 0) return;
    generatingBatch = true;
    const profile = await getOrgProfile();
    const entries = [];
    for (const insp of data) {
      const results = await getInspectionResults(insp.id);
      entries.push({ inspection: insp, results });
    }
    generateBatchProtocolPdf(entries, profile, false);
    generatingBatch = false;
  }
</script>

<div class="page">
  <div class="header">
    <h1>Prüfungen</h1>
    <button class="btn-primary" onclick={() => currentView.set('inspection:new')}>+ Neue Prüfung</button>
  </div>

  <div class="filters">
    <input type="text" placeholder="Suche..." bind:value={$searchQuery} class="search" />
    <select bind:value={$statusFilter}>
      <option value="alle">Alle Status</option>
      <option value="offen">Offen</option>
      <option value="bestanden">Bestanden</option>
      <option value="bemaengelt">Mit Mängeln</option>
      <option value="abgebrochen">Abgebrochen</option>
    </select>
    <button class="btn-secondary" onclick={handleExportCSV}>CSV</button>
    <button class="btn-secondary" onclick={handleExportPDF}>PDF Liste</button>
    <button class="btn-secondary" onclick={handleBatchPdf} disabled={generatingBatch || $filteredInspections.length === 0}>
      {generatingBatch ? 'Erstelle...' : `Sammel-PDF (${$filteredInspections.length})`}
    </button>
  </div>

  {#if $filteredInspections.length === 0}
    <p class="empty">Keine Prüfungen gefunden.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Datum</th>
          <th>Titel</th>
          <th>Checkliste</th>
          <th>Gerät / Raum</th>
          <th>Prüfer</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {#each $filteredInspections as insp}
          <tr class="clickable" onclick={() => currentView.set(`inspection:${insp.id}`)}>
            <td>{formatDate(insp.inspection_date)}</td>
            <td class="bold">{insp.title}</td>
            <td>{insp.template_name ?? '-'}</td>
            <td>{insp.object_name ?? '-'}</td>
            <td>{insp.inspector}</td>
            <td><span class="badge {statusClass(insp.status)}">{insp.status === 'bemaengelt' ? 'Mit Mängeln' : insp.status}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: center; }
  .filters { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .search { flex: 1; max-width: 300px; }
  .empty { color: var(--color-text-muted); font-style: italic; padding: 2rem 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; font-size: 0.8125rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--color-surface); }
  .bold { font-weight: 600; }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
  .badge-success { background: #c6f6d5; color: #22543d; }
  .badge-danger { background: #fed7d7; color: #9b2c2c; }
  .badge-muted { background: #e2e8f0; color: #4a5568; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
</style>
