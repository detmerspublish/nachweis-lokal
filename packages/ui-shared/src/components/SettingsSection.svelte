<script>
  /** @type {{ title: string, children?: import('svelte').Snippet }} */
  let { title, children } = $props();
</script>

<section class="settings-section">
  <h2>{title}</h2>
  {#if children}{@render children()}{/if}
</section>

<style>
  .settings-section { margin-bottom: 2rem; }
  h2 { margin: 0 0 1rem; color: #333; font-size: 1.1rem; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
</style>
