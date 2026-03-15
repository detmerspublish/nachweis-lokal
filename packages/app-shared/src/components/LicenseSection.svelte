<script>
  let keyInput = $state('');
  let status = $state(null);
  let loading = $state(true);
  let entering = $state(false);
  let message = $state('');
  let messageType = $state('');

  async function loadStatus() {
    loading = true;
    try {
      status = await window.electronAPI.license.getStatus();
    } catch (_) {
      status = { hasLicense: false, active: false };
    }
    loading = false;
  }

  async function handleEnterKey() {
    if (!keyInput.trim()) return;
    entering = true;
    message = '';
    try {
      const result = await window.electronAPI.license.enterKey(keyInput.trim());
      if (result.ok) {
        message = 'Lizenzkey erfolgreich hinterlegt';
        messageType = 'success';
        keyInput = '';
        await loadStatus();
      } else {
        message = result.reason || 'Key ungültig';
        messageType = 'error';
      }
    } catch (err) {
      message = 'Fehler: ' + err.message;
      messageType = 'error';
    }
    entering = false;
  }

  async function handleRemoveKey() {
    try {
      await window.electronAPI.license.removeKey();
      message = 'Lizenzkey entfernt';
      messageType = 'success';
      await loadStatus();
    } catch (err) {
      message = 'Fehler: ' + err.message;
      messageType = 'error';
    }
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch (_) { return iso; }
  }

  // Load on mount equivalent via $effect
  $effect(() => { loadStatus(); });
</script>

<div class="license-section">
  <h2>Nachweis Lokal Business</h2>

  {#if loading}
    <p class="muted">Status wird geladen...</p>
  {:else if status?.hasLicense && status?.active}
    <div class="license-active">
      <div class="status-badge active">Aktiv</div>
      {#if status.expiresAt}
        <p>Gültig bis: <strong>{formatDate(status.expiresAt)}</strong></p>
      {/if}
      {#if status.features?.length}
        <p class="features">Funktionen: {status.features.join(', ')}</p>
      {/if}
      <button class="btn-danger-subtle" onclick={handleRemoveKey}>Key entfernen</button>
    </div>
  {:else if status?.hasLicense && !status?.active}
    <div class="license-inactive">
      <div class="status-badge inactive">
        {status.reason === 'expired' ? 'Abgelaufen'
          : status.reason === 'revoked' ? 'Widerrufen'
          : status.reason === 'cache_expired' ? 'Prüfung nötig'
          : 'Inaktiv'}
      </div>
      {#if status.reason === 'cache_expired'}
        <p class="hint">Bitte mit dem Internet verbinden, damit der Key geprüft werden kann.</p>
      {:else if status.reason === 'expired'}
        <p class="hint">Ihr Nachweis Lokal Business ist abgelaufen. Verlängern Sie auf detmers-publish.de</p>
      {/if}
      <button class="btn-danger-subtle" onclick={handleRemoveKey}>Key entfernen</button>
    </div>
  {:else}
    <div class="license-none">
      <p class="muted">
        Die Desktop-Version ist kostenlos nutzbar.
        Mit Nachweis Lokal Business erhalten Sie kuratierte Branchenvorlagen, offizielle Installer, automatische Updates
        und persönlichen Support für 12 Monate. Die zuletzt geladene Version läuft danach unbegrenzt weiter.
      </p>
      <p class="price-info">
        <strong>89 €/Jahr inkl. MwSt</strong> <span class="price-regular">· Early-Adopter: 69 €/Jahr (erste 50 Kunden)</span>
      </p>
      <form class="key-form" onsubmit={e => { e.preventDefault(); handleEnterKey(); }}>
        <input
          type="text"
          bind:value={keyInput}
          placeholder="CFXX-XXXX-XXXX-XXXX-XXXX"
          maxlength="24"
          class="key-input"
        />
        <button type="submit" class="btn-primary" disabled={entering || !keyInput.trim()}>
          {entering ? 'Prüfe...' : 'Key eingeben'}
        </button>
      </form>
      <p class="hint">
        Nachweis Lokal Business erhältlich auf
        <span class="link">detmers-publish.de</span>
      </p>
    </div>
  {/if}

  {#if message}
    <p class="message" class:success={messageType === 'success'} class:error={messageType === 'error'}>
      {message}
    </p>
  {/if}
</div>

<style>
  .license-section {
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    padding: 1.5rem;
  }
  .license-section h2 { margin-bottom: 1rem; }
  .status-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }
  .status-badge.active { background: #c6f6d5; color: #22543d; }
  .status-badge.inactive { background: #fed7d7; color: #822727; }
  .features { font-size: 0.8125rem; color: var(--color-text-muted); }
  .muted { color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.5; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.5rem; }
  .price-info { font-size: 0.9375rem; margin: 0.75rem 0 0; }
  .price-regular { font-size: 0.8125rem; color: var(--color-text-muted); text-decoration: line-through; }
  .link { color: var(--color-primary); }
  .key-form { display: flex; gap: 0.5rem; margin: 1rem 0 0.5rem; }
  .key-input {
    font-family: monospace;
    font-size: 0.9rem;
    letter-spacing: 0.05em;
    width: 260px;
    text-transform: uppercase;
  }
  .btn-primary {
    padding: 0.5rem 1rem;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    white-space: nowrap;
  }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-danger-subtle {
    padding: 0.35rem 0.75rem;
    background: none;
    border: 1px solid var(--color-danger, #e53e3e);
    color: var(--color-danger, #e53e3e);
    border-radius: 0.375rem;
    font-size: 0.8rem;
    margin-top: 0.75rem;
  }
  .message { font-size: 0.875rem; margin-top: 0.75rem; }
  .message.success { color: var(--color-success, #38a169); }
  .message.error { color: var(--color-danger, #e53e3e); }
</style>
