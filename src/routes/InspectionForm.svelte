<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getTemplates, getObjects, getInspectors, saveInspection, initInspectionResults, saveObject, saveInspector, getTemplateItems, saveTemplate, saveTemplateItems, getInspections } from '../lib/db.js';

  let templates = $state([]);
  let objects = $state([]);
  let inspectors = $state([]);
  let showNewObject = $state(false);
  let newObject = $state({ name: '', location: '' });

  // Customize step
  let showCustomize = $state(false);
  let customizeItems = $state([]);
  let customizeInterval = $state(null);
  let newItemLabel = $state('');
  let templateFirstUse = $state(false);

  let form = $state({
    template_id: '',
    object_id: '',
    title: '',
    inspector: '',
    inspection_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  let saving = $state(false);

  onMount(async () => {
    templates = await getTemplates();
    objects = await getObjects();
    inspectors = await getInspectors();
  });

  $effect(() => {
    if (form.template_id && !form.title) {
      const t = templates.find(t => t.id === parseInt(form.template_id));
      if (t) form.title = t.name;
    }
  });

  async function checkFirstUse() {
    if (!form.template_id) return;
    const tid = parseInt(form.template_id);
    const inspections = await getInspections({ template_id: tid });
    templateFirstUse = inspections.length === 0;
    if (templateFirstUse) {
      // Load items for customization
      const items = await getTemplateItems(tid);
      const tmpl = templates.find(t => t.id === tid);
      customizeItems = items.map(item => ({ ...item, enabled: true }));
      customizeInterval = tmpl?.interval_days || null;
      showCustomize = true;
    }
  }

  async function saveCustomization() {
    const tid = parseInt(form.template_id);
    // Update interval
    const tmpl = templates.find(t => t.id === tid);
    if (tmpl && customizeInterval !== tmpl.interval_days) {
      await saveTemplate({ ...tmpl, interval_days: customizeInterval });
    }
    // Save only enabled items + any new ones
    const enabledItems = customizeItems.filter(i => i.enabled).map(i => ({
      label: i.label,
      hint: i.hint || null,
      required: i.required,
    }));
    await saveTemplateItems(tid, enabledItems);
    showCustomize = false;
    templates = await getTemplates();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.template_id || !form.title.trim() || !form.inspector.trim()) return;
    saving = true;
    const id = await saveInspection({
      template_id: parseInt(form.template_id),
      object_id: form.object_id ? parseInt(form.object_id) : null,
      title: form.title.trim(),
      inspector: form.inspector.trim(),
      inspection_date: form.inspection_date,
      status: 'offen',
      notes: form.notes.trim() || null,
    });
    await initInspectionResults(id, parseInt(form.template_id));
    saving = false;
    currentView.set(`inspection:execute:${id}`);
  }
</script>

<div class="page">
  <h1>Neue Prüfung</h1>

  <form onsubmit={handleSubmit}>
    <div class="field">
      <label for="template">Checkliste *</label>
      <select id="template" bind:value={form.template_id} required onchange={checkFirstUse}>
        <option value="">Bitte wählen...</option>
        {#each templates as t}
          <option value={t.id}>{t.name}</option>
        {/each}
      </select>
      {#if templates.length === 0}
        <div class="empty-templates-hint">
          <p>Noch keine Checklisten vorhanden.</p>
          <div class="empty-actions">
            <button type="button" class="btn-secondary" onclick={() => currentView.set('templates')}>
              Aus Bibliothek hinzufügen
            </button>
            <button type="button" class="btn-secondary" onclick={() => currentView.set('template:new')}>
              Eigene erstellen
            </button>
          </div>
        </div>
      {/if}
    </div>

    {#if showCustomize}
      <div class="customize-section">
        <h3>Checkliste an Ihren Betrieb anpassen</h3>
        <p class="hint">Deaktivieren Sie Punkte die Sie nicht brauchen. Sie können auch eigene hinzufügen.</p>

        <div class="customize-items">
          {#each customizeItems as item, i}
            <label class="customize-item" class:disabled={!item.enabled}>
              <input type="checkbox" bind:checked={item.enabled} />
              <span>{item.label}</span>
            </label>
          {/each}
        </div>

        <div class="add-item-row">
          <input type="text" bind:value={newItemLabel} placeholder="Eigenen Prüfpunkt hinzufügen..." onkeydown={(e) => {
            if (e.key === 'Enter' && newItemLabel.trim()) {
              e.preventDefault();
              customizeItems = [...customizeItems, { label: newItemLabel.trim(), hint: null, required: true, enabled: true }];
              newItemLabel = '';
            }
          }} />
          <button type="button" class="btn-small btn-secondary" disabled={!newItemLabel.trim()} onclick={() => {
            if (!newItemLabel.trim()) return;
            customizeItems = [...customizeItems, { label: newItemLabel.trim(), hint: null, required: true, enabled: true }];
            newItemLabel = '';
          }}>+ Hinzufügen</button>
        </div>

        <div class="interval-row">
          <label for="interval">Prüfintervall</label>
          <div class="interval-input">
            <input id="interval" type="number" bind:value={customizeInterval} min="1" placeholder="z.B. 365" />
            <span>Tage</span>
          </div>
        </div>

        <button type="button" class="btn-primary" onclick={saveCustomization}>Anpassungen speichern</button>
      </div>
    {/if}
    <div class="field">
      <label for="object">Gerät / Raum</label>
      <div class="object-select">
        <select id="object" bind:value={form.object_id} onchange={(e) => { if (e.target.value === '__new__') { showNewObject = true; form.object_id = ''; } }}>
          <option value="">Kein Gerät / Raum</option>
          {#each objects as o}
            <option value={o.id}>{o.name}{o.location ? ` (${o.location})` : ''}</option>
          {/each}
          <option value="__new__">+ Neu anlegen...</option>
        </select>
      </div>
      {#if showNewObject}
        <div class="inline-new-object">
          <div class="row">
            <div class="field">
              <label for="new-obj-name">Name *</label>
              <input id="new-obj-name" bind:value={newObject.name} placeholder="z.B. Feuerlöscher Flur EG" />
            </div>
            <div class="field">
              <label for="new-obj-loc">Standort</label>
              <input id="new-obj-loc" bind:value={newObject.location} placeholder="z.B. Erdgeschoss" />
            </div>
          </div>
          <div class="inline-actions">
            <button type="button" class="btn-primary btn-small" onclick={async () => {
              if (!newObject.name.trim()) return;
              const id = await saveObject({ name: newObject.name.trim(), location: newObject.location.trim() || null, category: null, identifier: null, notes: null });
              objects = await getObjects();
              form.object_id = String(id);
              showNewObject = false;
              newObject = { name: '', location: '' };
            }}>Anlegen</button>
            <button type="button" class="btn-secondary btn-small" onclick={() => { showNewObject = false; }}>Abbrechen</button>
          </div>
        </div>
      {/if}
    </div>
    <div class="field">
      <label for="title">Titel *</label>
      <input id="title" bind:value={form.title} required />
    </div>
    <div class="row">
      <div class="field">
        <label for="inspector">Prüfer *</label>
        <input id="inspector" bind:value={form.inspector} required list="inspector-list" placeholder="Name eingeben oder wählen..." />
        <datalist id="inspector-list">
          {#each inspectors as insp}
            <option value={insp.name}>{insp.role ? `${insp.name} (${insp.role})` : insp.name}</option>
          {/each}
        </datalist>
        {#if form.inspector.trim() && !inspectors.some(i => i.name === form.inspector.trim())}
          <button type="button" class="link-btn" onclick={async () => {
            await saveInspector({ name: form.inspector.trim() });
            inspectors = await getInspectors();
          }}>„{form.inspector.trim()}" als Prüfer speichern</button>
        {/if}
      </div>
      <div class="field">
        <label for="date">Datum</label>
        <input id="date" type="date" bind:value={form.inspection_date} />
      </div>
    </div>
    <div class="field">
      <label for="notes">Hinweise</label>
      <textarea id="notes" bind:value={form.notes} rows="3"></textarea>
    </div>

    <div class="actions">
      <button type="submit" class="btn-primary" disabled={saving}>
        {saving ? 'Erstelle...' : 'Prüfung starten'}
      </button>
      <button type="button" class="btn-secondary" onclick={() => currentView.set('inspections')}>Abbrechen</button>
    </div>
  </form>
</div>

<style>
  .page { max-width: 600px; display: flex; flex-direction: column; gap: 1rem; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; flex: 1; }
  .field label { font-weight: 600; font-size: 0.8125rem; }
  .row { display: flex; gap: 1rem; }
  input, select, textarea { width: 100%; }
  .actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
  .btn-small { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
  .inline-new-object {
    margin-top: 0.5rem; padding: 0.75rem;
    border: 1px solid var(--color-primary); border-radius: 0.375rem;
    background: #f0f7ff;
  }
  .inline-new-object .field { margin-bottom: 0.5rem; }
  .inline-actions { display: flex; gap: 0.5rem; }
  .link-btn { background: none; border: none; color: var(--color-primary); font-size: 0.8125rem; cursor: pointer; text-decoration: underline; padding: 0.25rem 0; }

  .customize-section {
    background: var(--color-surface); border: 2px solid var(--color-primary);
    border-radius: 0.5rem; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;
  }
  .customize-section h3 { margin: 0; font-size: 1rem; }
  .hint { color: var(--color-text-muted); font-size: 0.8125rem; margin: 0; }
  .customize-items { display: flex; flex-direction: column; gap: 0.25rem; }
  .customize-item {
    display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0;
    font-size: 0.875rem; cursor: pointer;
  }
  .customize-item.disabled span { text-decoration: line-through; color: var(--color-text-muted); }
  .customize-item input { width: 1rem; height: 1rem; }
  .add-item-row { display: flex; gap: 0.5rem; }
  .add-item-row input { flex: 1; }
  .interval-row { display: flex; flex-direction: column; gap: 0.25rem; }
  .interval-row label { font-weight: 600; font-size: 0.8125rem; }
  .interval-input { display: flex; align-items: center; gap: 0.5rem; }
  .interval-input input { width: 100px; }
  .interval-input span { font-size: 0.875rem; color: var(--color-text-muted); }

  .empty-templates-hint { margin-top: 0.5rem; padding: 0.75rem; background: #fffbeb; border: 1px solid #fbbf24; border-radius: 0.375rem; }
  .empty-templates-hint p { margin: 0 0 0.5rem; font-size: 0.875rem; color: #92400e; }
  .empty-actions { display: flex; gap: 0.5rem; }
</style>
