<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getObjects } from '../lib/db.js';

  let objects = $state([]);

  onMount(async () => {
    objects = await getObjects();
  });
</script>

<div class="page">
  <div class="header">
    <h1>Geräte & Räume</h1>
    <button class="btn-primary" onclick={() => currentView.set('object:new')}>+ Neuer Eintrag</button>
  </div>

  <p class="hint">Geräte, Räume, Anlagen oder andere Gegenstände, die geprüft werden.</p>

  {#if objects.length === 0}
    <p class="empty">Noch keine Geräte oder Räume angelegt.</p>
  {:else}
    <table>
      <thead>
        <tr><th>Name</th><th>Standort</th><th>Kategorie</th><th>Kennung</th></tr>
      </thead>
      <tbody>
        {#each objects as obj}
          <tr class="clickable" onclick={() => currentView.set(`object:${obj.id}`)}>
            <td class="bold">{obj.name}</td>
            <td>{obj.location ?? '-'}</td>
            <td>{obj.category ?? '-'}</td>
            <td class="muted">{obj.identifier ?? '-'}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: center; }
  .hint { color: var(--color-text-muted); font-size: 0.8125rem; }
  .empty { color: var(--color-text-muted); font-style: italic; padding: 2rem 0; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; font-size: 0.8125rem; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: var(--color-surface); }
  .bold { font-weight: 600; }
  .muted { color: var(--color-text-muted); }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
</style>
