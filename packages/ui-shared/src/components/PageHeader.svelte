<script>
  /** @type {{ title: string, children?: import('svelte').Snippet }} */
  let { title, children } = $props();
</script>

<div class="header">
  <h1>{title}</h1>
  {#if children}
    <div class="actions">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
  h1 { margin: 0; color: #1a1a2e; }
  .actions { display: flex; gap: 0.5rem; align-items: center; }
</style>
