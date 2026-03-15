<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getDefects } from '../lib/db.js';

  let defects = $state([]);
  let filterStatus = $state('');

  onMount(async () => {
    await loadDefects();
  });

  async function loadDefects() {
    const filter = filterStatus ? { status: filterStatus } : {};
    defects = await getDefects(filter);
  }

  function statusClass(status) {
    if (status === 'offen') return 'badge-danger';
    if (status === 'behoben') return 'badge-warning';
    if (status === 'verifiziert') return 'badge-success';
    return 'badge-muted';
  }

  function statusLabel(status) {
    const labels = { offen: 'Offen', behoben: 'Behoben', verifiziert: 'Verifiziert' };
    return labels[status] ?? status;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.split(/[-T]/);
    return `${d}.${m}.${y}`;
  }

  // Group by object
  let grouped = $derived.by(() => {
    const groups = new Map();
    for (const d of defects) {
      const key = d.object_name ?? 'Ohne Zuordnung';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    return groups;
  });

  async function handleFilterChange(e) {
    filterStatus = e.target.value;
    await loadDefects();
  }
</script>

<div class="page">
  <div class="header">
    <h1>Mängel ({defects.length})</h1>
    <select onchange={handleFilterChange} value={filterStatus}>
      <option value="">Alle Status</option>
      <option value="offen">Offen</option>
      <option value="behoben">Behoben</option>
      <option value="verifiziert">Verifiziert</option>
    </select>
  </div>

  {#if defects.length === 0}
    <p class="empty">Keine Mängel {filterStatus ? `mit Status "${statusLabel(filterStatus)}"` : ''} vorhanden.</p>
  {:else}
    {#each [...grouped] as [objectName, items]}
      <div class="group">
        <h2 class="group-title">{objectName}</h2>
        <table>
          <thead>
            <tr>
              <th>Prüfpunkt</th>
              <th>Prüfung</th>
              <th>Beschreibung</th>
              <th>Status</th>
              <th>Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {#each items as d}
              <tr class="clickable" onclick={() => currentView.set(`defect:${d.id}`)}>
                <td class="bold">{d.item_label}</td>
                <td>{d.inspection_title}</td>
                <td class="muted">{d.description || '-'}</td>
                <td><span class="badge {statusClass(d.status)}">{statusLabel(d.status)}</span></td>
                <td class="muted">{formatDate(d.created_at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  .header select { padding: 0.375rem 0.5rem; border: 1px solid var(--color-border); border-radius: 0.375rem; font-size: 0.8125rem; }
  .empty { color: var(--color-text-muted); font-style: italic; }
  .group { margin-bottom: 1rem; }
  .group-title { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0 0 0.5rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; font-size: 0.8125rem; }
  td { font-size: 0.875rem; }
  .bold { font-weight: 600; }
  .muted { color: var(--color-text-muted); font-size: 0.8125rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--color-surface); }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
  .badge-danger { background: #fed7d7; color: #9b2c2c; }
  .badge-warning { background: #fefcbf; color: #744210; }
  .badge-success { background: #c6f6d5; color: #22543d; }
  .badge-muted { background: #e2e8f0; color: #4a5568; }
</style>
