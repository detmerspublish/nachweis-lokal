<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getTemplate, saveTemplate, getTemplateItems, saveTemplateItems } from '../lib/db.js';

  let { templateId = null } = $props();
  let form = $state({ name: '', description: '', category: '', interval_days: '' });
  let items = $state([]);
  let saving = $state(false);

  onMount(async () => {
    if (templateId) {
      const t = await getTemplate(templateId);
      if (t) {
        form = { name: t.name, description: t.description ?? '', category: t.category ?? '', interval_days: t.interval_days ?? '' };
        items = (await getTemplateItems(templateId)).map(i => ({
          label: i.label, hint: i.hint ?? '', required: !!i.required,
        }));
      }
    }
    if (items.length === 0) {
      items = [{ label: '', hint: '', required: true }];
    }
  });

  function addItem() {
    items = [...items, { label: '', hint: '', required: true }];
  }

  function removeItem(index) {
    items = items.filter((_, i) => i !== index);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    saving = true;
    const id = await saveTemplate({
      id: templateId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      interval_days: form.interval_days ? parseInt(form.interval_days) : null,
    });
    const validItems = items.filter(i => i.label.trim());
    if (validItems.length > 0) {
      await saveTemplateItems(id, validItems);
    }
    saving = false;
    currentView.set(`template:${id}`);
  }
</script>

<div class="page">
  <h1>{templateId ? 'Checkliste bearbeiten' : 'Neue Checkliste'}</h1>

  <form onsubmit={handleSubmit}>
    <div class="field">
      <label for="name">Name *</label>
      <input id="name" bind:value={form.name} required />
    </div>
    <div class="field">
      <label for="category">Kategorie</label>
      <input id="category" bind:value={form.category} placeholder="z.B. Sicherheit, Geräte, Gebäude" />
    </div>
    <div class="field">
      <label for="interval">Prüfintervall (Tage)</label>
      <input id="interval" type="number" min="1" bind:value={form.interval_days} placeholder="z.B. 365" />
    </div>
    <div class="field">
      <label for="desc">Beschreibung</label>
      <textarea id="desc" bind:value={form.description} rows="3"></textarea>
    </div>

    <h2>Prüfpunkte</h2>
    {#each items as item, i}
      <div class="item-row">
        <span class="item-num">{i + 1}.</span>
        <input bind:value={item.label} placeholder="Prüfpunkt" class="item-label" />
        <input bind:value={item.hint} placeholder="Hinweis (optional)" class="item-hint" />
        <label class="item-required">
          <input type="checkbox" bind:checked={item.required} /> Pflicht
        </label>
        <button type="button" class="btn-remove" onclick={() => removeItem(i)} title="Entfernen">&times;</button>
      </div>
    {/each}
    <button type="button" class="btn-secondary" onclick={addItem}>+ Prüfpunkt</button>

    <div class="actions">
      <button type="submit" class="btn-primary" disabled={saving}>
        {saving ? 'Speichere...' : 'Speichern'}
      </button>
      <button type="button" class="btn-secondary" onclick={() => currentView.set('templates')}>Abbrechen</button>
    </div>
  </form>
</div>

<style>
  .page { max-width: 800px; display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; }
  .field label { font-weight: 600; font-size: 0.8125rem; }
  input, textarea { width: 100%; }
  h2 { margin-top: 1rem; }
  .item-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
  .item-num { font-weight: 600; font-size: 0.8125rem; min-width: 1.5rem; }
  .item-label { flex: 2; }
  .item-hint { flex: 1; }
  .item-required { font-size: 0.8125rem; white-space: nowrap; display: flex; align-items: center; gap: 0.25rem; }
  .item-required input { width: auto; }
  .btn-remove { background: none; border: none; color: var(--color-danger); font-size: 1.25rem; padding: 0 0.25rem; }
  .actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
</style>
