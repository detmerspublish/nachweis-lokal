<script>
  /** @type {{ title?: string, hint?: string, children?: import('svelte').Snippet }} */
  let { title = '', hint = '', children } = $props();
</script>

<fieldset class="form-section">
  {#if title}
    <legend>{title}</legend>
  {/if}
  {#if hint}
    <p class="hint">{hint}</p>
  {/if}
  {#if children}{@render children()}{/if}
</fieldset>

<style>
  .form-section { border: 1px solid #e0e0e0; border-radius: 6px; padding: 1rem 1.2rem; margin-bottom: 1.2rem; }
  legend { font-weight: 600; font-size: 0.95rem; color: #333; padding: 0 0.3rem; }
  .hint { color: #888; font-size: 0.85rem; margin: 0 0 0.8rem; }
</style>
