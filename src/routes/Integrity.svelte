<script>
  import { onMount } from 'svelte';
  import { verifyChain, getEvents } from '../lib/db.js';
  import Glossar from '../components/Glossar.svelte';

  let { embedded = false } = $props();

  let verifyResult = $state(null);
  let events = $state([]);
  let verifying = $state(false);

  onMount(async () => {
    events = await getEvents(20);
    await runVerification();
  });

  async function runVerification() {
    verifying = true;
    verifyResult = await verifyChain(100);
    verifying = false;
  }

  function formatTimestamp(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleString('de-DE');
  }

  function parseData(dataJson) {
    try {
      const data = JSON.parse(dataJson);
      return JSON.stringify(data, null, 0).substring(0, 120);
    } catch {
      return dataJson?.substring(0, 120) ?? '';
    }
  }
</script>

<div class="page">
  {#if !embedded}
    <h1>Integritätsprüfung</h1>
  {/if}
  <p class="hint">
    Nachweis Lokal führt ein lückenloses Änderungsprotokoll mit HMAC-SHA256 <Glossar term="Hash-Kette">Hash-Kette</Glossar>.
    Jeder Eintrag ist kryptographisch mit dem vorherigen verkettet. Manipulation wird erkannt.
  </p>

  <div class="verify-box" class:valid={verifyResult?.valid} class:invalid={verifyResult && !verifyResult.valid}>
    {#if verifying}
      <span>Prüfe Hash-Kette...</span>
    {:else if verifyResult}
      {#if verifyResult.valid}
        <span class="status-ok">Hash-Kette intakt</span>
        <span class="detail">{verifyResult.checked} Einträge geprüft, keine Manipulation erkannt.</span>
      {:else}
        <span class="status-fail">Hash-Kette beschädigt!</span>
        <span class="detail">{verifyResult.errors.length} Fehler in {verifyResult.checked} Einträgen.</span>
        <ul>
          {#each verifyResult.errors as err}
            <li>Event #{err.event_id}: {err.error}</li>
          {/each}
        </ul>
      {/if}
    {/if}
    <button class="btn-secondary" onclick={runVerification} disabled={verifying}>Erneut prüfen</button>
  </div>

  <h2>Letzte Einträge</h2>
  {#if events.length === 0}
    <p class="empty">Noch keine Einträge im Protokoll.</p>
  {:else}
    <table>
      <thead>
        <tr><th>ID</th><th>Zeitpunkt</th><th>Typ</th><th>Daten</th><th>Hash</th></tr>
      </thead>
      <tbody>
        {#each events as e}
          <tr>
            <td>{e.id}</td>
            <td class="nowrap">{formatTimestamp(e.timestamp)}</td>
            <td><span class="tag">{e.type}</span></td>
            <td class="data">{parseData(e.data)}</td>
            <td class="hash">{e.hash.substring(0, 12)}...</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .hint { color: var(--color-text-muted); font-size: 0.875rem; }
  .verify-box {
    padding: 1rem;
    border-radius: 0.5rem;
    border: 2px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .verify-box.valid { border-color: var(--color-success); background: #f0fff4; }
  .verify-box.invalid { border-color: var(--color-danger); background: #fff5f5; }
  .status-ok { font-size: 1.125rem; font-weight: 700; color: var(--color-success); }
  .status-fail { font-size: 1.125rem; font-weight: 700; color: var(--color-danger); }
  .detail { font-size: 0.875rem; color: var(--color-text-muted); }
  .empty { color: var(--color-text-muted); font-style: italic; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; font-size: 0.8125rem; }
  th { background: var(--color-surface); font-weight: 600; }
  .nowrap { white-space: nowrap; }
  .tag { background: var(--color-surface); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.75rem; }
  .data { color: var(--color-text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hash { font-family: monospace; color: var(--color-text-muted); }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; align-self: flex-start; }
</style>
