<script>
  let status = $state(null);
  let loading = $state(true);
  let tickets = $state([]);
  let ticketsLoading = $state(false);

  // Ticket submission
  let showSubmitForm = $state(false);
  let description = $state('');
  let submitting = $state(false);
  let submitResult = $state(null);

  // Backup
  let backupRunning = $state(false);
  let backupResult = $state(null);

  // Diagnostics
  let diagRunning = $state(false);
  let diagResult = $state(null);
  let compactInfo = $state('');

  async function loadStatus() {
    loading = true;
    try {
      status = await window.electronAPI.license.getStatus();
    } catch (_) {
      status = { hasLicense: false, active: false };
    }
    loading = false;

    if (status?.active) {
      loadTickets();
    }
  }

  async function loadTickets() {
    ticketsLoading = true;
    try {
      tickets = await window.electronAPI.support.getTickets();
    } catch (_) {
      tickets = [];
    }
    ticketsLoading = false;
  }

  async function handleSubmitTicket() {
    submitting = true;
    submitResult = null;
    try {
      const result = await window.electronAPI.support.submitTicket(description || null);
      if (result.ok) {
        submitResult = { ok: true, ticketRef: result.ticketRef };
        description = '';
        showSubmitForm = false;
        await loadTickets();
      } else {
        submitResult = { ok: false, error: result.error };
      }
    } catch (err) {
      submitResult = { ok: false, error: err.message };
    }
    submitting = false;
  }

  async function handleDiagnose() {
    diagRunning = true;
    diagResult = null;
    try {
      diagResult = await window.electronAPI.support.collectBundle();
    } catch (err) {
      diagResult = { error: err.message };
    }
    diagRunning = false;
  }

  async function handleCompactInfo() {
    try {
      compactInfo = await window.electronAPI.support.compactInfo();
    } catch (_) {
      compactInfo = 'Fehler beim Laden';
    }
  }

  let copyDone = $state(false);

  async function handleCopyInfo() {
    await handleCompactInfo();
    if (compactInfo) {
      try {
        await navigator.clipboard.writeText(compactInfo);
        copyDone = true;
        setTimeout(() => copyDone = false, 3000);
      } catch (_) {}
    }
  }

  async function handleBackup() {
    backupRunning = true;
    backupResult = null;
    try {
      const result = await window.electronAPI.backup.create();
      if (result.ok) {
        backupResult = { ok: true };
        setTimeout(() => backupResult = null, 5000);
      } else {
        backupResult = { ok: false, error: result.error || 'Unbekannter Fehler' };
      }
    } catch (err) {
      backupResult = { ok: false, error: err.message };
    }
    backupRunning = false;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch (_) { return iso; }
  }

  function statusLabel(s) {
    const labels = {
      open: 'Offen', analyzing: 'Wird analysiert', resolved: 'Gelöst',
      escalated: 'Eskaliert', closed: 'Geschlossen',
    };
    return labels[s] || s;
  }

  $effect(() => { loadStatus(); });
</script>

<div class="support-page">
  <h1>Support</h1>

  {#if loading}
    <p class="muted">Wird geladen...</p>
  {:else if status?.active}
    <!-- Active license: full support UI -->
    <div class="status-bar">
      <span class="badge active">Support aktiv</span>
      {#if status.expiresAt}
        <span class="expires">bis {formatDate(status.expiresAt)}</span>
      {/if}
    </div>

    <section class="actions">
      <button class="btn-primary" onclick={() => { showSubmitForm = !showSubmitForm; submitResult = null; }}>
        Problem melden
      </button>
      <button class="btn-secondary" onclick={handleDiagnose} disabled={diagRunning}>
        {diagRunning ? 'Läuft...' : 'Diagnose starten'}
      </button>
      <button class="btn-secondary" onclick={handleBackup} disabled={backupRunning}>
        {backupRunning ? 'Backup läuft...' : 'Backup erstellen'}
      </button>
      <button class="btn-secondary" onclick={handleCopyInfo}>
        {copyDone ? 'Kopiert!' : 'Technische Infos kopieren'}
      </button>
    </section>

    {#if backupResult}
      <div class="result" class:success={backupResult.ok} class:error={!backupResult.ok}>
        {#if backupResult.ok}
          Backup erfolgreich erstellt.
        {:else}
          Backup fehlgeschlagen: {backupResult.error}
        {/if}
      </div>
    {/if}

    {#if showSubmitForm}
      <section class="submit-form">
        <h2>Problem beschreiben</h2>
        <p class="hint">
          Optional: Beschreiben Sie Ihr Problem. Die technischen Daten werden automatisch mitgesendet
          (nur Systeminfos, keine Kundendaten).
        </p>
        <textarea
          bind:value={description}
          placeholder="Was ist passiert? Was haben Sie erwartet?"
          rows="4"
        ></textarea>
        <div class="submit-actions">
          <button class="btn-primary" onclick={handleSubmitTicket} disabled={submitting}>
            {submitting ? 'Wird gesendet...' : 'An Support senden'}
          </button>
          <button class="btn-secondary" onclick={() => showSubmitForm = false}>Abbrechen</button>
        </div>
      </section>
    {/if}

    {#if submitResult}
      <div class="result" class:success={submitResult.ok} class:error={!submitResult.ok}>
        {#if submitResult.ok}
          Fall <strong>{submitResult.ticketRef}</strong> erstellt.
        {:else}
          Fehler: {submitResult.error}
        {/if}
      </div>
    {/if}

    {#if diagResult && !diagResult.error}
      <section class="diag-result">
        <h3>Diagnose abgeschlossen</h3>
        <p class="muted">{diagResult.files.length} Dateien gesammelt.</p>
        <details>
          <summary>Dateien anzeigen</summary>
          <ul>
            {#each diagResult.files as file}
              <li>{file.name}</li>
            {/each}
          </ul>
        </details>
      </section>
    {/if}

    <!-- Ticket list -->
    <section class="tickets">
      <h2>Meine Fälle</h2>
      {#if ticketsLoading}
        <p class="muted">Lade Fälle...</p>
      {:else if tickets.length === 0}
        <p class="muted">Keine offenen Fälle.</p>
      {:else}
        <table>
          <thead>
            <tr><th>Fall-Nr.</th><th>Status</th><th>Datum</th><th>Antwort</th></tr>
          </thead>
          <tbody>
            {#each tickets as t}
              <tr>
                <td class="mono">{t.ticket_ref}</td>
                <td><span class="badge" class:active={t.status === 'resolved'} class:pending={t.status === 'open'}>{statusLabel(t.status)}</span></td>
                <td>{formatDate(t.created_at)}</td>
                <td>{t.ki_response ? 'Ja' : '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>

  {:else}
    <!-- No active license: self-help only -->
    <div class="community-mode">
      <p class="muted">
        Sie nutzen die kostenlose Version.
        Die Desktop-Funktionen stehen Ihnen vollständig zur Verfügung.
      </p>
      <p class="muted">
        Mit Nachweis Lokal Business erhalten Sie kuratierte Branchenvorlagen, persönlichen Support, automatische Updates
        und offizielle Installer.
      </p>
      <p class="muted"><strong>89 €/Jahr inkl. MwSt</strong> · Early-Adopter: 69 €/Jahr (erste 50 Kunden)</p>
      <div class="cta-buttons">
        <span class="link">Nachweis Lokal Business auf detmers-publish.de</span>
        <span class="separator">oder</span>
        <span class="hint">Key eingeben unter Einstellungen</span>
      </div>
    </div>

    <hr />

    <section class="self-help">
      <h2>Selbsthilfe (immer verfügbar)</h2>
      <div class="actions">
        <button class="btn-secondary" onclick={handleDiagnose} disabled={diagRunning}>
          {diagRunning ? 'Läuft...' : 'Diagnose starten'}
        </button>
        <button class="btn-secondary" onclick={handleBackup} disabled={backupRunning}>
        {backupRunning ? 'Backup läuft...' : 'Backup erstellen'}
      </button>
        <button class="btn-secondary" onclick={handleCopyInfo}>
        {copyDone ? 'Kopiert!' : 'Technische Infos kopieren'}
      </button>
      </div>
    </section>

    {#if backupResult}
      <div class="result" class:success={backupResult.ok} class:error={!backupResult.ok}>
        {#if backupResult.ok}
          Backup erfolgreich erstellt.
        {:else}
          Backup fehlgeschlagen: {backupResult.error}
        {/if}
      </div>
    {/if}

    {#if diagResult && !diagResult.error}
      <section class="diag-result">
        <h3>Diagnose abgeschlossen</h3>
        <p class="muted">{diagResult.files.length} Dateien gesammelt.</p>
      </section>
    {/if}
  {/if}
</div>

<style>
  .support-page { max-width: 700px; display: flex; flex-direction: column; gap: 1.5rem; }
  .status-bar { display: flex; align-items: center; gap: 0.75rem; }
  .badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
  }
  .badge.active { background: #c6f6d5; color: #22543d; }
  .badge.pending { background: #fefcbf; color: #744210; }
  .expires { font-size: 0.875rem; color: var(--color-text-muted); }
  .muted { color: var(--color-text-muted); font-size: 0.875rem; line-height: 1.5; }
  .hint { font-size: 0.8rem; color: var(--color-text-muted); margin-top: 0.5rem; }
  .link { color: var(--color-primary); font-size: 0.875rem; }
  .separator { color: var(--color-text-muted); font-size: 0.8rem; margin: 0 0.5rem; }
  section { border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1.25rem; }
  section h2 { margin-bottom: 0.75rem; }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .btn-primary {
    padding: 0.5rem 1rem; background: var(--color-primary); color: white;
    border: none; border-radius: 0.375rem; font-size: 0.875rem;
  }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-secondary {
    padding: 0.5rem 1rem; background: none;
    border: 1px solid var(--color-border); border-radius: 0.375rem; font-size: 0.875rem;
  }
  .submit-form textarea {
    width: 100%; font-family: inherit; font-size: 0.875rem;
    padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.375rem;
    margin: 0.75rem 0;
  }
  .submit-actions { display: flex; gap: 0.5rem; }
  .result { padding: 0.75rem; border-radius: 0.375rem; font-size: 0.875rem; }
  .result.success { background: #c6f6d5; color: #22543d; }
  .result.error { background: #fed7d7; color: #822727; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; font-size: 0.875rem; }
  th { font-weight: 600; }
  .mono { font-family: monospace; font-size: 0.8rem; }
  .community-mode { display: flex; flex-direction: column; gap: 0.5rem; }
  .cta-buttons { display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.5rem; }
  hr { border: none; border-top: 1px solid var(--color-border); }
  .self-help h2 { margin-bottom: 0.75rem; }
  .diag-result { background: var(--color-surface); }
  details summary { cursor: pointer; font-size: 0.8125rem; color: var(--color-primary); }
  details ul { margin-top: 0.5rem; padding-left: 1.5rem; font-size: 0.8125rem; }
</style>
