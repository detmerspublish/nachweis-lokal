<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getObject, deleteObject, getObjectHistory } from '../lib/db.js';

  let { objectId } = $props();
  let obj = $state(null);
  let history = $state([]);

  onMount(async () => {
    obj = await getObject(objectId);
    history = await getObjectHistory(objectId);
  });

  async function handleDelete() {
    if (confirm(`"${obj.name}" deaktivieren?`)) {
      await deleteObject(objectId);
      currentView.set('objects');
    }
  }

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
</script>

{#if obj}
  <div class="page">
    <div class="header">
      <h1>{obj.name}</h1>
      <div class="actions">
        <button class="btn-primary" onclick={() => currentView.set(`object:edit:${objectId}`)}>Bearbeiten</button>
        <button class="btn-danger" onclick={handleDelete}>Deaktivieren</button>
      </div>
    </div>

    <div class="meta">
      {#if obj.location}<span>Standort: {obj.location}</span>{/if}
      {#if obj.category}<span>Kategorie: {obj.category}</span>{/if}
      {#if obj.identifier}<span>Kennung: {obj.identifier}</span>{/if}
    </div>

    {#if obj.notes}
      <p class="notes">{obj.notes}</p>
    {/if}

    <h2>Prüfhistorie ({history.length})</h2>
    {#if history.length === 0}
      <p class="empty">Noch keine Prüfungen für dieses Objekt.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Datum</th><th>Checkliste</th><th>Titel</th><th>Prüfer</th><th>Status</th></tr>
        </thead>
        <tbody>
          {#each history as h}
            <tr class="clickable" onclick={() => currentView.set(`inspection:${h.id}`)}>
              <td>{formatDate(h.inspection_date)}</td>
              <td>{h.template_name ?? '-'}</td>
              <td>{h.title}</td>
              <td>{h.inspector}</td>
              <td><span class="badge {statusClass(h.status)}">{h.status}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <button class="btn-secondary" onclick={() => currentView.set('objects')}>Zurück</button>
  </div>
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: center; }
  .actions { display: flex; gap: 0.5rem; }
  .meta { display: flex; gap: 1.5rem; font-size: 0.875rem; color: var(--color-text-muted); }
  .notes { color: var(--color-text-muted); }
  .empty { color: var(--color-text-muted); font-style: italic; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; font-size: 0.8125rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--color-surface); }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
  .badge-success { background: #c6f6d5; color: #22543d; }
  .badge-danger { background: #fed7d7; color: #9b2c2c; }
  .badge-muted { background: #e2e8f0; color: #4a5568; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-danger { padding: 0.5rem 1rem; background: var(--color-danger); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
</style>
