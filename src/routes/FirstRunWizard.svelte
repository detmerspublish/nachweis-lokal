<script>
  import {
    saveOrgProfile, saveInspector,
    importLibraryTemplate, getTemplates
  } from '../lib/db.js';
  import { generateProtocolPdf } from '../lib/pdf.js';
  import { currentView } from '../lib/stores/navigation.js';
  import libraryData from '../assets/template-library.json';
  import Glossar from '../components/Glossar.svelte';

  let { oncomplete } = $props();

  let step = $state(1);
  const totalSteps = 5;

  // Step 2: Demo-Pruefung
  const demoItems = [
    { label: 'Feuerlöscher sichtbar und zugänglich?', hint: 'Nicht hinter Kartons oder Möbeln versteckt', required: true },
    { label: 'Fluchtweg frei und nicht blockiert?', hint: 'Keine Kisten, Müll oder Möbel im Weg', required: true },
    { label: 'Notausgang-Schild beleuchtet?', hint: 'Grünes Schild über der Tür', required: true },
    { label: 'Rauchmelder an der Decke vorhanden?', hint: '', required: false },
    { label: 'Elektrokabel ohne sichtbare Schäden?', hint: 'Keine Brüche, Risse oder lose Stellen', required: true },
  ];

  let demoResults = $state(demoItems.map(item => ({
    ...item,
    result: 'offen',
    remark: '',
  })));
  let demoCompleted = $state(false);

  let demoDoneCount = $derived(demoResults.filter(r => r.result !== 'offen').length);
  let demoAllDone = $derived(demoResults.every(r => r.result !== 'offen'));

  function setDemoResult(index, value) {
    demoResults[index] = { ...demoResults[index], result: value };
  }

  function setDemoRemark(index, value) {
    demoResults[index] = { ...demoResults[index], remark: value };
  }

  function finishDemo() {
    demoCompleted = true;
  }

  function showDemoPdf() {
    const demoInspection = {
      title: 'Brandschutz Schnellcheck (Demo)',
      inspector: 'Demo-Nutzer',
      object_name: 'Beispielgebäude',
      inspection_date: new Date().toISOString().slice(0, 10),
      status: demoResults.some(r => r.result === 'maengel') ? 'bemaengelt' : 'bestanden',
      ref_code: 'DEMO-001',
    };
    const pdfResults = demoResults.map((r, i) => ({
      sort_order: i,
      label: r.label,
      hint: r.hint,
      required: r.required,
      result: r.result,
      remark: r.remark || '',
    }));
    generateProtocolPdf(demoInspection, pdfResults, {}, false);
  }

  // Step 3: KI-Betriebsassistent
  let selectedTemplates = $state(new Set());
  let selectedBranch = $state('alle');
  let betriebText = $state('');
  let classifierDone = $state(false);
  let showManualSelect = $state(false);
  let listening = $state(false);
  let speechSupported = $state(typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window));
  let hasBusinessLicense = $state(false);

  // Check license on init
  (async () => {
    hasBusinessLicense = (await window.electronAPI?.license?.getStatus())?.active || false;
  })();

  const branchLabels = [
    { key: 'alle', label: 'Alle' },
    { key: 'gastro', label: 'Gastronomie' },
    { key: 'buero', label: 'Büro' },
    { key: 'kita', label: 'Kita' },
    { key: 'handwerk', label: 'Handwerk' },
    { key: 'einzelhandel', label: 'Einzelhandel' },
    { key: 'hausverwaltung', label: 'Hausverwaltung' },
    { key: 'verein', label: 'Verein' },
  ];

  const keywords = {
    gastro: ['restaurant', 'imbiss', 'café', 'cafe', 'küche', 'kochen', 'gastronomie', 'speisen', 'essen', 'bar', 'kneipe', 'zapf', 'bier', 'fritteuse', 'grill', 'lebensmittel', 'hygiene', 'catering', 'kantine', 'bäckerei', 'metzgerei', 'kiosk'],
    buero: ['büro', 'office', 'schreibtisch', 'bildschirm', 'computer', 'arbeitsplatz', 'praxis', 'kanzlei', 'agentur', 'beratung', 'verwaltung', 'server'],
    kita: ['kita', 'kindergarten', 'krippe', 'hort', 'schule', 'kinder', 'spielplatz', 'spielgeräte', 'turnhalle', 'betreuung', 'außengelände'],
    handwerk: ['werkstatt', 'handwerk', 'maschine', 'werkzeug', 'elektro', 'elektriker', 'installation', 'montage', 'baustelle', 'leiter', 'lager', 'regal', 'produktion', 'schweißen', 'schreinerei'],
    einzelhandel: ['laden', 'geschäft', 'shop', 'verkauf', 'kasse', 'regal', 'einzelhandel', 'supermarkt', 'boutique'],
    hausverwaltung: ['gebäude', 'haus', 'wohnung', 'vermieter', 'hausverwaltung', 'aufzug', 'heizung', 'keller', 'tiefgarage', 'treppe'],
    verein: ['verein', 'sport', 'fußball', 'tennis', 'schwimmbad', 'turnhalle', 'sportplatz', 'minigolf', 'clubhaus'],
  };

  function classifyBetrieb() {
    if (!betriebText.trim()) return;
    const lower = betriebText.toLowerCase();
    const scores = {};
    for (const [branch, kws] of Object.entries(keywords)) {
      scores[branch] = 0;
      for (const kw of kws) {
        if (lower.includes(kw)) scores[branch] += 2;
      }
    }
    const matched = Object.entries(scores).filter(([_, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([b]) => b);
    if (matched.length > 0) {
      selectedBranch = matched[0];
      const matchedTemplates = libraryData.filter(t =>
        t.branches && t.branches.some(b => matched.includes(b))
      );
      selectedTemplates = new Set(matchedTemplates.map(t => t.id));
    }
    classifierDone = true;
  }

  function startSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = true;
    listening = true;
    let gotResult = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join('');
      betriebText = transcript;
      if (event.results[event.results.length - 1].isFinal) {
        gotResult = true;
        listening = false;
        recognition.stop();
        classifyBetrieb();
      }
    };
    recognition.onerror = (e) => { listening = false; };
    recognition.onend = () => {
      if (!gotResult) listening = false;
    };
    recognition.start();
  }

  let filteredLibrary = $derived.by(() => {
    if (selectedBranch === 'alle') return libraryData;
    return libraryData.filter(t =>
      t.branches && (t.branches.includes(selectedBranch) || t.branches.includes('alle'))
    );
  });

  let businessSelectedCount = $derived(
    libraryData.filter(t => selectedTemplates.has(t.id) && t.tier === 'business').length
  );

  function toggleTemplate(id) {
    const next = new Set(selectedTemplates);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedTemplates = next;
  }

  // Step 4: Organisation (optional)
  let org = $state({ name: '', street: '', zip: '', city: '', responsible: '' });

  let saving = $state(false);
  let importedCount = $state(0);

  async function handleNext() {
    if (step === 1) {
      step = 2;
    } else if (step === 2) {
      step = 3;
    } else if (step === 3) {
      // Import selected templates (only basis if no business license)
      saving = true;
      let count = 0;
      for (const t of libraryData) {
        if (selectedTemplates.has(t.id)) {
          if (t.tier === 'business' && !hasBusinessLicense) continue;
          await importLibraryTemplate(t);
          count++;
        }
      }
      importedCount = count;
      saving = false;
      step = 4;
    } else if (step === 4) {
      if (org.name.trim()) {
        await saveOrgProfile(org);
      }
      // Verantwortliche Person automatisch als Prüfer speichern
      if (org.responsible.trim()) {
        try { await saveInspector({ name: org.responsible.trim() }); } catch (_) {}
      }
      step = 5;
    } else if (step === 5) {
      oncomplete();
    }
  }

  function skipToSetup() {
    step = 3;
  }

  function handleBack() {
    if (step > 1) step--;
  }

  function handleSkipAll() {
    oncomplete();
  }
</script>

<div class="wizard-backdrop" role="dialog" aria-modal="true" aria-label="Einrichtungsassistent">
  <div class="wizard">
    <div class="wizard-header">
      <h1>Willkommen bei Nachweis Lokal</h1>
      <p class="subtitle">Prüfungen dokumentieren — einfach und sicher.</p>
      <div class="progress" role="progressbar" aria-valuenow={step} aria-valuemin="1" aria-valuemax={totalSteps} aria-label="Fortschritt">
        <div class="progress-bar" style="width: {(step / totalSteps) * 100}%"></div>
      </div>
      <span class="step-label">Schritt {step} von {totalSteps}</span>
    </div>

    <div class="wizard-body">
      {#if step === 1}
        <!-- Willkommen -->
        <h2>Prüfungen dokumentieren — einfach und sicher</h2>
        <div class="welcome">
          <p>Probieren Sie es aus: Führen Sie jetzt eine kurze Demo-Prüfung durch. Das dauert nur 2 Minuten.</p>
          <div class="welcome-actions">
            <button class="btn-primary btn-large" onclick={() => step = 2}>
              Jetzt ausprobieren
            </button>
            <button class="link-btn" onclick={skipToSetup}>
              Direkt einrichten
            </button>
          </div>
          <div class="info-box info-box-warning">
            <strong>Warum ist das wichtig?</strong> Als Unternehmer müssen Sie bestimmte Dinge regelmäßig prüfen — zum Beispiel Feuerlöscher, elektrische Geräte oder Fluchtwege. Wenn etwas passiert und Sie keine Prüfung nachweisen können, haften Sie persönlich. Auch Ihre Versicherung kann die Zahlung verweigern.
          </div>
        </div>

      {:else if step === 2}
        <!-- Demo-Pruefung -->
        {#if !demoCompleted}
          <h2>Brandschutz Schnellcheck</h2>
          <p class="hint">Prüfen Sie die folgenden 5 Punkte — genau so funktioniert eine echte Prüfung.</p>

          <div class="demo-progress-section">
            <div class="demo-progress-bar">
              <div class="demo-progress-fill" style="width: {(demoDoneCount / demoItems.length) * 100}%"></div>
            </div>
            <span class="demo-progress-label">{demoDoneCount} von {demoItems.length} geprüft</span>
          </div>

          <div class="demo-checklist">
            {#each demoResults as r, i}
              <div class="check-item">
                <div class="check-header">
                  <span class="check-num">{i + 1}.</span>
                  <span class="check-label">{r.label}</span>
                  {#if r.required}<span class="check-required">Pflicht</span>{/if}
                </div>
                {#if r.hint}
                  <div class="check-hint">{r.hint}</div>
                {/if}
                <div class="check-buttons">
                  <button class="result-btn {r.result === 'ok' ? 'active-ok' : ''}" onclick={() => setDemoResult(i, 'ok')}>OK</button>
                  <button class="result-btn {r.result === 'maengel' ? 'active-fail' : ''}" onclick={() => setDemoResult(i, 'maengel')}>Mängel</button>
                  <button class="result-btn {r.result === 'nicht_anwendbar' ? 'active-na' : ''}" onclick={() => setDemoResult(i, 'nicht_anwendbar')}>Entfällt</button>
                </div>
                {#if r.result === 'maengel'}
                  <textarea
                    placeholder="Was ist das Problem?"
                    value={r.remark ?? ''}
                    oninput={(e) => setDemoRemark(i, e.target.value)}
                    rows="2"
                  ></textarea>
                {/if}
              </div>
            {/each}
          </div>

          <div class="demo-actions">
            <button class="btn-primary btn-large" onclick={finishDemo} disabled={!demoAllDone}>
              Demo abschließen
            </button>
            <button class="link-btn" onclick={skipToSetup}>
              Direkt einrichten
            </button>
          </div>
        {:else}
          <!-- Demo abgeschlossen -->
          <div class="demo-success">
            <div class="success-icon">&#10003;</div>
            <h2>Prüfung abgeschlossen!</h2>
            <p>So sieht Ihr Prüfprotokoll aus.</p>
            <div class="demo-success-actions">
              <button class="btn-secondary btn-large" onclick={showDemoPdf}>
                Als PDF anzeigen
              </button>
              <button class="btn-primary btn-large" onclick={() => step = 3}>
                Weiter zur Einrichtung &rarr;
              </button>
            </div>
          </div>
        {/if}

      {:else if step === 3}
        <!-- KI-Betriebsassistent -->
        <h2>Beschreiben Sie Ihren Betrieb</h2>

        {#if !classifierDone}
          <p class="hint">Was für ein Betrieb ist das? Wir finden die passenden Checklisten für Sie.</p>
          <div class="assistant-input">
            <input
              type="text"
              bind:value={betriebText}
              placeholder="z.B. Imbiss mit Fritteuse und Zapfanlage"
              onkeydown={(e) => { if (e.key === 'Enter') classifyBetrieb(); }}
            />
            <button class="btn-classify" onclick={classifyBetrieb} disabled={!betriebText.trim()}>
              Finden
            </button>
            {#if speechSupported}
              <button class="btn-mic" onmousedown={startSpeech} disabled={listening} title="Sprechen">
                {listening ? '⏺' : '🎤'}
              </button>
            {/if}
          </div>
          <p class="skip-link">
            <button class="link-btn" onclick={() => { showManualSelect = true; classifierDone = true; }}>
              Ich möchte selbst auswählen
            </button>
          </p>
        {:else}
          <div class="info-box">
            Diese Checklisten helfen beim Start — sie sind keine amtliche Vorschrift und keine vollständige Liste. Fragen Sie Ihre <Glossar term="BG">Berufsgenossenschaft (BG)</Glossar>, welche Prüfungen für Ihren Betrieb vorgeschrieben sind.
          </div>

          {#if selectedTemplates.size > 0 && !showManualSelect}
            <div class="classifier-result">
              <p><strong>Diese Checklisten passen zu Ihrem Betrieb:</strong></p>
              <ul class="selected-list">
                {#each libraryData.filter(t => selectedTemplates.has(t.id)) as t}
                  <li>
                    <label class="selected-item">
                      <input type="checkbox" checked={t.tier !== 'business' || hasBusinessLicense} disabled={t.tier === 'business' && !hasBusinessLicense} onchange={() => toggleTemplate(t.id)} />
                      <span>{t.name}</span>
                      {#if t.tier === 'business'}
                        <span class="business-badge">Business</span>
                      {/if}
                      <span class="selected-meta">{t.items.length} Punkte</span>
                    </label>
                  </li>
                {/each}
              </ul>
              <p class="selected-hint">Häkchen entfernen um eine Checkliste abzuwählen.</p>
              {#if businessSelectedCount > 0 && !hasBusinessLicense}
                <div class="info-box info-box-warning">
                  Die mit „Business" gekennzeichneten Checklisten sind kuratierte Branchenvorlagen und können nur mit dem Nachweis Lokal Business-Paket genutzt werden. Sie können jederzeit eigene Checklisten erstellen — kostenlos und ohne Einschränkung.
                </div>
              {/if}
            </div>
          {/if}

          <details class="manual-expand" open={showManualSelect}>
            <summary>{showManualSelect ? 'Checklisten auswählen' : 'Weitere Checklisten hinzufügen'}</summary>
            <div class="info-box" style="margin-top:0.75rem">
              Diese Checklisten helfen beim Start — sie sind keine amtliche Vorschrift. Fragen Sie Ihre <Glossar term="BG">Berufsgenossenschaft (BG)</Glossar> für eine vollständige Liste.
            </div>
            <div class="branch-filter">
              {#each branchLabels as b}
                <button
                  class="branch-btn"
                  class:active={selectedBranch === b.key}
                  onclick={() => selectedBranch = b.key}
                >{b.label}</button>
              {/each}
            </div>
            <ul class="checklist-select">
              {#each filteredLibrary as t}
                {@const isBusinessLocked = t.tier === 'business' && !hasBusinessLicense}
                <li>
                  <label class="selected-item" class:template-locked={isBusinessLocked}>
                    <input type="checkbox" checked={selectedTemplates.has(t.id) && !isBusinessLocked} disabled={isBusinessLocked} onchange={() => toggleTemplate(t.id)} />
                    <span>{t.name}</span>
                    {#if t.tier === 'business'}
                      <span class="business-badge">Business</span>
                    {/if}
                    <span class="selected-meta">{t.items.length} Punkte · {t.category}</span>
                  </label>
                </li>
              {/each}
            </ul>
          </details>

          {#if selectedTemplates.size > 0}
            <p class="selection-count">{selectedTemplates.size} {selectedTemplates.size === 1 ? 'Checkliste' : 'Checklisten'} ausgewählt</p>
          {/if}
          {#if classifierDone && selectedTemplates.size === 0}
            <p class="warning-hint">Keine Checklisten ausgewählt. Sie können später welche hinzufügen.</p>
          {/if}

          <div class="create-own">
            <button class="btn-secondary" onclick={() => { oncomplete(); currentView.set('template:new'); }}>
              Eigene Checkliste erstellen →
            </button>
            <p class="hint">Sie können jederzeit eigene Checklisten erstellen — kostenlos und ohne Einschränkung.</p>
          </div>
        {/if}

      {:else if step === 4}
        <!-- Firmendaten (optional) -->
        <h2>Ihre Daten (optional)</h2>
        <p class="hint">Erscheint als Briefkopf auf Ihren Prüfprotokollen. Sie können das auch später unter Einstellungen ergänzen.</p>
        <div class="fields">
          <div class="field">
            <label for="wiz-org">Organisation</label>
            <input id="wiz-org" bind:value={org.name} placeholder="Name der Organisation" />
          </div>
          <div class="row">
            <div class="field">
              <label for="wiz-street">Straße</label>
              <input id="wiz-street" bind:value={org.street} />
            </div>
            <div class="field small">
              <label for="wiz-zip">PLZ</label>
              <input id="wiz-zip" bind:value={org.zip} />
            </div>
            <div class="field">
              <label for="wiz-city">Ort</label>
              <input id="wiz-city" bind:value={org.city} />
            </div>
          </div>
          <div class="field">
            <label for="wiz-responsible">Verantwortliche Person</label>
            <input id="wiz-responsible" bind:value={org.responsible} placeholder="z.B. Max Mustermann, Sicherheitsbeauftragter" />
          </div>
        </div>

      {:else if step === 5}
        <!-- Fertig -->
        <div class="finish-screen">
          <div class="success-icon">&#10003;</div>
          <h2>Einrichtung abgeschlossen!</h2>
          {#if importedCount > 0}
            <p>{importedCount} {importedCount === 1 ? 'Checkliste wurde' : 'Checklisten wurden'} importiert.</p>
          {:else}
            <p>Sie können jederzeit Checklisten aus der Bibliothek importieren.</p>
          {/if}
        </div>
      {/if}
    </div>

    <div class="wizard-footer">
      {#if step !== 5}
        <button class="btn-skip" onclick={handleSkipAll}>
          Einrichtung überspringen
        </button>
      {:else}
        <div></div>
      {/if}
      {#if step > 1}
        <button class="btn-back" onclick={handleBack}>
          &larr; Zurück
        </button>
      {/if}
      <div class="footer-right">
        {#if step === 1}
          <!-- Step 1: only the body buttons -->
        {:else if step === 2 && !demoCompleted}
          <!-- Step 2 interactive: only body buttons -->
        {:else if step === 2 && demoCompleted}
          <!-- Step 2 success: only body buttons -->
        {:else if step === 3}
          <button class="btn-primary" onclick={handleNext} disabled={saving}>
            {saving ? 'Importiere...' : 'Weiter'}
          </button>
        {:else if step === 4}
          <button class="btn-secondary" onclick={() => { step = 5; }}>
            Überspringen
          </button>
          <button class="btn-primary" onclick={handleNext}>
            Weiter
          </button>
        {:else if step === 5}
          <button class="btn-primary btn-large" onclick={handleNext}>
            Zum Dashboard &rarr;
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .wizard-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .wizard {
    background: white;
    border-radius: 0.75rem;
    width: 640px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .wizard-header {
    padding: 1.5rem 1.5rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .wizard-header h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .subtitle {
    color: var(--color-text-muted);
    font-size: 0.875rem;
    margin: 0.25rem 0 1rem;
  }

  .progress {
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--color-primary);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .step-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 0.25rem;
    display: block;
  }

  .wizard-body {
    padding: 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  .wizard-body h2 {
    margin: 0 0 0.25rem;
    font-size: 1.125rem;
  }

  .hint {
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    margin: 0 0 1rem;
  }

  /* Step 1: Welcome */
  .welcome p {
    font-size: 0.9375rem;
    line-height: 1.5;
    margin: 0 0 1.25rem;
  }

  .welcome-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .info-box {
    padding: 0.75rem 1rem;
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    color: #1e40af;
    line-height: 1.5;
    margin-bottom: 1rem;
  }

  .info-box-warning {
    background: #fffbeb;
    border-left-color: #f59e0b;
    color: #92400e;
  }

  /* Step 2: Demo checklist */
  .demo-progress-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }

  .demo-progress-bar {
    height: 6px;
    background: var(--color-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .demo-progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 3px;
    transition: width 0.3s;
  }

  .demo-progress-label {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .demo-checklist {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .check-item {
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    background: var(--color-surface);
  }

  .check-header {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .check-num {
    font-weight: 700;
    min-width: 1.5rem;
  }

  .check-label {
    font-weight: 600;
    flex: 1;
  }

  .check-required {
    font-size: 0.6875rem;
    color: var(--color-primary);
  }

  .check-hint {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin: 0.25rem 0 0 2rem;
  }

  .check-buttons {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    margin-left: 2rem;
  }

  .result-btn {
    padding: 0.375rem 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    background: white;
    font-size: 0.875rem;
    cursor: pointer;
    min-height: 44px;
    min-width: 44px;
  }

  .result-btn:hover {
    background: var(--color-surface);
  }

  .active-ok {
    background: #c6f6d5;
    border-color: #38a169;
    color: #22543d;
  }

  .active-fail {
    background: #fed7d7;
    border-color: #e53e3e;
    color: #9b2c2c;
  }

  .active-na {
    background: #e2e8f0;
    border-color: #a0aec0;
    color: #4a5568;
  }

  .check-item textarea {
    margin-top: 0.5rem;
    margin-left: 2rem;
    width: calc(100% - 2rem);
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    resize: vertical;
  }

  .demo-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  /* Demo success screen */
  .demo-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 2rem 0;
  }

  .demo-success h2 {
    margin: 0.5rem 0 0.25rem;
  }

  .demo-success p {
    color: var(--color-text-muted);
    margin: 0 0 1.5rem;
  }

  .demo-success-actions {
    display: flex;
    gap: 0.75rem;
  }

  .success-icon {
    font-size: 3rem;
    color: #38a169;
    line-height: 1;
  }

  /* Step 3: KI-Assistent */
  .assistant-input {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .assistant-input input {
    flex: 1;
    padding: 0.75rem;
    border: 2px solid var(--color-border);
    border-radius: 0.5rem;
    font-size: 1rem;
  }

  .assistant-input input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .btn-classify {
    padding: 0.75rem 1.25rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-classify:disabled {
    opacity: 0.5;
  }

  .btn-mic {
    padding: 0.75rem;
    background: none;
    border: 2px solid var(--color-border);
    border-radius: 0.5rem;
    font-size: 1.25rem;
    cursor: pointer;
    min-width: 48px;
  }

  .btn-mic:disabled {
    opacity: 0.5;
  }

  .skip-link {
    margin-top: 0.75rem;
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--color-primary);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .classifier-result {
    background: #f0fff4;
    border-left: 3px solid #38a169;
    border-radius: 0.375rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  .classifier-result p {
    margin: 0;
  }

  .selected-list {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .selected-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .selected-item input {
    width: 1rem;
    height: 1rem;
  }

  .selected-meta {
    color: #718096;
    font-size: 0.75rem;
  }

  .selected-hint {
    font-size: 0.75rem;
    color: #718096;
    margin-top: 0.5rem;
  }

  .manual-expand {
    margin-top: 0.75rem;
    font-size: 0.875rem;
  }

  .manual-expand summary {
    cursor: pointer;
    color: var(--color-primary);
    font-weight: 600;
  }

  .branch-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.75rem;
  }

  .branch-btn {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    background: none;
    font-size: 0.75rem;
    cursor: pointer;
    color: var(--color-text);
  }

  .branch-btn:hover {
    border-color: var(--color-primary);
  }

  .branch-btn.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  .checklist-select {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    max-height: 250px;
    overflow-y: auto;
  }

  .selection-count {
    font-size: 0.8125rem;
    color: var(--color-primary);
    font-weight: 600;
    margin: 0.5rem 0 0;
  }

  /* Step 4: Organisation */
  .fields {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    flex: 1;
  }

  .field.small {
    max-width: 100px;
  }

  .field label {
    font-weight: 600;
    font-size: 0.8125rem;
  }

  .row {
    display: flex;
    gap: 1rem;
  }

  input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(43, 108, 176, 0.15);
  }

  /* Step 5: Finish */
  .finish-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 3rem 0;
  }

  .finish-screen h2 {
    margin: 0.5rem 0 0.25rem;
  }

  .finish-screen p {
    color: var(--color-text-muted);
    font-size: 0.9375rem;
    margin: 0;
  }

  /* Footer */
  .wizard-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .footer-right {
    display: flex;
    gap: 0.5rem;
  }

  .btn-primary {
    padding: 0.5rem 1.25rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-large {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    min-height: 44px;
  }

  .btn-secondary {
    padding: 0.5rem 1rem;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: var(--color-surface);
  }

  .btn-skip {
    padding: 0.5rem 0;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .btn-skip:hover {
    color: var(--color-text);
  }

  .create-own { margin-top: 1rem; text-align: center; }
  .create-own .btn-secondary { padding: 0.5rem 1.5rem; }

  .warning-hint { color: #e65100; font-size: 0.8125rem; margin-top: 0.5rem; }
  .business-badge { background: #6366f1; color: white; font-size: 0.625rem; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
  .business-hint { font-size: 0.8125rem; color: #6366f1; margin-top: 0.5rem; font-style: italic; }
  .template-locked { opacity: 0.6; }

  .btn-back {
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .btn-back:hover { color: var(--color-text); }
</style>
