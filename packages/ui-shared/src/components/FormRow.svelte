<script>
  /** @type {{ cols?: number, children?: import('svelte').Snippet }} */
  let { cols = 2, children } = $props();
</script>

<div class="form-row" style="--cols: {cols}">
  {#if children}{@render children()}{/if}
</div>

<style>
  .form-row { display: flex; gap: 1rem; }
  .form-row :global(label) { flex: 1; }
</style>
