<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { importLibraryTemplate, getTemplates } from '../lib/db.js';
  import libraryData from '../assets/template-library.json';
  import Glossar from '../components/Glossar.svelte';

  let { embedded = false } = $props();

  let templates = $state([]);
  let existingNames = $state([]);
  let importing = $state(null);
  let importedIds = $state(new Set());
  let selectedBranch = $state('alle');
  let hasBusinessLicense = $state(false);

  // --- Stufe 1: KI-Prompt ---
  let promptCopied = $state(false);

  const aiPrompt = `Ich brauche Prüfchecklisten für meinen Betrieb als CSV-Datei.

Format: Semikolon-getrennt, eine Checkliste pro Zeile.
Spalten: Name;Beschreibung;Kategorie;Intervall (Tage);Prüfpunkte (getrennt mit |)

Beispiel:
Feuerlöscher-Prüfung;Jährliche Sichtprüfung;Brandschutz;365;Plombierung intakt|Prüfdatum aktuell|Standort gekennzeichnet|Beschilderung vorhanden

Mein Betrieb:
[HIER IHREN BETRIEB BESCHREIBEN — z.B. "Imbiss mit Fritteuse und Zapfanlage" oder "Büro mit 5 Arbeitsplätzen" oder "Kita mit Außengelände"]

Bitte erstelle 5-10 passende Checklisten mit jeweils 5-10 Prüfpunkten.
Berücksichtige deutsche Vorschriften (DGUV, BetrSichV, ArbStättV).
Gib nur die CSV aus, ohne Erklärungen.`;

  function copyPrompt() {
    navigator.clipboard.writeText(aiPrompt);
    promptCopied = true;
    setTimeout(() => promptCopied = false, 3000);
  }

  // --- Stufe 2: Keyword-Classifier ---
  let betriebText = $state('');
  let classifierResults = $state(null);

  const keywords = {
    gastro: ['restaurant', 'imbiss', 'café', 'cafe', 'küche', 'kochen', 'gastronomie', 'speisen', 'essen', 'trinken', 'bar', 'kneipe', 'zapf', 'bier', 'getränke', 'fritteuse', 'grill', 'ofen', 'spülmaschine', 'lebensmittel', 'hygiene', 'haccp', 'gesundheitszeugnis', 'bewirtung', 'catering', 'kantine', 'mensa', 'bäckerei', 'metzgerei', 'fleisch', 'fisch'],
    buero: ['büro', 'office', 'schreibtisch', 'bildschirm', 'computer', 'monitor', 'arbeitsplatz', 'praxis', 'kanzlei', 'agentur', 'beratung', 'verwaltung', 'empfang', 'besprechung', 'meeting', 'homeoffice', 'drucker', 'server'],
    kita: ['kita', 'kindergarten', 'kinderbetreuung', 'krippe', 'hort', 'schule', 'kinder', 'spielplatz', 'spielgeräte', 'turnhalle', 'sport', 'betreuung', 'erzieher', 'außengelände', 'sandkasten', 'rutsche', 'schaukel'],
    handwerk: ['werkstatt', 'handwerk', 'maschine', 'werkzeug', 'säge', 'bohren', 'schleifen', 'schweißen', 'lackieren', 'schreinerei', 'tischlerei', 'schlosserei', 'elektro', 'installation', 'montage', 'baustelle', 'gerüst', 'leiter', 'höhenarbeit', 'kran', 'stapler', 'gabelstapler', 'lager', 'regal', 'palette', 'produktion', 'fertigung'],
    einzelhandel: ['laden', 'geschäft', 'shop', 'verkauf', 'kasse', 'regal', 'lager', 'einzelhandel', 'handel', 'filiale', 'supermarkt', 'boutique', 'drogerie', 'apotheke', 'optiker', 'warenhaus'],
    hausverwaltung: ['gebäude', 'haus', 'wohnung', 'mieter', 'vermieter', 'hausverwaltung', 'immobilie', 'treppe', 'treppenhaus', 'aufzug', 'fahrstuhl', 'lift', 'heizung', 'wasser', 'legionellen', 'dach', 'keller', 'tiefgarage', 'parkhaus', 'garage'],
    verein: ['verein', 'sport', 'fußball', 'tennis', 'schwimmbad', 'turnhalle', 'sportplatz', 'minigolf', 'clubhaus', 'vereinsheim', 'mitglieder', 'ehrenamt', 'training', 'wettkampf'],
  };

  // Common keywords that apply to many businesses
  const commonKeywords = {
    brandschutz: ['feuer', 'brand', 'feuerlöscher', 'rauchmelder', 'fluchtweg', 'notausgang', 'alarm'],
    elektro: ['strom', 'elektrisch', 'kabel', 'steckdose', 'verlängerung', 'geräte', 'elektro'],
    fahrzeug: ['auto', 'fahrzeug', 'transporter', 'lieferwagen', 'fuhrpark', 'pkw', 'lkw'],
    erstehilfe: ['erste hilfe', 'verbandskasten', 'defibrillator', 'notfall'],
  };

  function classifyBetrieb(text) {
    const lower = text.toLowerCase();
    const words = lower.split(/[\s,;.!?]+/);
    const scores = {};

    // Score each branch
    for (const [branch, kws] of Object.entries(keywords)) {
      scores[branch] = 0;
      for (const kw of kws) {
        if (lower.includes(kw)) scores[branch] += 2;
      }
    }

    // Find matching branches (score > 0)
    const matched = Object.entries(scores)
      .filter(([_, s]) => s > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([branch]) => branch);

    // If nothing matched, return all
    if (matched.length === 0) return null;

    // Find matching templates
    const matchedTemplates = libraryData.filter(t => {
      if (!t.branches) return false;
      if (t.branches.includes('alle')) return true;
      return t.branches.some(b => matched.includes(b));
    });

    // Check for common extras
    const extras = [];
    for (const [key, kws] of Object.entries(commonKeywords)) {
      if (kws.some(kw => lower.includes(kw))) {
        extras.push(key);
      }
    }

    return {
      branches: matched,
      templates: matchedTemplates,
      extras,
      branchLabels: matched.map(b => {
        const found = branchLabels.find(bl => bl.key === b);
        return found ? found.label : b;
      }),
    };
  }

  function handleClassify() {
    if (!betriebText.trim()) return;
    classifierResults = classifyBetrieb(betriebText);
    if (classifierResults && classifierResults.branches.length > 0) {
      selectedBranch = classifierResults.branches[0];
    }
  }

  // --- Stufe 3: Spracheingabe ---
  let listening = $state(false);
  let speechSupported = $state(typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window));

  function startSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.continuous = false;
    recognition.interimResults = false;

    listening = true;
    recognition.onresult = (event) => {
      betriebText = event.results[0][0].transcript;
      listening = false;
      handleClassify();
    };
    recognition.onerror = () => { listening = false; };
    recognition.onend = () => { listening = false; };
    recognition.start();
  }

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

  let filteredTemplates = $derived.by(() => {
    if (selectedBranch === 'alle') return templates;
    return templates.filter(t =>
      t.branches && (t.branches.includes(selectedBranch) || t.branches.includes('alle'))
    );
  });

  onMount(async () => {
    templates = libraryData;
    const existing = await getTemplates();
    existingNames = existing.map(t => t.name);
    hasBusinessLicense = (await window.electronAPI?.license?.getStatus())?.active || false;
  });

  function alreadyExists(name) {
    return existingNames.includes(name) || importedIds.has(name);
  }

  async function handleImport(template) {
    importing = template.id;
    const id = await importLibraryTemplate(template);
    importedIds = new Set([...importedIds, template.name]);
    existingNames = [...existingNames, template.name];
    importing = null;
    currentView.set(`template:${id}`);
  }
</script>

<div class="page">
  {#if !embedded}
    <h1>Checklisten-Bibliothek</h1>
  {/if}
  <p class="description">Fertige Checklisten zum direkten Übernehmen. Die Checklisten können nach dem Import angepasst werden.</p>
  <div class="info-box">
    Diese Checklisten sind ein guter Start — sie sind keine amtliche Vorschrift. Passen Sie die Punkte an Ihren Betrieb an. Wenn Sie unsicher sind: Fragen Sie Ihre <Glossar term="BG">Berufsgenossenschaft (BG)</Glossar>. Jeder Betrieb in Deutschland hat eine BG.
  </div>

  <div class="assistant-section">
    <h3>Welche Checklisten brauchen Sie?</h3>
    <div class="assistant-input">
      <input
        type="text"
        bind:value={betriebText}
        placeholder="Beschreiben Sie Ihren Betrieb, z.B. Imbiss mit Fritteuse und Zapfanlage"
        onkeydown={(e) => { if (e.key === 'Enter') handleClassify(); }}
      />
      <button class="btn-classify" onclick={handleClassify} disabled={!betriebText.trim()}>Suchen</button>
      {#if speechSupported}
        <button class="btn-mic" onmousedown={startSpeech} disabled={listening} title="Sprechen">
          {listening ? '⏺' : '🎤'}
        </button>
      {/if}
    </div>

    {#if classifierResults}
      <div class="classifier-result">
        <p class="result-text">
          <strong>Diese Checklisten passen zu Ihrem Betrieb ({classifierResults.branchLabels.join(', ')}):</strong>
        </p>
        <ul class="result-list">
          {#each classifierResults.templates.filter(t => !t.branches?.includes('alle')).slice(0, 12) as t}
            <li>{t.name} <span class="result-meta">({t.items.length} Punkte)</span></li>
          {/each}
        </ul>
      </div>
    {/if}

    <details class="ai-prompt-section">
      <summary>Eigene Checklisten mit KI erstellen (ChatGPT, Claude, Gemini)</summary>
      <div class="ai-prompt-content">
        <p>Kopieren Sie diesen Prompt und fügen Sie ihn in Ihre KI ein. Beschreiben Sie dort Ihren Betrieb. Das Ergebnis können Sie als CSV unter „CSV-Import" einfügen.</p>
        <button class="btn-copy" onclick={copyPrompt}>
          {promptCopied ? '✓ Kopiert!' : 'Prompt kopieren'}
        </button>
      </div>
    </details>
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

  {#if !hasBusinessLicense}
    <div class="business-banner">
      <strong>35+ kuratierte Branchenvorlagen im Business-Paket</strong>
      <p>89 EUR/Jahr inkl. MwSt · <a href="https://portal.detmers-publish.de/nachweis-lokal#preise">Mehr erfahren</a></p>
    </div>
  {/if}

  <div class="library-grid">
    {#each filteredTemplates as t}
      {@const isLocked = t.tier === 'business' && !hasBusinessLicense}
      <div class="library-card" class:template-locked={isLocked}>
        <div class="card-header">
          <h3>{t.name}</h3>
          <span class="badge">{t.category}</span>
          {#if t.tier === 'business'}
            <span class="business-badge">Business</span>
          {/if}
        </div>
        <p class="card-desc">{t.description}</p>
        <div class="card-meta">
          <span>{t.items.length} Prüfpunkte</span>
          {#if t.interval_days}
            <span>Intervall: {t.interval_days} Tage</span>
          {/if}
        </div>
        <details class="items-preview">
          <summary>Prüfpunkte anzeigen</summary>
          <ul>
            {#each t.items as item, i}
              <li>
                <span class="item-num">{i + 1}.</span>
                {item.label}
                {#if item.required}<span class="item-required">Pflicht</span>{/if}
              </li>
            {/each}
          </ul>
        </details>
        <div class="card-actions">
          {#if isLocked}
            <button class="btn-primary" disabled>Im Business-Paket enthalten</button>
          {:else if alreadyExists(t.name)}
            <button class="btn-secondary" disabled>Bereits vorhanden</button>
          {:else}
            <button class="btn-primary" onclick={() => handleImport(t)} disabled={importing === t.id}>
              {importing === t.id ? 'Wird importiert...' : 'Checkliste übernehmen'}
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  {#if !embedded}
    <button class="btn-secondary" onclick={() => currentView.set('templates')}>Zurück zu Checklisten</button>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .description { color: var(--color-text-muted); font-size: 0.875rem; }
  .info-box {
    padding: 0.75rem 1rem;
    background: #eff6ff;
    border-left: 3px solid #3b82f6;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    color: #1e40af;
    line-height: 1.5;
  }
  .assistant-section {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .assistant-section h3 { font-size: 0.9375rem; margin: 0; }
  .assistant-input { display: flex; gap: 0.5rem; }
  .assistant-input input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  .assistant-input input:focus { outline: none; border-color: var(--color-primary); }
  .btn-classify {
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-classify:disabled { opacity: 0.5; }
  .btn-mic {
    padding: 0.5rem;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 1.125rem;
    cursor: pointer;
    min-width: 40px;
  }
  .btn-mic:disabled { opacity: 0.5; }
  .result-list { list-style: none; margin: 0.5rem 0 0; columns: 2; }
  .result-list li { font-size: 0.8125rem; padding: 0.125rem 0; break-inside: avoid; }
  .result-meta { color: #718096; font-size: 0.75rem; }
  @media (max-width: 600px) { .result-list { columns: 1; } }
  .classifier-result {
    background: #f0fff4;
    border-left: 3px solid #38a169;
    border-radius: 0.375rem;
    padding: 0.625rem 0.75rem;
    font-size: 0.8125rem;
  }
  .result-text { margin: 0; }
  .ai-prompt-section { font-size: 0.8125rem; color: var(--color-text-muted); }
  .ai-prompt-section summary { cursor: pointer; color: var(--color-primary); }
  .ai-prompt-content { margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .ai-prompt-content p { margin: 0; line-height: 1.5; }
  .btn-copy {
    align-self: flex-start;
    padding: 0.375rem 0.75rem;
    background: none;
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .branch-filter { display: flex; flex-wrap: wrap; gap: 0.375rem; }
  .branch-btn {
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--color-border);
    border-radius: 1rem;
    background: none;
    font-size: 0.8125rem;
    cursor: pointer;
    color: var(--color-text);
  }
  .branch-btn:hover { border-color: var(--color-primary); }
  .branch-btn.active {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }
  .library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
  .library-card {
    padding: 1rem;
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
  .card-header h3 { margin: 0; font-size: 1rem; }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.6875rem; font-weight: 600; background: #e2e8f0; color: #4a5568; white-space: nowrap; }
  .card-desc { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0; }
  .card-meta { display: flex; gap: 1rem; font-size: 0.75rem; color: var(--color-text-muted); }
  .items-preview { font-size: 0.8125rem; }
  .items-preview summary { cursor: pointer; color: var(--color-primary); }
  .items-preview ul { margin: 0.5rem 0 0; padding-left: 0; list-style: none; }
  .items-preview li { padding: 0.125rem 0; display: flex; gap: 0.25rem; align-items: baseline; }
  .item-num { font-weight: 700; min-width: 1.25rem; }
  .item-required { font-size: 0.625rem; color: var(--color-primary); }
  .card-actions { margin-top: auto; padding-top: 0.5rem; }
  .btn-primary { padding: 0.375rem 0.75rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; font-size: 0.8125rem; }
  .btn-secondary { padding: 0.375rem 0.75rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; font-size: 0.8125rem; }
  .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .template-locked { opacity: 0.7; }
  .template-locked .card-actions .btn-primary { background: #a0aec0; cursor: not-allowed; }
  .business-badge { background: #6366f1; color: white; font-size: 0.625rem; padding: 0.125rem 0.375rem; border-radius: 0.25rem; }
  .business-banner { background: #f0f7ff; border: 1px solid #3b82f6; border-radius: 0.5rem; padding: 1rem; text-align: center; font-size: 0.875rem; }
  .business-banner p { margin: 0.25rem 0 0; }
  .business-banner a { color: #2563eb; }
</style>
