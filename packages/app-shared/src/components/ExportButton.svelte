<script>
  let { label = 'Exportieren', onclick } = $props();
</script>

<button class="export-btn" {onclick}>
  {label}
</button>

<style>
  .export-btn {
    padding: 0.5rem 1rem;
    background: #4299e1;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .export-btn:hover { background: #3182ce; }
</style>
