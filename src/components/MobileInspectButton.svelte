<script>
  import { onDestroy } from 'svelte';

  let { inspectionId } = $props();

  let mobileSession = $state(null);
  let starting = $state(false);
  let error = $state(null);
  let licenseError = $state(null);
  let progress = $state(null);
  let trialDaysLeft = $state(null);
  let pollInterval = null;

  async function startMobile() {
    starting = true;
    error = null;
    licenseError = null;
    try {
      const response = await window.electronAPI.mobile.start(inspectionId);

      // Check for license gate
      if (response.ok === false) {
        if (response.reason === 'trial_expired') {
          licenseError = 'trial_expired';
        } else if (response.reason === 'license_required') {
          licenseError = 'license_required';
        }
        starting = false;
        return;
      }

      mobileSession = response;
      trialDaysLeft = response.trial ? response.trialDaysLeft : null;

      // Listen for live result updates
      window.electronAPI.mobile.onResultUpdate((data) => {
        progress = data;
      });

      // Poll for status as fallback
      pollInterval = setInterval(async () => {
        try {
          const status = await window.electronAPI.mobile.getStatus();
          if (!status.active) {
            stopMobile();
          }
        } catch (_) {}
      }, 5000);
    } catch (err) {
      error = err.message || 'Server konnte nicht gestartet werden';
    }
    starting = false;
  }

  async function stopMobile() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    window.electronAPI.mobile.removeResultListener();
    try {
      await window.electronAPI.mobile.stop();
    } catch (_) {}
    mobileSession = null;
    progress = null;
  }

  onDestroy(() => {
    if (pollInterval) clearInterval(pollInterval);
    window.electronAPI.mobile.removeResultListener();
  });

  function drawQR(canvas, matrix) {
    if (!canvas || !matrix) return;
    const ctx = canvas.getContext('2d');
    const size = matrix.length;
    const moduleSize = Math.floor(200 / size);
    canvas.width = size * moduleSize;
    canvas.height = size * moduleSize;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (matrix[y][x]) {
          ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
        }
      }
    }
  }

  $effect(() => {
    if (mobileSession?.qrMatrix) {
      // Wait for DOM update, then draw QR
      setTimeout(() => {
        const canvas = document.getElementById('qr-canvas');
        if (canvas) drawQR(canvas, mobileSession.qrMatrix);
      }, 50);
    }
  });
</script>

{#if !mobileSession}
  <button class="btn-mobile" onclick={startMobile} disabled={starting}>
    {starting ? 'Starte...' : '📱 Am Handy prüfen'}
  </button>
  {#if error}
    <span class="error-hint">{error}</span>
  {/if}
  {#if licenseError === 'trial_expired'}
    <div class="license-notice">
      <p>Ihre 30-Tage-Testphase für die mobile Prüfung ist abgelaufen.</p>
      <p>Mit Nachweis Lokal Business können Sie weiterhin mit dem Handy prüfen — auch unterwegs ohne WLAN.</p>
      <p class="license-price">89 €/Jahr inkl. MwSt <span class="price-regular">· Early-Adopter: 69 €/Jahr (erste 50 Kunden)</span></p>
      <p class="license-link">→ detmers-publish.de</p>
    </div>
  {/if}
{:else}
  <div class="mobile-panel">
    <div class="mobile-header">
      <h3>📱 Mobile Prüfung aktiv</h3>
      <button class="btn-close" onclick={stopMobile}>Beenden</button>
    </div>

    <div class="qr-section">
      <canvas id="qr-canvas" width="200" height="200"></canvas>
      <p class="qr-hint">QR-Code mit dem Handy scannen</p>
      <p class="qr-url">{mobileSession.url}/inspect/{inspectionId}</p>
    </div>

    <div class="status-section">
      <p class="status-info">
        Gleichen WLAN wie Ihr Computer verbinden, dann QR-Code scannen.
      </p>
      {#if trialDaysLeft != null}
        <p class="trial-info">
          Testphase: noch {trialDaysLeft} {trialDaysLeft === 1 ? 'Tag' : 'Tage'}
        </p>
      {/if}
      {#if progress}
        <p class="progress-info">
          {progress.done} von {progress.total} Punkte bearbeitet
        </p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .btn-mobile {
    padding: 0.5rem 1rem;
    background: var(--color-surface);
    border: 2px solid var(--color-primary);
    border-radius: 0.375rem;
    color: var(--color-primary);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-mobile:hover { background: var(--color-primary); color: white; }
  .btn-mobile:disabled { opacity: 0.5; cursor: not-allowed; }

  .error-hint { color: var(--color-danger); font-size: 0.8125rem; margin-left: 0.5rem; }

  .mobile-panel {
    border: 2px solid var(--color-primary);
    border-radius: 0.75rem;
    padding: 1.25rem;
    background: white;
    margin: 1rem 0;
  }

  .mobile-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .mobile-header h3 { font-size: 1rem; margin: 0; }

  .btn-close {
    padding: 0.375rem 0.75rem;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  .qr-section {
    text-align: center;
    margin-bottom: 1rem;
  }
  .qr-section canvas {
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
  }
  .qr-hint {
    margin-top: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
  }
  .qr-url {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    word-break: break-all;
    margin-top: 0.25rem;
  }

  .status-info {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    text-align: center;
  }
  .progress-info {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-primary);
    text-align: center;
    margin-top: 0.5rem;
  }

  .license-notice {
    margin-top: 0.75rem;
    padding: 1rem;
    background: var(--color-warning-bg, #fff8e1);
    border: 1px solid var(--color-warning-border, #ffe082);
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    max-width: 28rem;
  }
  .license-notice p { margin: 0 0 0.375rem 0; }
  .license-notice p:last-child { margin-bottom: 0; }
  .license-price { font-weight: 600; }
  .price-regular { font-size: 0.75rem; color: var(--color-text-muted); text-decoration: line-through; font-weight: 400; }
  .license-link { color: var(--color-primary); font-weight: 600; }

  .trial-info {
    font-size: 0.8125rem;
    color: var(--color-warning, #e65100);
    text-align: center;
    margin-top: 0.5rem;
    font-weight: 600;
  }
</style>
