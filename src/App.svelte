<script>
  import { onMount } from 'svelte';
  import { currentView } from './lib/stores/navigation.js';
  import { initDb, getTemplates, getOrgProfile, getDueInspections } from './lib/db.js';
  import { sub, getLanguage, setLanguage, availableLanguages } from './lib/i18n.js';
  import Dashboard from './routes/Dashboard.svelte';
  import FirstRunWizard from './routes/FirstRunWizard.svelte';
  import TemplateList from './routes/TemplateList.svelte';
  import TemplateForm from './routes/TemplateForm.svelte';
  import TemplateDetail from './routes/TemplateDetail.svelte';
  import ObjectList from './routes/ObjectList.svelte';
  import ObjectForm from './routes/ObjectForm.svelte';
  import ObjectDetail from './routes/ObjectDetail.svelte';
  import InspectionList from './routes/InspectionList.svelte';
  import InspectionForm from './routes/InspectionForm.svelte';
  import InspectionDetail from './routes/InspectionDetail.svelte';
  import InspectionExecute from './routes/InspectionExecute.svelte';
  import DefectList from './routes/DefectList.svelte';
  import DefectDetail from './routes/DefectDetail.svelte';
  import Settings from './routes/Settings.svelte';
  import SupportHub from './routes/SupportHub.svelte';

  let dbReady = $state(false);
  let dbError = $state(null);
  let showWizard = $state(false);

  onMount(async () => {
    try {
      await initDb();
      dbReady = true;
      // First-Run-Erkennung: kein Profil und keine Vorlagen
      const [templates, profile] = await Promise.all([getTemplates(), getOrgProfile()]);
      if (templates.length === 0 && !profile?.name) {
        showWizard = true;
      }
      // System-Benachrichtigung bei ueberfaelligen Pruefungen
      checkOverdueNotifications();
      window.electronAPI?.app?.rendererReady?.();
    } catch (err) {
      dbError = err.message;
      window.electronAPI?.app?.rendererReady?.();
    }
  });

  async function checkOverdueNotifications() {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'denied') return;
      if (Notification.permission !== 'granted') {
        await Notification.requestPermission();
      }
      if (Notification.permission !== 'granted') return;

      const dueItems = await getDueInspections();
      const overdue = dueItems.filter(d => d.urgency === 'ueberfaellig');
      if (overdue.length === 0) return;

      const body = overdue.length === 1
        ? `${overdue[0].template_name}${overdue[0].object_name ? ' — ' + overdue[0].object_name : ''}`
        : overdue.slice(0, 3).map(d => d.template_name).join(', ') + (overdue.length > 3 ? ` (+${overdue.length - 3} weitere)` : '');

      new Notification(
        `${overdue.length} ${overdue.length === 1 ? 'Prüfung' : 'Prüfungen'} überfällig`, {
          body,
          icon: undefined,
          silent: false,
        }
      );
    } catch (_) {
      // Notification API not available or blocked — ignore silently
    }
  }

  const navGroups = [
    { items: [
      { id: 'dashboard', label: 'Dashboard' },
    ]},
    { header: 'EINRICHTEN', items: [
      { id: 'templates', label: 'Checklisten' },
      { id: 'objects', label: 'Geräte & Räume' },
    ]},
    { header: 'DURCHFÜHREN', items: [
      { id: 'inspections', label: 'Prüfungen' },
      { id: 'defects', label: 'Mängel' },
    ]},
    { separator: true, items: [
      { id: 'settings', label: 'Einstellungen' },
      { id: 'support', label: 'Hilfe' },
    ]},
  ];

  function isActive(itemId) {
    const v = $currentView;
    if (itemId === 'templates') return v === 'templates' || v.startsWith('template') || v === 'import';
    if (itemId === 'objects') return v === 'objects' || v.startsWith('object');
    if (itemId === 'inspections') return v === 'inspections' || v.startsWith('inspection');
    if (itemId === 'defects') return v === 'defects' || v.startsWith('defect');
    if (itemId === 'settings') return v === 'settings' || v === 'integrity';
    if (itemId === 'support') return v === 'support' || v === 'feature-request' || v === 'changelog';
    return v === itemId;
  }

  let route = $derived.by(() => {
    const v = $currentView;
    if (v.startsWith('template:edit:')) return { page: 'template-edit', id: parseInt(v.split(':')[2]) };
    if (v === 'template:new') return { page: 'template-new' };
    if (v.startsWith('template:')) return { page: 'template-detail', id: parseInt(v.split(':')[1]) };
    if (v.startsWith('object:edit:')) return { page: 'object-edit', id: parseInt(v.split(':')[2]) };
    if (v === 'object:new') return { page: 'object-new' };
    if (v.startsWith('object:')) return { page: 'object-detail', id: parseInt(v.split(':')[1]) };
    if (v === 'inspection:new') return { page: 'inspection-new' };
    if (v.startsWith('inspection:execute:')) return { page: 'inspection-execute', id: parseInt(v.split(':')[2]) };
    if (v.startsWith('inspection:')) return { page: 'inspection-detail', id: parseInt(v.split(':')[1]) };
    if (v.startsWith('defect:')) return { page: 'defect-detail', id: parseInt(v.split(':')[1]) };
    if (v === 'templates:library' || v === 'import') return { page: 'templates' };
    if (v === 'integrity') return { page: 'settings' };
    if (v === 'feature-request' || v === 'changelog') return { page: 'support' };
    return { page: v };
  });
</script>

<div class="app-layout">
  <nav class="sidebar">
    <div class="logo">
      <h2>Nachweis Lokal</h2>
    </div>
    <ul>
      {#each navGroups as group}
        {#if group.separator}
          <li class="separator"></li>
        {/if}
        {#if group.header}
          <li class="group-header">
            {group.header}
            {#if sub(group.header)}<span class="sub">{sub(group.header)}</span>{/if}
          </li>
        {/if}
        {#each group.items as item}
          <li>
            <button
              class:active={isActive(item.id)}
              onclick={() => currentView.set(item.id)}
            >
              {item.label}
              {#if sub(item.label)}<span class="sub">{sub(item.label)}</span>{/if}
            </button>
          </li>
        {/each}
      {/each}
    </ul>
    <div class="lang-switcher">
      {#each availableLanguages as lang}
        <button
          class="lang-flag"
          class:active={getLanguage() === lang.code}
          onclick={() => { setLanguage(lang.code); location.reload(); }}
          title={lang.label}
        >
          {lang.code === 'tr' ? '🇹🇷' : lang.code === 'en' ? '🇬🇧' : '🇩🇪'}
        </button>
      {/each}
    </div>
  </nav>

  {#if showWizard}
    <FirstRunWizard oncomplete={() => { showWizard = false; currentView.set('dashboard'); }} />
  {/if}

  <main class="content">
    {#if dbError}
      <div class="error">Datenbankfehler: {dbError}</div>
    {:else if !dbReady}
      <div class="loading">Datenbank wird geladen...</div>
    {:else if route.page === 'dashboard'}
      <Dashboard onStartWizard={() => { showWizard = true; }} />
    {:else if route.page === 'inspections'}
      <InspectionList />
    {:else if route.page === 'inspection-new'}
      <InspectionForm />
    {:else if route.page === 'inspection-detail'}
      <InspectionDetail inspectionId={route.id} />
    {:else if route.page === 'inspection-execute'}
      <InspectionExecute inspectionId={route.id} />
    {:else if route.page === 'templates'}
      <TemplateList />
    {:else if route.page === 'template-new'}
      <TemplateForm />
    {:else if route.page === 'template-edit'}
      <TemplateForm templateId={route.id} />
    {:else if route.page === 'template-detail'}
      <TemplateDetail templateId={route.id} />
    {:else if route.page === 'objects'}
      <ObjectList />
    {:else if route.page === 'object-new'}
      <ObjectForm />
    {:else if route.page === 'object-edit'}
      <ObjectForm objectId={route.id} />
    {:else if route.page === 'object-detail'}
      <ObjectDetail objectId={route.id} />
    {:else if route.page === 'defects'}
      <DefectList />
    {:else if route.page === 'defect-detail'}
      <DefectDetail defectId={route.id} />
    {:else if route.page === 'settings'}
      <Settings />
    {:else if route.page === 'support'}
      <SupportHub />
    {/if}
  </main>
</div>

<style>
  .app-layout {
    display: flex;
    height: 100vh;
  }

  .sidebar {
    width: 200px;
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    padding: 1rem 0;
    flex-shrink: 0;
  }

  .logo {
    padding: 0 1rem 1rem;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 0.5rem;
  }

  .sidebar ul { list-style: none; }

  .group-header {
    padding: 0.75rem 1rem 0.25rem;
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
  }

  .separator {
    border-top: 1px solid var(--color-border);
    margin: 0.5rem 0;
  }

  .lang-switcher {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    margin-top: auto;
    border-top: 1px solid var(--color-border);
  }
  .lang-flag {
    background: none;
    border: 2px solid transparent;
    border-radius: 0.25rem;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    opacity: 0.5;
  }
  .lang-flag:hover { opacity: 0.8; }
  .lang-flag.active { opacity: 1; border-color: var(--color-primary); }

  .sub {
    display: block;
    font-size: 0.625rem;
    opacity: 0.6;
    font-weight: 400;
    letter-spacing: 0;
    line-height: 1.2;
  }

  .sidebar button {
    width: 100%;
    text-align: left;
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    color: var(--color-text);
    font-size: 0.875rem;
  }

  .sidebar button:hover { background: var(--color-border); }
  .sidebar button.active { background: var(--color-primary); color: white; }
  .sidebar button:disabled { opacity: 0.4; cursor: not-allowed; }
  .sidebar button:disabled:hover { background: none; }

  .content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .error { color: var(--color-danger); padding: 2rem; text-align: center; }
  .loading { color: var(--color-text-muted); padding: 2rem; text-align: center; }
</style>
