<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getInspection, getInspectionResults, saveInspectionResults, saveInspection, getTemplate, getInspections, saveTemplate, saveTemplateItems, getTemplateItems, createRecurringInspection, createDefectsFromInspection } from '../lib/db.js';
  import PhotoAttachment from '../components/PhotoAttachment.svelte';

  let { inspectionId } = $props();
  let inspection = $state(null);
  let results = $state([]);
  let saving = $state(false);
  let template = $state(null);
  let autoRecurring = $state(false);
  let completedMessage = $state(null);

  // First-use customization mode
  let isFirstUse = $state(false);
  let removedIndices = $state(new Set());
  let showFinalizeStep = $state(false);
  let newItemLabel = $state('');
  let customInterval = $state(null);

  let activeResults = $derived(results.filter((_, i) => !removedIndices.has(i)));
  let doneCount = $derived(activeResults.filter(r => r.result !== 'offen').length);
  let totalCount = $derived(activeResults.length);
  let progressPercent = $derived(totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0);
  let allDone = $derived(doneCount === totalCount && totalCount > 0);

  onMount(async () => {
    inspection = await getInspection(inspectionId);
    results = await getInspectionResults(inspectionId);
    if (inspection?.template_id) {
      template = await getTemplate(inspection.template_id);
      if (template?.interval_days > 0) {
        autoRecurring = true;
        customInterval = template.interval_days;
      }
      // Check if this template has been used before
      const prev = await getInspections({ template_id: inspection.template_id });
      isFirstUse = prev.length <= 1; // only this one
    }
  });

  function removeItem(index) {
    removedIndices = new Set([...removedIndices, index]);
    results[index] = { ...results[index], result: 'nicht_anwendbar' };
  }

  function setResult(index, value) {
    results[index] = { ...results[index], result: value };
  }

  function setRemark(index, value) {
    results[index] = { ...results[index], remark: value };
  }

  function resultClass(result) {
    if (result === 'ok') return 'result-ok';
    if (result === 'maengel') return 'result-fail';
    if (result === 'nicht_anwendbar') return 'result-na';
    return '';
  }

  async function handleSave(finalize = false) {
    saving = true;

    // If first use: show finalize step instead of completing directly
    if (finalize && isFirstUse && !showFinalizeStep) {
      saving = false;
      showFinalizeStep = true;
      return;
    }

    // Save results (only active ones get real results, removed get nicht_anwendbar)
    await saveInspectionResults(inspectionId, results);

    if (finalize) {
      // If first use: update the template with customizations
      if (isFirstUse && template) {
        const items = await getTemplateItems(template.id);
        const keptItems = items.filter((_, i) => !removedIndices.has(i)).map(item => ({
          label: item.label,
          hint: item.hint || null,
          required: item.required,
        }));
        await saveTemplateItems(template.id, keptItems);
        if (customInterval && customInterval !== template.interval_days) {
          await saveTemplate({ ...template, interval_days: customInterval });
        }
      }

      const hasDefects = activeResults.some(r => r.result === 'maengel');
      const everyDone = activeResults.every(r => r.result !== 'offen');
      if (everyDone) {
        const dueDate = inspection.due_date || null;
        await saveInspection({
          ...inspection,
          status: hasDefects ? 'bemaengelt' : 'bestanden',
          due_date: dueDate,
        });

        // Auto-create defects if bemaengelt
        if (hasDefects) {
          await createDefectsFromInspection(inspectionId);
        }

        // Auto-create recurring inspection
        if (autoRecurring && template?.interval_days > 0) {
          await createRecurringInspection(inspectionId);
        }
      }
    }

    saving = false;
    if (finalize) {
      const msg = autoRecurring && template?.interval_days > 0
        ? `Prüfung abgeschlossen! Nächste Prüfung in ${template.interval_days} Tagen angelegt.`
        : 'Prüfung abgeschlossen und gespeichert!';
      completedMessage = msg;
    }
  }
</script>

{#if completedMessage}
  <div class="completed-screen">
    <div class="completed-icon">✓</div>
    <h2>{completedMessage}</h2>
    <button class="btn-primary" onclick={() => currentView.set(`inspection:${inspectionId}`)}>
      Zum Protokoll &rarr;
    </button>
  </div>
{:else if inspection}
  <div class="page">
    <h1>Prüfung durchführen</h1>
    <div class="meta">
      <span><strong>{inspection.title}</strong></span>
      <span>Prüfer: {inspection.inspector}</span>
      {#if inspection.object_name}<span>Gerät / Raum: {inspection.object_name}</span>{/if}
    </div>

    <div class="progress-section">
      <div class="progress-bar" role="progressbar" aria-valuenow={progressPercent} aria-valuemin="0" aria-valuemax="100">
        <div class="progress-fill" style="width: {progressPercent}%"></div>
      </div>
      <span class="progress-label">{doneCount} von {totalCount} Punkten bearbeitet</span>
    </div>

    {#if !showFinalizeStep}
      <div class="checklist">
        {#each results as r, i}
          {#if !removedIndices.has(i)}
            <div class="check-item" class:required={r.required}>
              <div class="check-header">
                <span class="check-num">{i + 1}.</span>
                <span class="check-label">{r.label}</span>
                {#if r.required}<span class="check-required">Pflicht</span>{/if}
                {#if isFirstUse}
                  <button class="btn-remove" onclick={() => removeItem(i)} title="Betrifft mich nicht — aus Checkliste entfernen">✕</button>
                {/if}
              </div>
              {#if r.hint}
                <div class="check-hint">{r.hint}</div>
              {/if}
              <div class="check-buttons">
                <button class="result-btn {r.result === 'ok' ? 'active-ok' : ''}" onclick={() => setResult(i, 'ok')}>OK</button>
                <button class="result-btn {r.result === 'maengel' ? 'active-fail' : ''}" onclick={() => setResult(i, 'maengel')}>Mängel</button>
                <button class="result-btn {r.result === 'nicht_anwendbar' ? 'active-na' : ''}" onclick={() => setResult(i, 'nicht_anwendbar')}>Entfällt</button>
              </div>
              {#if r.result === 'maengel'}
                <textarea
                  placeholder="Was ist das Problem?"
                  value={r.remark ?? ''}
                  oninput={(e) => setRemark(i, e.target.value)}
                  rows="2"
                ></textarea>
              {/if}
              {#if r.id}
                <PhotoAttachment inspectionResultId={r.id} />
              {/if}
            </div>
          {/if}
        {/each}
      </div>

      {#if isFirstUse && removedIndices.size > 0}
        <p class="removed-hint">{removedIndices.size} {removedIndices.size === 1 ? 'Punkt' : 'Punkte'} entfernt — wird dauerhaft aus der Checkliste gelöscht.</p>
      {/if}

      <div class="actions">
        <button class="btn-secondary" onclick={() => handleSave(false)} disabled={saving}>Zwischenspeichern</button>
        <button class="btn-primary" onclick={() => handleSave(true)} disabled={saving || !allDone}>
          {saving ? 'Speichere...' : allDone ? 'Weiter →' : 'Alle Punkte bearbeiten'}
        </button>
        <button class="btn-secondary" onclick={() => currentView.set(`inspection:${inspectionId}`)}>Zurück</button>
      </div>

    {:else}
      <div class="finalize-step">
        <h2>Prüfung anpassen</h2>

        <div class="finalize-section">
          <h3>Eigenen Prüfpunkt hinzufügen?</h3>
          <div class="add-item-row">
            <input type="text" bind:value={newItemLabel} placeholder="z.B. Kühlschranktemperatur prüfen" onkeydown={(e) => {
              if (e.key === 'Enter' && newItemLabel.trim()) {
                e.preventDefault();
                results = [...results, { label: newItemLabel.trim(), hint: null, required: false, result: 'offen', remark: '' }];
                newItemLabel = '';
              }
            }} />
            <button class="btn-secondary" disabled={!newItemLabel.trim()} onclick={() => {
              if (!newItemLabel.trim()) return;
              results = [...results, { label: newItemLabel.trim(), hint: null, required: false, result: 'offen', remark: '' }];
              newItemLabel = '';
            }}>+ Hinzufügen</button>
          </div>
          {#if results.length > activeResults.length + removedIndices.size}
            <p class="added-hint">Neue Punkte werden bei der nächsten Prüfung automatisch berücksichtigt.</p>
          {/if}
        </div>

        <div class="finalize-section">
          <h3>Wie oft soll geprüft werden?</h3>
          <div class="interval-row">
            <label>
              <input type="checkbox" bind:checked={autoRecurring} />
              Wiederkehrende Prüfung
            </label>
            {#if autoRecurring}
              <div class="interval-input">
                <span>Alle</span>
                <input type="number" bind:value={customInterval} min="1" />
                <span>Tage</span>
              </div>
            {/if}
          </div>
        </div>

        <div class="actions">
          <button class="btn-secondary" onclick={() => { showFinalizeStep = false; }}>← Zurück zur Prüfung</button>
          <button class="btn-primary" onclick={() => handleSave(true)} disabled={saving}>
            {saving ? 'Wird gespeichert...' : 'Prüfung abschließen ✓'}
          </button>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .page { max-width: 800px; display: flex; flex-direction: column; gap: 1rem; }
  .meta { display: flex; gap: 1.5rem; font-size: 0.875rem; color: var(--color-text-muted); flex-wrap: wrap; }
  .checklist { display: flex; flex-direction: column; gap: 0.75rem; }
  .check-item {
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
  }
  .check-header { display: flex; gap: 0.5rem; align-items: center; }
  .check-num { font-weight: 700; min-width: 1.5rem; }
  .check-label { font-weight: 600; flex: 1; }
  .check-required { font-size: 0.6875rem; color: var(--color-primary); }
  .check-hint { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0.25rem 0 0 2rem; }
  .check-buttons { display: flex; gap: 0.5rem; margin-top: 0.5rem; margin-left: 2rem; }
  .result-btn {
    padding: 0.375rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    background: white;
    font-size: 0.8125rem;
    min-height: 44px;
    min-width: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .result-btn:hover { background: var(--color-surface); }
  .active-ok { background: #c6f6d5; border-color: #38a169; color: #22543d; }
  .active-fail { background: #fed7d7; border-color: #e53e3e; color: #9b2c2c; }
  .active-na { background: #e2e8f0; border-color: #a0aec0; color: #4a5568; }
  textarea { margin-top: 0.5rem; margin-left: 2rem; width: calc(100% - 2rem); }
  .recurring-option { margin-top: 0.5rem; font-size: 0.875rem; }
  .recurring-option label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
  .recurring-option input[type="checkbox"] { width: 1rem; height: 1rem; }
  .actions { display: flex; gap: 0.75rem; margin-top: 1rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }

  .progress-section { display: flex; flex-direction: column; gap: 0.25rem; }
  .progress-bar { height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--color-primary); border-radius: 3px; transition: width 0.3s; }
  .progress-label { font-size: 0.8125rem; color: var(--color-text-muted); }

  .completed-screen {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 60vh; text-align: center;
  }
  .completed-icon { font-size: 4rem; color: var(--color-success); margin-bottom: 1rem; }
  .completed-screen h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }

  .btn-remove {
    background: none; border: none; color: var(--color-text-muted);
    font-size: 1rem; cursor: pointer; padding: 0.25rem; line-height: 1;
    opacity: 0.5; margin-left: auto;
  }
  .btn-remove:hover { color: var(--color-danger); opacity: 1; }
  .removed-hint { font-size: 0.8125rem; color: var(--color-warning, #e65100); margin-top: 0.5rem; }

  .finalize-step { max-width: 600px; display: flex; flex-direction: column; gap: 1.5rem; }
  .finalize-step h2 { margin: 0; }
  .finalize-section {
    background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: 0.5rem; padding: 1rem;
  }
  .finalize-section h3 { font-size: 0.9375rem; margin: 0 0 0.75rem; }
  .add-item-row { display: flex; gap: 0.5rem; }
  .add-item-row input { flex: 1; }
  .added-hint { font-size: 0.8125rem; color: var(--color-success); margin-top: 0.5rem; }
  .interval-row { display: flex; flex-direction: column; gap: 0.5rem; }
  .interval-row label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-size: 0.875rem; }
  .interval-row input[type="checkbox"] { width: 1rem; height: 1rem; }
  .interval-input { display: flex; align-items: center; gap: 0.5rem; margin-left: 1.5rem; }
  .interval-input input { width: 80px; }
  .interval-input span { font-size: 0.875rem; color: var(--color-text-muted); }
</style>
