<script>
  /** @type {{ label: string, value: string, variant?: string }} */
  let { label, value, variant = 'default' } = $props();
</script>

<div class="card card-{variant}">
  <h3>{label}</h3>
  <div class="amount">{value}</div>
</div>

<style>
  .card { flex: 1; padding: 1rem; background: white; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  h3 { font-size: 0.85rem; color: #888; margin: 0 0 0.5rem; }
  .amount { font-size: 1.3rem; font-weight: 600; }
  .card-income .amount { color: #0f5132; }
  .card-expense .amount { color: #842029; }
  .card-profit .amount { color: #0d6efd; }
  .card-danger .amount { color: #842029; }
  .card-default .amount { color: #333; }
</style>
