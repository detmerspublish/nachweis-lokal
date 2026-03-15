<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getTemplates } from '../lib/db.js';
  import TemplateLibrary from './TemplateLibrary.svelte';
  import ImportTemplates from './ImportTemplates.svelte';

  let templates = $state([]);
  let activeTab = $state('list');

  onMount(async () => {
    templates = await getTemplates();
    // Wenn von aussen auf Bibliothek oder Import navigiert wurde
    const v = currentView.get?.() ?? 'templates';
    if (v === 'templates:library') activeTab = 'library';
    else if (v === 'import') activeTab = 'import';
  });

  // Reagiere auf externe Navigation (z.B. leerer Zustand → Bibliothek-Link)
  $effect(() => {
    const v = $currentView;
    if (v === 'templates:library') activeTab = 'library';
    else if (v === 'import') activeTab = 'import';
    else if (v === 'templates') activeTab = 'list';
  });

  function setTab(tab) {
    activeTab = tab;
  }

  async function refreshTemplates() {
    templates = await getTemplates();
  }
</script>

<div class="page">
  <div class="header">
    <h1>Checklisten</h1>
    {#if activeTab === 'list'}
      <button
        class="btn-primary"
        onclick={() => currentView.set('template:new')}
      >
        + Neue Checkliste
      </button>
    {/if}
  </div>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'list'} onclick={() => setTab('list')}>
      Meine Checklisten
    </button>
    <button class="tab" class:active={activeTab === 'library'} onclick={() => setTab('library')}>
      Bibliothek
    </button>
    <button class="tab" class:active={activeTab === 'import'} onclick={() => setTab('import')}>
      CSV-Import
    </button>
  </div>

  {#if activeTab === 'list'}
    {#if templates.length === 0}
      <p class="empty">Noch keine Checklisten angelegt.
        <button class="link-btn" onclick={() => setTab('library')}>Fertige Checklisten übernehmen</button>
        oder eine eigene Checkliste erstellen.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Kategorie</th>
            <th>Intervall</th>
            <th>Beschreibung</th>
          </tr>
        </thead>
        <tbody>
          {#each templates as t}
            <tr class="clickable" onclick={() => currentView.set(`template:${t.id}`)}>
              <td class="bold">{t.name}</td>
              <td>{t.category ?? '-'}</td>
              <td>{t.interval_days ? `${t.interval_days} Tage` : '-'}</td>
              <td class="muted">{t.description ?? ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {:else if activeTab === 'library'}
    <TemplateLibrary embedded={true} />
  {:else if activeTab === 'import'}
    <ImportTemplates embedded={true} />
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: center; }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--color-border);
  }

  .tab {
    padding: 0.5rem 1rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    color: var(--color-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .tab:hover { color: var(--color-text); }
  .tab.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
    font-weight: 600;
  }

  .empty { color: var(--color-text-muted); font-style: italic; padding: 2rem 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; font-size: 0.8125rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--color-surface); }
  .bold { font-weight: 600; }
  .muted { color: var(--color-text-muted); font-size: 0.8125rem; }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; cursor: pointer; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .link-btn { background: none; border: none; color: var(--color-primary); text-decoration: underline; cursor: pointer; font-size: inherit; padding: 0; }
</style>
