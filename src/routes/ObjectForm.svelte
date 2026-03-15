<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getObject, saveObject } from '../lib/db.js';

  let { objectId = null } = $props();
  let form = $state({ name: '', location: '', category: '', identifier: '', notes: '' });
  let saving = $state(false);

  onMount(async () => {
    if (objectId) {
      const obj = await getObject(objectId);
      if (obj) {
        form = {
          name: obj.name, location: obj.location ?? '', category: obj.category ?? '',
          identifier: obj.identifier ?? '', notes: obj.notes ?? '',
        };
      }
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    saving = true;
    const id = await saveObject({
      id: objectId,
      name: form.name.trim(),
      location: form.location.trim() || null,
      category: form.category.trim() || null,
      identifier: form.identifier.trim() || null,
      notes: form.notes.trim() || null,
    });
    saving = false;
    currentView.set(`object:${id}`);
  }
</script>

<div class="page">
  <h1>{objectId ? 'Gerät / Raum bearbeiten' : 'Neues Gerät / Raum'}</h1>

  <form onsubmit={handleSubmit}>
    <div class="field">
      <label for="name">Name *</label>
      <input id="name" bind:value={form.name} required placeholder="z.B. Feuerlöscher EG-01" />
    </div>
    <div class="field">
      <label for="location">Standort</label>
      <input id="location" bind:value={form.location} placeholder="z.B. Erdgeschoss, Flur" />
    </div>
    <div class="field">
      <label for="category">Kategorie</label>
      <input id="category" bind:value={form.category} placeholder="z.B. Brandschutz, Elektro, Spielgeräte" />
    </div>
    <div class="field">
      <label for="identifier">Kennung / Inventarnummer</label>
      <input id="identifier" bind:value={form.identifier} placeholder="z.B. FL-2024-001" />
    </div>
    <div class="field">
      <label for="notes">Notizen</label>
      <textarea id="notes" bind:value={form.notes} rows="3"></textarea>
    </div>

    <div class="actions">
      <button type="submit" class="btn-primary" disabled={saving}>
        {saving ? 'Speichere...' : 'Speichern'}
      </button>
      <button type="button" class="btn-secondary" onclick={() => currentView.set('objects')}>Abbrechen</button>
    </div>
  </form>
</div>

<style>
  .page { max-width: 600px; display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; }
  .field label { font-weight: 600; font-size: 0.8125rem; }
  input, textarea { width: 100%; }
  .actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
</style>
