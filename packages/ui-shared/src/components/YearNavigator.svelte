<script>
  /** @type {{ year: number, onchange: (year: number) => void }} */
  let { year, onchange } = $props();
</script>

<div class="year-nav">
  <button onclick={() => onchange(year - 1)}>&larr;</button>
  <span class="year-label">{year}</span>
  <button onclick={() => onchange(year + 1)}>&rarr;</button>
</div>

<style>
  .year-nav { display: flex; align-items: center; gap: 0.5rem; }
  .year-label { font-weight: 600; font-size: 1.1rem; min-width: 4rem; text-align: center; }
  button { padding: 0.3rem 0.6rem; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer; }
  button:hover { background: #f0f0f0; }
</style>
