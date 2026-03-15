<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import {
    getDueInspections, getInspectionStats, getOpenDefectCount,
    getRecentInspections, getOpenDefects, getTemplates, getObjects,
    saveInspection, initInspectionResults, getTemplateItems, getOrgProfile
  } from '../lib/db.js';
  import { generateBlankFormPdf } from '../lib/pdf.js';
  import { saveObject } from '../lib/db.js';
  import Glossar from '../components/Glossar.svelte';

  let { onStartWizard = null } = $props();

  // Quick-Start
  let showQuickStart = $state(false);
  let qsTemplates = $state([]);
  let qsObjects = $state([]);
  let qsForm = $state({ template_id: '', object_id: '', inspector: '' });
  let qsStarting = $state(false);
  let showNewObject = $state(false);
  let newObjName = $state('');
  let newObjLocation = $state('');

  async function openQuickStart() {
    showQuickStart = true;
    qsTemplates = await getTemplates();
    qsObjects = await getObjects();
  }

  async function handleQuickCreate() {
    if (!qsForm.template_id) return;
    qsStarting = true;
    const today = new Date().toISOString().split('T')[0];
    const template = qsTemplates.find(t => t.id === parseInt(qsForm.template_id));
    const id = await saveInspection({
      template_id: parseInt(qsForm.template_id),
      object_id: qsForm.object_id ? parseInt(qsForm.object_id) : null,
      title: template?.name || 'Prüfung',
      inspector: qsForm.inspector || '',
      inspection_date: today,
      status: 'offen',
      notes: null,
    });
    await initInspectionResults(id, parseInt(qsForm.template_id));
    qsStarting = false;
    showQuickStart = false;
    currentView.set(`inspection:execute:${id}`);
  }

  async function handleInlineObject() {
    if (!newObjName.trim()) return;
    const id = await saveObject({ name: newObjName.trim(), location: newObjLocation.trim() || null, category: null, identifier: null, notes: null });
    qsObjects = await getObjects();
    qsForm.object_id = String(id);
    showNewObject = false;
    newObjName = '';
    newObjLocation = '';
  }

  let stats = $state({ total: 0, offen: 0, bestanden: 0, bemaengelt: 0 });
  let dueItems = $state([]);
  let openDefectCount = $state(0);
  let openDefects = $state([]);
  let recentInspections = $state([]);

  let overdueItems = $derived(dueItems.filter(d => d.urgency === 'ueberfaellig'));
  let soonDueItems = $derived(dueItems.filter(d => d.urgency === 'bald_faellig'));
  let okItems = $derived(dueItems.filter(d => d.urgency === 'ok'));
  let complianceRate = $derived(dueItems.length > 0 ? Math.round(okItems.length / dueItems.length * 100) : null);

  let startingInspection = $state(null);

  onMount(async () => {
    [stats, dueItems, openDefectCount, openDefects, recentInspections] = await Promise.all([
      getInspectionStats(),
      getDueInspections(),
      getOpenDefectCount(),
      getOpenDefects(5),
      getRecentInspections(5),
    ]);
  });

  function formatDate(iso) {
    if (!iso) return 'Nie';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  function daysUntil(iso) {
    if (!iso) return null;
    const diff = Math.round((new Date(iso) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function daysLabel(iso) {
    const days = daysUntil(iso);
    if (days === null) return '';
    if (days < 0) return `${Math.abs(days)} Tage überfällig`;
    if (days === 0) return 'Heute fällig';
    return `in ${days} Tagen`;
  }

  async function handlePrintForm(item) {
    const templateItems = await getTemplateItems(item.template_id);
    const profile = await getOrgProfile();
    await generateBlankFormPdf(
      { name: item.template_name, description: '', category: '' },
      templateItems,
      profile
    );
  }

  async function handleQuickStart(item) {
    startingInspection = item.template_id;
    const today = new Date().toISOString().split('T')[0];
    const id = await saveInspection({
      template_id: item.template_id,
      object_id: item.object_id ?? null,
      title: item.template_name,
      inspector: '',
      inspection_date: today,
      status: 'offen',
      notes: null,
    });
    await initInspectionResults(id, item.template_id);
    startingInspection = null;
    currentView.set(`inspection:execute:${id}`);
  }
</script>

<div class="dashboard">
  <div class="dashboard-header">
    <h1>Dashboard</h1>
    {#if onStartWizard}
      <button class="btn-wizard" onclick={onStartWizard}>
        🧭 Einrichtungsassistent
      </button>
    {/if}
  </div>

  <div class="disclaimer-bar">
    Diese App dokumentiert Ihre Prüfungen — sie ersetzt keine Fachberatung. Welche Prüfungen vorgeschrieben sind, erfahren Sie bei Ihrer <Glossar term="BG">Berufsgenossenschaft (BG)</Glossar>. Die Beratung ist kostenlos.
  </div>

  {#if !showQuickStart}
    <button class="btn-new-inspection" onclick={openQuickStart}>
      + Neue Prüfung starten
    </button>
  {:else}
    <div class="quick-start">
      <h3>Neue Prüfung</h3>
      <div class="qs-fields">
        <div class="qs-field">
          <label>Checkliste *</label>
          <select bind:value={qsForm.template_id}>
            <option value="">Bitte wählen...</option>
            {#each qsTemplates as t}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        </div>
        <div class="qs-field">
          <label>Wo prüfen?</label>
          <select bind:value={qsForm.object_id} onchange={(e) => { if (e.target.value === '__new__') { showNewObject = true; qsForm.object_id = ''; } }}>
            <option value="">Ohne Zuordnung</option>
            {#each qsObjects as o}
              <option value={o.id}>{o.name}{o.location ? ` (${o.location})` : ''}</option>
            {/each}
            <option value="__new__">+ Neu anlegen...</option>
          </select>
        </div>
        {#if showNewObject}
          <div class="qs-inline-new">
            <input bind:value={newObjName} placeholder="Name, z.B. Kiosk oder Fritteuse" />
            <input bind:value={newObjLocation} placeholder="Standort (optional)" />
            <div class="qs-inline-btns">
              <button class="btn-small btn-primary" onclick={handleInlineObject}>Anlegen</button>
              <button class="btn-small btn-secondary" onclick={() => { showNewObject = false; }}>Abbrechen</button>
            </div>
          </div>
        {/if}
        <div class="qs-field">
          <label>Prüfer</label>
          <input bind:value={qsForm.inspector} placeholder="Ihr Name" />
        </div>
      </div>
      <div class="qs-actions">
        <button class="btn-primary" onclick={handleQuickCreate} disabled={!qsForm.template_id || qsStarting}>
          {qsStarting ? 'Wird erstellt...' : 'Prüfung starten →'}
        </button>
        <button class="btn-secondary" onclick={() => { showQuickStart = false; }}>Abbrechen</button>
      </div>
    </div>
  {/if}

  {#if overdueItems.length > 0}
    <div class="section section-urgent">
      <div class="section-header danger">
        <h2>!! {overdueItems.length} {overdueItems.length === 1 ? 'Prüfung' : 'Prüfungen'} überfällig</h2>
      </div>
      <div class="action-list">
        {#each overdueItems as item}
          <div class="action-row danger">
            <div class="action-info">
              <span class="action-name">{item.template_name}</span>
              {#if item.object_name}<span class="action-object">{item.object_name}</span>{/if}
              <span class="action-days">{daysLabel(item.next_due)}</span>
            </div>
            <div class="action-buttons">
              <button
                class="btn-print"
                onclick={() => handlePrintForm(item)}
              >Drucken</button>
              <button
                class="btn-action"
                onclick={() => handleQuickStart(item)}
                disabled={startingInspection === item.template_id}
              >
                {startingInspection === item.template_id ? '...' : 'Jetzt prüfen →'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if soonDueItems.length > 0}
    <div class="section">
      <div class="section-header warning">
        <h2>Bald fällig ({soonDueItems.length})</h2>
      </div>
      <div class="action-list">
        {#each soonDueItems as item}
          <div class="action-row warning">
            <div class="action-info">
              <span class="action-name">{item.template_name}</span>
              {#if item.object_name}<span class="action-object">{item.object_name}</span>{/if}
              <span class="action-days">{daysLabel(item.next_due)}</span>
            </div>
            <div class="action-buttons">
              <button
                class="btn-print"
                onclick={() => handlePrintForm(item)}
              >Drucken</button>
              <button
                class="btn-action btn-action-secondary"
                onclick={() => handleQuickStart(item)}
                disabled={startingInspection === item.template_id}
              >
                {startingInspection === item.template_id ? '...' : 'Prüfen →'}
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if overdueItems.length === 0 && soonDueItems.length === 0 && stats.total === 0}
    <div class="section section-tip">
      <p class="tip-text">
        <strong>Tipp:</strong> Welche Prüfungen müssen Sie machen? Das hängt von Ihrem Betrieb ab. Ihre <Glossar term="BG">Berufsgenossenschaft (BG)</Glossar> hilft Ihnen — die Beratung ist kostenlos. Die BG hat Listen für jede Branche.
      </p>
    </div>
  {:else if overdueItems.length === 0 && soonDueItems.length === 0}
    <div class="section section-ok">
      <p class="all-clear">Ihre eingerichteten Prüfungen sind alle aktuell. Prüfen Sie unter „Checklisten", ob es weitere Prüfungen gibt, die für Ihren Betrieb wichtig sind.</p>
    </div>
  {/if}

  <div class="stats">
    {#if complianceRate !== null}
      <div class="stat-card compliance-card">
        <div class="stat-value" class:success={complianceRate >= 80} class:warning={complianceRate >= 50 && complianceRate < 80} class:danger={complianceRate < 50}>{complianceRate}%</div>
        <div class="stat-label">Prüfungen aktuell</div>
        <div class="stat-detail">{okItems.length} von {dueItems.length} im Zeitplan</div>
      </div>
    {/if}
    <div class="stat-card">
      <div class="stat-value">{stats.total}</div>
      <div class="stat-label">Gesamt</div>
    </div>
    <div class="stat-card">
      <div class="stat-value success">{stats.bestanden}</div>
      <div class="stat-label">Bestanden</div>
    </div>
    <div class="stat-card">
      <div class="stat-value danger">{stats.bemaengelt}</div>
      <div class="stat-label">Mit Mängeln</div>
    </div>
  </div>

  {#if openDefects.length > 0}
    <div class="section">
      <div class="section-header">
        <h2>Offene Mängel ({openDefectCount})</h2>
        {#if openDefectCount > 5}
          <button class="link-btn" onclick={() => currentView.set('defects')}>Alle anzeigen →</button>
        {/if}
      </div>
      <div class="defect-list">
        {#each openDefects as defect}
          <div class="defect-row clickable" onclick={() => currentView.set(`defect:${defect.id}`)}>
            <span class="defect-label">{defect.item_label}</span>
            <span class="defect-object">{defect.object_name ?? defect.inspection_title}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if recentInspections.length > 0}
    <div class="section">
      <div class="section-header">
        <h2>Zuletzt bearbeitet</h2>
      </div>
      <div class="recent-list">
        {#each recentInspections as insp}
          <div class="recent-row clickable" onclick={() => currentView.set(`inspection:${insp.id}`)}>
            <div class="recent-info">
              <span class="recent-title">{insp.title}</span>
              {#if insp.object_name}<span class="recent-object">{insp.object_name}</span>{/if}
            </div>
            <div class="recent-meta">
              <span class="badge badge-{insp.status === 'bestanden' ? 'success' : insp.status === 'bemaengelt' ? 'danger' : 'muted'}">{insp.status === 'bemaengelt' ? 'Mit Mängeln' : insp.status}</span>
              <span class="recent-date">{formatDate(insp.inspection_date)}</span>
              <button class="btn-phone" onclick={() => currentView.set(`inspection:${insp.id}`)} title="Am Handy prüfen">📱</button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="actions">
    <button class="btn-primary" onclick={() => currentView.set('inspection:new')}>+ Neue Prüfung</button>
    <button class="btn-secondary" onclick={() => currentView.set('inspections')}>Alle Prüfungen</button>
  </div>
</div>

<style>
  .dashboard { display: flex; flex-direction: column; gap: 1.25rem; }
  .dashboard-header { display: flex; justify-content: space-between; align-items: center; }
  .btn-new-inspection {
    width: 100%; padding: 1rem; background: var(--color-primary); color: white;
    border: none; border-radius: 0.5rem; font-size: 1.0625rem; font-weight: 600;
    cursor: pointer; text-align: center;
  }
  .btn-new-inspection:hover { opacity: 0.9; }

  .quick-start {
    background: white; border: 2px solid var(--color-primary); border-radius: 0.5rem;
    padding: 1.25rem;
  }
  .quick-start h3 { margin: 0 0 1rem; font-size: 1rem; }
  .qs-fields { display: flex; flex-direction: column; gap: 0.75rem; }
  .qs-field { display: flex; flex-direction: column; gap: 0.25rem; }
  .qs-field label { font-weight: 600; font-size: 0.8125rem; }
  .qs-field select, .qs-field input { width: 100%; }
  .qs-inline-new {
    padding: 0.75rem; background: #f0f7ff; border: 1px solid var(--color-primary);
    border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.5rem;
  }
  .qs-inline-btns { display: flex; gap: 0.5rem; }
  .qs-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
  .btn-small { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }

  .btn-wizard {
    padding: 0.5rem 1rem; background: var(--color-surface);
    border: 2px solid var(--color-primary); border-radius: 0.375rem;
    color: var(--color-primary); font-size: 0.875rem; font-weight: 600; cursor: pointer;
  }
  .btn-wizard:hover { background: var(--color-primary); color: white; }

  .section { border: 1px solid var(--color-border); border-radius: 0.5rem; overflow: hidden; }
  .section-urgent { border-color: #e53e3e; }
  .section-ok { padding: 1rem; background: #f0fff4; }
  .all-clear { color: #22543d; margin: 0; font-size: 0.875rem; }
  .section-tip { background: #eff6ff; border-left: 3px solid #3b82f6; }
  .tip-text { color: #1e40af; margin: 0; font-size: 0.875rem; line-height: 1.5; }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.625rem 1rem;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  .section-header h2 { margin: 0; font-size: 0.9375rem; }
  .section-header.danger { background: #fed7d7; }
  .section-header.danger h2 { color: #9b2c2c; }
  .section-header.warning { background: #fefcbf; }
  .section-header.warning h2 { color: #744210; }

  .action-list, .defect-list, .recent-list { padding: 0; }

  .action-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.625rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }
  .action-row:last-child { border-bottom: none; }
  .action-row.danger { background: #fff5f5; }
  .action-row.warning { background: #fffff0; }

  .action-info { display: flex; gap: 0.75rem; align-items: center; flex: 1; min-width: 0; }
  .action-name { font-weight: 600; font-size: 0.875rem; }
  .action-object { color: var(--color-text-muted); font-size: 0.8125rem; }
  .action-days { color: var(--color-text-muted); font-size: 0.75rem; white-space: nowrap; }

  .btn-action {
    padding: 0.375rem 0.75rem;
    background: #e53e3e;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-action:hover { background: #c53030; }
  .btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-action-secondary { background: #ecc94b; color: #744210; }
  .btn-action-secondary:hover { background: #d69e2e; }

  .action-buttons { display: flex; gap: 0.5rem; align-items: center; }
  .btn-print {
    padding: 0.375rem 0.75rem;
    background: none;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-print:hover { background: var(--color-surface); color: var(--color-text); }

  .stats { display: flex; gap: 1rem; }
  .stat-card {
    flex: 1;
    padding: 1rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    text-align: center;
  }
  .stat-value { font-size: 2rem; font-weight: 700; }
  .stat-value.open { color: var(--color-text-muted); }
  .stat-value.success { color: var(--color-success); }
  .stat-value.danger { color: var(--color-danger); }
  .stat-label { font-size: 0.8125rem; color: var(--color-text-muted); }
  .stat-detail { font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.125rem; }
  .stat-value.warning { color: var(--color-warning); }
  .compliance-card { border-left: 3px solid var(--color-primary); }

  .defect-row, .recent-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }
  .defect-row:last-child, .recent-row:last-child { border-bottom: none; }

  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--color-surface); }

  .defect-label { font-size: 0.875rem; font-weight: 500; }
  .defect-object { font-size: 0.8125rem; color: var(--color-text-muted); }

  .recent-info { display: flex; gap: 0.5rem; align-items: center; }
  .recent-title { font-size: 0.875rem; font-weight: 500; }
  .recent-object { font-size: 0.8125rem; color: var(--color-text-muted); }
  .recent-meta { display: flex; gap: 0.75rem; align-items: center; }
  .recent-date { font-size: 0.75rem; color: var(--color-text-muted); }

  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
  .badge-success { background: #c6f6d5; color: #22543d; }
  .badge-danger { background: #fed7d7; color: #9b2c2c; }
  .badge-muted { background: #e2e8f0; color: #4a5568; }

  .link-btn { background: none; border: none; color: var(--color-primary); font-size: 0.8125rem; cursor: pointer; }
  .link-btn:hover { text-decoration: underline; }

  .actions { display: flex; gap: 0.75rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; cursor: pointer; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; cursor: pointer; }

  .disclaimer-bar {
    font-size: 0.8125rem;
    color: #5a6a7e;
    background: #f0f7ff;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    border-left: 3px solid #3b82f6;
    line-height: 1.5;
  }

  .btn-phone {
    background: none;
    border: none;
    font-size: 1.125rem;
    cursor: pointer;
    padding: 0.25rem;
    opacity: 0.6;
  }
  .btn-phone:hover { opacity: 1; }
</style>
