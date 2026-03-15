<script>
  let { value = $bindable(''), placeholder = 'Suchen...' } = $props();
</script>

<div class="search-bar">
  <input type="text" bind:value {placeholder} />
  {#if value}
    <button class="clear" onclick={() => value = ''}>✕</button>
  {/if}
</div>

<style>
  .search-bar { position: relative; display: inline-flex; align-items: center; }
  input { padding: 0.5rem 2rem 0.5rem 0.75rem; border: 1px solid #cbd5e0; border-radius: 0.375rem; width: 100%; font-size: 0.875rem; }
  input:focus { outline: none; border-color: #4299e1; box-shadow: 0 0 0 1px #4299e1; }
  .clear { position: absolute; right: 0.5rem; background: none; border: none; cursor: pointer; color: #a0aec0; font-size: 0.875rem; }
</style>
