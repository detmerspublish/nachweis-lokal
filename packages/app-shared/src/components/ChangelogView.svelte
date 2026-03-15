<script>
  let versions = $state([]);
  let loading = $state(false);
  let ownRequests = $state(new Set());

  async function loadChangelog() {
    loading = true;
    try {
      versions = await window.electronAPI.changelog.list();
    } catch (_) {
      versions = [];
    }

    // Load own requests to mark "Ihr Wunsch!"
    try {
      const mine = await window.electronAPI.featureRequest.list();
      ownRequests = new Set(mine.map(r => r.request_number));
    } catch (_) {}

    loading = false;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch (_) { return iso; }
  }

  $effect(() => { loadChangelog(); });
</script>

<div class="changelog-page">
  <h1>Was ist neu?</h1>

  {#if loading}
    <p class="muted">Wird geladen...</p>
  {:else if versions.length === 0}
    <p class="muted">Noch keine Einträge vorhanden.</p>
  {:else}
    {#each versions as ver}
      <section class="version-block">
        <div class="version-header">
          <h2>{ver.version}</h2>
          {#if ver.released_at}
            <span class="release-date">{formatDate(ver.released_at)}</span>
          {/if}
        </div>
        <ul class="feature-list">
          {#each ver.features as f}
            <li>
              {f.title}
              {#if f.request_number && ownRequests.has(f.request_number)}
                <span class="own-wish">Ihr Wunsch!</span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .changelog-page { max-width: 700px; display: flex; flex-direction: column; gap: 1rem; }
  .muted { color: var(--color-text-muted); font-size: 0.875rem; }
  .version-block {
    border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1rem 1.25rem;
  }
  .version-header {
    display: flex; align-items: baseline; gap: 0.75rem; margin-bottom: 0.5rem;
  }
  .version-header h2 { font-size: 1.1rem; margin: 0; }
  .release-date { font-size: 0.8rem; color: var(--color-text-muted); }
  .feature-list { margin: 0; padding-left: 1.25rem; }
  .feature-list li { font-size: 0.875rem; padding: 0.25rem 0; line-height: 1.4; }
  .own-wish {
    display: inline-block; font-size: 0.7rem; background: #dcfce7; color: #166534;
    padding: 0.1rem 0.4rem; border-radius: 0.25rem; margin-left: 0.5rem; font-weight: 600;
  }
</style>
