<script>
  import { currentView } from '../lib/stores/navigation.js';
  import { SupportView, FeatureRequestView, ChangelogView } from '@codefabrik/app-shared/components';

  let activeTab = $state('support');

  $effect(() => {
    const v = $currentView;
    if (v === 'feature-request') activeTab = 'ideas';
    else if (v === 'changelog') activeTab = 'changelog';
    else if (v === 'support') activeTab = 'support';
  });
</script>

<div class="page">
  <h1>Support</h1>

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'support'} onclick={() => activeTab = 'support'}>
      Hilfe & Tickets
    </button>
    <button class="tab" class:active={activeTab === 'ideas'} onclick={() => activeTab = 'ideas'}>
      Ideen
    </button>
    <button class="tab" class:active={activeTab === 'changelog'} onclick={() => activeTab = 'changelog'}>
      Was ist neu?
    </button>
  </div>

  {#if activeTab === 'support'}
    <SupportView />
  {:else if activeTab === 'ideas'}
    <FeatureRequestView />
  {:else if activeTab === 'changelog'}
    <ChangelogView />
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }

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
</style>
