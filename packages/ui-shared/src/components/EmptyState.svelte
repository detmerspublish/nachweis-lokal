<script>
  /** @type {{ message: string }} */
  let { message } = $props();
</script>

<div class="empty">{message}</div>

<style>
  .empty { color: #888; padding: 2rem; text-align: center; }
</style>
