<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getDefect, updateDefectStatus, createReinspection } from '../lib/db.js';

  let { defectId } = $props();
  let defect = $state(null);
  let saving = $state(false);

  onMount(async () => {
    defect = await getDefect(defectId);
  });

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
    const parts = iso.split(/[-T ]/);
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  async function handleStatusChange(newStatus) {
    saving = true;
    await updateDefectStatus(defectId, newStatus);
    defect = await getDefect(defectId);
    saving = false;
  }

  async function handleReinspection() {
    saving = true;
    const newId = await createReinspection(defect.inspection_id, [defectId]);
    saving = false;
    if (newId) {
      currentView.set(`inspection:execute:${newId}`);
    }
  }
</script>

{#if defect}
  <div class="page">
    <div class="header">
      <div>
        <h1>Mangel: {defect.item_label}</h1>
        <span class="badge {statusClass(defect.status)}">{statusLabel(defect.status)}</span>
      </div>
      <div class="actions">
        {#if defect.status === 'offen'}
          <button class="btn-primary" onclick={() => handleStatusChange('behoben')} disabled={saving}>Als behoben markieren</button>
          <button class="btn-secondary" onclick={handleReinspection} disabled={saving}>Nachprüfung starten</button>
        {:else if defect.status === 'behoben'}
          <button class="btn-primary" onclick={() => handleStatusChange('verifiziert')} disabled={saving}>Verifizieren</button>
          <button class="btn-secondary" onclick={() => handleStatusChange('offen')} disabled={saving}>Wieder öffnen</button>
        {:else if defect.status === 'verifiziert'}
          <button class="btn-secondary" onclick={() => handleStatusChange('offen')} disabled={saving}>Wieder öffnen</button>
        {/if}
      </div>
    </div>

    <div class="meta-grid">
      <div><span class="label">Prüfung:</span>
        <button class="link" onclick={() => currentView.set(`inspection:${defect.inspection_id}`)}>{defect.inspection_title}</button>
      </div>
      <div><span class="label">Gerät / Raum:</span> {defect.object_name ?? '-'}</div>
      <div><span class="label">Prüfpunkt:</span> {defect.item_label}</div>
      <div><span class="label">Erstellt:</span> {formatDate(defect.created_at)}</div>
      {#if defect.resolved_at}
        <div><span class="label">Behoben:</span> {formatDate(defect.resolved_at)}</div>
      {/if}
      {#if defect.due_date}
        <div><span class="label">Frist:</span> {formatDate(defect.due_date)}</div>
      {/if}
    </div>

    {#if defect.description}
      <div class="description">
        <span class="label">Beschreibung:</span>
        <p>{defect.description}</p>
      </div>
    {/if}

    <button class="btn-secondary" onclick={() => currentView.set('defects')}>Zurück zur Mängelliste</button>
  </div>
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.875rem; }
  .label { font-weight: 600; }
  .description { font-size: 0.875rem; }
  .description p { margin: 0.25rem 0 0; color: var(--color-text-muted); }
  .link { background: none; border: none; color: var(--color-primary); text-decoration: underline; padding: 0; font-size: inherit; cursor: pointer; }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
  .badge-danger { background: #fed7d7; color: #9b2c2c; }
  .badge-warning { background: #fefcbf; color: #744210; }
  .badge-success { background: #c6f6d5; color: #22543d; }
  .badge-muted { background: #e2e8f0; color: #4a5568; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
</style>
