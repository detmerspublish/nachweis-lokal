<script>
  let step = $state('form'); // 'form' | 'preview' | 'submitted'
  let requests = $state([]);
  let publicRequests = $state([]);
  let requestsLoading = $state(false);
  let publicLoading = $state(false);
  let submitting = $state(false);
  let submitResult = $state(null);
  let activeTab = $state('mine'); // 'mine' | 'public'

  // Form fields
  let title = $state('');
  let category = $state('');
  let whatDescription = $state('');
  let whyDescription = $state('');
  let howOften = $state('');
  let workaround = $state('');
  let priority = $state('normal');

  // Checklist
  let checklist = $state({
    describedWhat: false,
    describedWhy: false,
    checkedExisting: false,
  });

  const categories = [
    { value: 'neue-funktion', label: 'Neue Funktion' },
    { value: 'erweiterung', label: 'Bestehende Funktion erweitern' },
    { value: 'integration', label: 'Integration / Schnittstelle' },
    { value: 'oberflaeche', label: 'Oberfläche / Bedienung' },
    { value: 'export', label: 'Export / Import' },
    { value: 'sonstiges', label: 'Sonstiges' },
  ];

  const priorities = [
    { value: 'low', label: 'Wäre schön (irgendwann)' },
    { value: 'normal', label: 'Würde mir helfen (nächste Versionen)' },
    { value: 'high', label: 'Brauche ich dringend (bald)' },
  ];

  let allChecked = $derived(
    checklist.describedWhat && checklist.describedWhy && checklist.checkedExisting
  );

  let formValid = $derived(
    title.trim().length >= 5 &&
    category !== '' &&
    whatDescription.trim().length >= 20 &&
    whyDescription.trim().length >= 10 &&
    allChecked
  );

  function buildDescription() {
    let parts = [];
    const cat = categories.find(c => c.value === category);
    parts.push(`**Kategorie:** ${cat?.label || category}`);
    parts.push(`\n**Was soll die Funktion tun?**\n${whatDescription.trim()}`);
    parts.push(`\n**Warum brauchen Sie das?**\n${whyDescription.trim()}`);
    if (howOften.trim()) {
      parts.push(`\n**Wie oft würden Sie das nutzen?**\n${howOften.trim()}`);
    }
    if (workaround.trim()) {
      parts.push(`\n**Aktueller Workaround:**\n${workaround.trim()}`);
    }
    return parts.join('\n');
  }

  function handlePreview() {
    step = 'preview';
  }

  function handleBack() {
    step = 'form';
  }

  async function handleSubmit() {
    submitting = true;
    submitResult = null;
    try {
      const result = await window.electronAPI.featureRequest.submit({
        title: title.trim(),
        description: buildDescription(),
        priority,
      });
      if (result.ok) {
        submitResult = { ok: true, requestNumber: result.requestNumber };
        step = 'submitted';
        resetForm();
        loadRequests();
      } else {
        submitResult = { ok: false, error: result.error };
      }
    } catch (err) {
      submitResult = { ok: false, error: err.message };
    }
    submitting = false;
  }

  function resetForm() {
    title = '';
    category = '';
    whatDescription = '';
    whyDescription = '';
    howOften = '';
    workaround = '';
    priority = 'normal';
    checklist = { describedWhat: false, describedWhy: false, checkedExisting: false };
  }

  async function loadRequests() {
    requestsLoading = true;
    try {
      requests = await window.electronAPI.featureRequest.list();
    } catch (_) {
      requests = [];
    }
    requestsLoading = false;
  }

  async function loadPublicRequests() {
    publicLoading = true;
    try {
      publicRequests = await window.electronAPI.featureRequest.listPublic();
    } catch (_) {
      publicRequests = [];
    }
    publicLoading = false;
  }

  async function handleVote(requestNumber) {
    try {
      const result = await window.electronAPI.featureRequest.vote(requestNumber);
      if (result.ok) {
        loadPublicRequests();
      }
    } catch (_) {}
  }

  function statusLabel(s) {
    const labels = {
      new: 'Neu', triaged: 'Gesichtet', planned: 'Vorgemerkt',
      in_progress: 'In Arbeit', released: 'Umgesetzt', declined: 'Zurückgestellt',
    };
    return labels[s] || s;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch (_) { return iso; }
  }

  $effect(() => {
    loadRequests();
    loadPublicRequests();
  });
</script>

<div class="feature-request-page">
  <h1>Ideen &amp; Vorschläge</h1>

  {#if step === 'form'}
    <section class="form-section">
      <p class="intro">
        Sie haben eine Idee, wie wir dieses Produkt verbessern können?
        Beschreiben Sie Ihren Vorschlag — andere Nutzer können dafür abstimmen.
        Wir konzentrieren uns auf die Ideen mit den meisten Stimmen.
      </p>

      <div class="field">
        <label for="fr-title">Kurztitel *</label>
        <input id="fr-title" type="text" bind:value={title}
          placeholder="z.B. Sammelrechnung für mehrere Kunden" maxlength="100" />
        {#if title.length > 0 && title.length < 5}
          <span class="hint error">Mindestens 5 Zeichen</span>
        {/if}
      </div>

      <div class="field">
        <label for="fr-category">Kategorie *</label>
        <select id="fr-category" bind:value={category}>
          <option value="">Bitte wählen...</option>
          {#each categories as cat}
            <option value={cat.value}>{cat.label}</option>
          {/each}
        </select>
      </div>

      <div class="field">
        <label for="fr-what">Was soll die Funktion tun? *</label>
        <textarea id="fr-what" bind:value={whatDescription} rows="4"
          placeholder="Beschreiben Sie die gewünschte Funktion so konkret wie möglich. Was soll passieren? Was soll das Ergebnis sein?"></textarea>
        {#if whatDescription.length > 0 && whatDescription.length < 20}
          <span class="hint error">Bitte etwas ausführlicher beschreiben (mind. 20 Zeichen)</span>
        {/if}
      </div>

      <div class="field">
        <label for="fr-why">Warum brauchen Sie das? *</label>
        <textarea id="fr-why" bind:value={whyDescription} rows="3"
          placeholder="Welches Problem löst diese Funktion für Sie? Was können Sie aktuell nicht tun?"></textarea>
      </div>

      <div class="field">
        <label for="fr-howoften">Wie oft würden Sie das nutzen?</label>
        <input id="fr-howoften" type="text" bind:value={howOften}
          placeholder="z.B. täglich, wöchentlich, einmal im Monat, einmal im Jahr" />
      </div>

      <div class="field">
        <label for="fr-workaround">Haben Sie aktuell einen Workaround?</label>
        <textarea id="fr-workaround" bind:value={workaround} rows="2"
          placeholder="Falls ja: Wie lösen Sie das Problem aktuell?"></textarea>
      </div>

      <div class="field">
        <label for="fr-priority">Wie wichtig ist das für Sie?</label>
        <select id="fr-priority" bind:value={priority}>
          {#each priorities as p}
            <option value={p.value}>{p.label}</option>
          {/each}
        </select>
      </div>

      <fieldset class="checklist">
        <legend>Checkliste (alle Punkte bestätigen)</legend>
        <label class="check-item">
          <input type="checkbox" bind:checked={checklist.describedWhat} />
          Ich habe beschrieben, <strong>was</strong> die Funktion tun soll
        </label>
        <label class="check-item">
          <input type="checkbox" bind:checked={checklist.describedWhy} />
          Ich habe erklärt, <strong>warum</strong> ich das brauche
        </label>
        <label class="check-item">
          <input type="checkbox" bind:checked={checklist.checkedExisting} />
          Ich habe geprüft, ob es die Funktion <strong>nicht schon gibt</strong>
        </label>
      </fieldset>

      <div class="expectation-hint">
        Vielen Dank für Ihre Idee! Alle Vorschläge werden gesichtet.
        Andere Nutzer können für Ihre Idee abstimmen — je mehr Stimmen,
        desto höher die Wahrscheinlichkeit einer Umsetzung. Nicht jede Idee
        kann realisiert werden, aber jede wird gelesen und bewertet.
      </div>

      <div class="actions">
        <button class="btn-primary" onclick={handlePreview} disabled={!formValid}>
          Vorschau anzeigen
        </button>
      </div>
    </section>

  {:else if step === 'preview'}
    <section class="preview-section">
      <h2>Vorschau</h2>

      <div class="preview-card">
        <div class="preview-row">
          <span class="label">Titel:</span>
          <span class="value">{title}</span>
        </div>
        <div class="preview-row">
          <span class="label">Kategorie:</span>
          <span class="value">{categories.find(c => c.value === category)?.label}</span>
        </div>
        <div class="preview-row">
          <span class="label">Priorität:</span>
          <span class="value">{priorities.find(p => p.value === priority)?.label}</span>
        </div>
        <div class="preview-row full">
          <span class="label">Was soll die Funktion tun?</span>
          <p class="value">{whatDescription}</p>
        </div>
        <div class="preview-row full">
          <span class="label">Warum brauchen Sie das?</span>
          <p class="value">{whyDescription}</p>
        </div>
        {#if howOften}
          <div class="preview-row">
            <span class="label">Nutzungshäufigkeit:</span>
            <span class="value">{howOften}</span>
          </div>
        {/if}
        {#if workaround}
          <div class="preview-row full">
            <span class="label">Aktueller Workaround:</span>
            <p class="value">{workaround}</p>
          </div>
        {/if}
      </div>

      {#if submitResult && !submitResult.ok}
        <div class="result error">{submitResult.error}</div>
      {/if}

      <div class="actions">
        <button class="btn-secondary" onclick={handleBack}>Zurück bearbeiten</button>
        <button class="btn-primary" onclick={handleSubmit} disabled={submitting}>
          {submitting ? 'Wird gesendet...' : 'Absenden'}
        </button>
      </div>
    </section>

  {:else if step === 'submitted'}
    <section class="success-section">
      <div class="result success">
        Idee <strong>{submitResult?.requestNumber}</strong> wurde eingereicht.
        Andere Nutzer können jetzt dafür abstimmen. Vielen Dank!
      </div>
      <button class="btn-secondary" onclick={() => { step = 'form'; submitResult = null; }}>
        Weitere Idee einreichen
      </button>
    </section>
  {/if}

  <!-- Tab navigation for request lists -->
  <section class="requests-list">
    <div class="tab-bar">
      <button class="tab-btn" class:active={activeTab === 'mine'} onclick={() => activeTab = 'mine'}>
        Meine Ideen
      </button>
      <button class="tab-btn" class:active={activeTab === 'public'} onclick={() => activeTab = 'public'}>
        Alle Ideen
      </button>
    </div>

    {#if activeTab === 'mine'}
      {#if requestsLoading}
        <p class="muted">Wird geladen...</p>
      {:else if requests.length === 0}
        <p class="muted">Sie haben noch keine Ideen eingereicht.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Nr.</th><th>Titel</th><th>Status</th><th>Datum</th></tr>
          </thead>
          <tbody>
            {#each requests as r}
              <tr>
                <td class="mono">{r.request_number}</td>
                <td>
                  {r.title}
                  {#if r.status === 'declined' && r.decline_reason}
                    <div class="decline-reason">{r.decline_reason}</div>
                  {/if}
                </td>
                <td><span class="badge" class:planned={r.status === 'planned'} class:released={r.status === 'released'} class:declined={r.status === 'declined'}>{statusLabel(r.status)}</span></td>
                <td>{formatDate(r.created_at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    {:else}
      {#if publicLoading}
        <p class="muted">Wird geladen...</p>
      {:else if publicRequests.length === 0}
        <p class="muted">Noch keine Ideen vorhanden. Seien Sie der Erste!</p>
      {:else}
        <table>
          <thead>
            <tr><th>Titel</th><th>Status</th><th class="center">Stimmen</th><th></th></tr>
          </thead>
          <tbody>
            {#each publicRequests as r}
              <tr>
                <td>
                  {r.title}
                  {#if r.is_own}
                    <span class="own-badge">Von Ihnen</span>
                  {/if}
                </td>
                <td><span class="badge" class:planned={r.status === 'planned'} class:released={r.status === 'released'} class:declined={r.status === 'declined'}>{statusLabel(r.status)}</span></td>
                <td class="center">{r.votes || 0}</td>
                <td>
                  <button class="btn-vote" onclick={() => handleVote(r.request_number)} disabled={r.has_voted}>
                    {r.has_voted ? 'Abgestimmt' : 'Finde ich auch wichtig'}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </section>
</div>

<style>
  .feature-request-page { max-width: 700px; display: flex; flex-direction: column; gap: 1.5rem; }
  .intro { color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.6; margin-bottom: 0.5rem; }
  .form-section, .preview-section, .success-section, .requests-list {
    border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1.25rem;
  }
  .field { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; }
  .field label { font-weight: 600; font-size: 0.875rem; }
  .field input, .field select, .field textarea {
    padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.375rem;
    font-family: inherit; font-size: 0.875rem;
  }
  .field textarea { resize: vertical; }
  .hint { font-size: 0.75rem; color: var(--color-text-muted); }
  .hint.error { color: #c53030; }
  .checklist {
    border: 1px solid var(--color-border); border-radius: 0.375rem;
    padding: 1rem; margin-bottom: 1rem;
  }
  .checklist legend { font-weight: 600; font-size: 0.875rem; padding: 0 0.5rem; }
  .check-item {
    display: flex; align-items: center; gap: 0.5rem;
    font-size: 0.875rem; padding: 0.375rem 0; cursor: pointer;
  }
  .check-item input[type="checkbox"] { width: 1rem; height: 1rem; }
  .expectation-hint {
    background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 0.375rem;
    padding: 0.75rem 1rem; font-size: 0.8rem; color: #4b5563; line-height: 1.5;
    margin-bottom: 1rem;
  }
  .actions { display: flex; gap: 0.75rem; justify-content: flex-end; }
  .btn-primary {
    padding: 0.5rem 1.25rem; background: var(--color-primary); color: white;
    border: none; border-radius: 0.375rem; font-size: 0.875rem; cursor: pointer;
  }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-secondary {
    padding: 0.5rem 1.25rem; background: none;
    border: 1px solid var(--color-border); border-radius: 0.375rem;
    font-size: 0.875rem; cursor: pointer;
  }
  .preview-card {
    background: var(--color-surface, #f9f9f9); border-radius: 0.375rem;
    padding: 1rem; margin-bottom: 1rem;
  }
  .preview-row { display: flex; gap: 0.5rem; padding: 0.375rem 0; font-size: 0.875rem; }
  .preview-row.full { flex-direction: column; }
  .preview-row .label { font-weight: 600; min-width: 140px; color: var(--color-text-muted); }
  .preview-row .value { white-space: pre-wrap; }
  .result { padding: 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; margin-bottom: 1rem; }
  .result.success { background: #c6f6d5; color: #22543d; }
  .result.error { background: #fed7d7; color: #822727; }
  .muted { color: var(--color-text-muted); font-size: 0.875rem; }
  .tab-bar { display: flex; gap: 0; margin-bottom: 1rem; border-bottom: 2px solid var(--color-border); }
  .tab-btn {
    padding: 0.5rem 1rem; background: none; border: none; border-bottom: 2px solid transparent;
    margin-bottom: -2px; font-size: 0.875rem; font-weight: 600; color: var(--color-text-muted);
    cursor: pointer;
  }
  .tab-btn.active { color: var(--color-primary, #4f46e5); border-bottom-color: var(--color-primary, #4f46e5); }
  .tab-btn:hover { color: var(--color-text); }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; font-size: 0.875rem; }
  th { font-weight: 600; }
  .center { text-align: center; }
  .mono { font-family: monospace; font-size: 0.8rem; }
  .badge {
    display: inline-block; padding: 0.15rem 0.5rem; border-radius: 1rem;
    font-size: 0.75rem; background: #edf2f7; color: #4a5568;
  }
  .badge.planned { background: #bee3f8; color: #2a4365; }
  .badge.released { background: #c6f6d5; color: #22543d; }
  .badge.declined { background: #e2e8f0; color: #64748b; }
  .decline-reason { font-size: 0.8rem; color: var(--color-text-muted); font-style: italic; margin-top: 0.25rem; }
  .own-badge {
    display: inline-block; font-size: 0.7rem; background: #dbeafe; color: #1e40af;
    padding: 0.1rem 0.4rem; border-radius: 0.25rem; margin-left: 0.5rem;
  }
  .btn-vote {
    padding: 0.25rem 0.75rem; background: none; border: 1px solid var(--color-border);
    border-radius: 0.375rem; font-size: 0.75rem; cursor: pointer; white-space: nowrap;
  }
  .btn-vote:hover:not(:disabled) { background: #f0fdf4; border-color: #86efac; }
  .btn-vote:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
