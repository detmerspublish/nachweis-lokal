<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getTemplate, getTemplateItems, deleteTemplate, getInspections, duplicateTemplate, getOrgProfile } from '../lib/db.js';
  import { generateBlankFormPdf } from '../lib/pdf.js';

  let { templateId } = $props();
  let template = $state(null);
  let items = $state([]);
  let inspectionCount = $state(0);
  let duplicating = $state(false);

  onMount(async () => {
    template = await getTemplate(templateId);
    items = await getTemplateItems(templateId);
    const inspections = await getInspections({ template_id: templateId });
    inspectionCount = inspections.length;
  });

  async function handleDelete() {
    if (confirm(`Checkliste "${template.name}" deaktivieren?`)) {
      await deleteTemplate(templateId);
      currentView.set('templates');
    }
  }

  async function handleBlankForm() {
    const profile = await getOrgProfile();
    generateBlankFormPdf(template, items, profile);
  }

  async function handleDuplicate() {
    duplicating = true;
    const newId = await duplicateTemplate(templateId);
    duplicating = false;
    if (newId) {
      currentView.set(`template:${newId}`);
    }
  }
</script>

{#if template}
  <div class="page">
    <div class="header">
      <h1>{template.name}</h1>
      <div class="actions">
        <button class="btn-primary" onclick={() => currentView.set(`template:edit:${templateId}`)}>Bearbeiten</button>
        <button class="btn-secondary" onclick={handleDuplicate} disabled={duplicating}>
          {duplicating ? 'Wird dupliziert...' : 'Duplizieren'}
        </button>
        <button class="btn-secondary" onclick={handleBlankForm} disabled={items.length === 0}>Leerformular drucken</button>
        <button class="btn-primary" onclick={() => currentView.set('inspection:new')}>Prüfung starten</button>
        <button class="btn-danger" onclick={handleDelete}>Deaktivieren</button>
      </div>
    </div>

    <div class="meta">
      {#if template.category}<span class="tag">{template.category}</span>{/if}
      {#if template.interval_days}<span class="meta-item">Intervall: {template.interval_days} Tage</span>{/if}
      <span class="meta-item">{inspectionCount} Prüfung(en) durchgeführt</span>
    </div>

    {#if template.description}
      <p class="description">{template.description}</p>
    {/if}

    <h2>Prüfpunkte ({items.length})</h2>
    {#if items.length === 0}
      <p class="empty">Keine Prüfpunkte definiert.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Nr.</th><th>Prüfpunkt</th><th>Hinweis</th><th>Pflicht</th></tr>
        </thead>
        <tbody>
          {#each items as item, i}
            <tr>
              <td>{i + 1}</td>
              <td class="bold">{item.label}</td>
              <td class="muted">{item.hint ?? '-'}</td>
              <td>{item.required ? 'Ja' : 'Nein'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <button class="btn-secondary" onclick={() => currentView.set('templates')}>Zurück</button>
  </div>
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; }
  .meta { display: flex; gap: 1rem; font-size: 0.8125rem; color: var(--color-text-muted); }
  .tag { background: var(--color-surface); padding: 0.125rem 0.5rem; border-radius: 0.25rem; border: 1px solid var(--color-border); }
  .description { color: var(--color-text-muted); }
  .empty { color: var(--color-text-muted); font-style: italic; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; font-size: 0.8125rem; }
  .bold { font-weight: 600; }
  .muted { color: var(--color-text-muted); font-size: 0.8125rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-danger { padding: 0.5rem 1rem; background: var(--color-danger); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
</style>
