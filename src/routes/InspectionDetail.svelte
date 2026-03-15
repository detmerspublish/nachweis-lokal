<script>
  import { onMount } from 'svelte';
  import { currentView } from '../lib/stores/navigation.js';
  import { getInspection, getInspectionResults, deleteInspection, getOrgProfile, getDefects, createReinspection, getAttachmentsByInspection } from '../lib/db.js';
  import { generateProtocolPdf, generateDeficiencyPdf, loadImageAsDataUrl } from '../lib/pdf.js';
  import PhotoAttachment from '../components/PhotoAttachment.svelte';

  let { inspectionId } = $props();
  let inspection = $state(null);
  let results = $state([]);
  let defects = $state([]);
  let generatingPdf = $state(false);

  onMount(async () => {
    inspection = await getInspection(inspectionId);
    results = await getInspectionResults(inspectionId);
    if (inspection?.status === 'bemaengelt') {
      defects = await getDefects({ inspection_id: inspectionId });
    }
  });

  function statusClass(status) {
    if (status === 'bestanden') return 'badge-success';
    if (status === 'bemaengelt') return 'badge-danger';
    if (status === 'offen') return 'badge-muted';
    return 'badge-muted';
  }

  function resultClass(result) {
    if (result === 'ok') return 'result-ok';
    if (result === 'maengel') return 'result-fail';
    if (result === 'nicht_anwendbar') return 'result-na';
    return '';
  }

  function resultLabel(result) {
    const labels = { offen: 'Offen', ok: 'OK', maengel: 'Mängel', nicht_anwendbar: 'Entfällt' };
    return labels[result] ?? result;
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  async function handlePrintProtocol() {
    generatingPdf = true;
    const profile = await getOrgProfile();

    // Load photo attachments as data URLs
    const allAttachments = await getAttachmentsByInspection(inspectionId);
    const attachmentMap = new Map();
    for (const att of allAttachments) {
      const dataUrl = await loadImageAsDataUrl(att.file_path);
      if (dataUrl) {
        if (!attachmentMap.has(att.inspection_result_id)) {
          attachmentMap.set(att.inspection_result_id, []);
        }
        attachmentMap.get(att.inspection_result_id).push({ dataUrl, fileName: att.file_name });
      }
    }

    const qrText = `Nachweis Lokal | #${inspectionId} | ${inspection.inspection_date} | ${inspection.status}`;
    generateProtocolPdf(inspection, results, profile, false, { attachments: attachmentMap, qrText });
    generatingPdf = false;
  }

  async function handlePrintDeficiencies() {
    const profile = await getOrgProfile();
    generateDeficiencyPdf(inspection, results, profile, false);
  }

  async function handleDelete() {
    if (confirm(`Prüfung "${inspection.title}" löschen?`)) {
      await deleteInspection(inspectionId);
      currentView.set('inspections');
    }
  }

  async function handleReinspection() {
    const openDefectIds = defects.filter(d => d.status === 'offen').map(d => d.id);
    if (openDefectIds.length === 0) return;
    const newId = await createReinspection(inspectionId, openDefectIds);
    if (newId) {
      currentView.set(`inspection:execute:${newId}`);
    }
  }

  let deficiencyCount = $derived(results.filter(r => r.result === 'maengel').length);
  let openDefectCount = $derived(defects.filter(d => d.status === 'offen').length);
</script>

{#if inspection}
  <div class="page">
    <div class="header">
      <div>
        <h1>{inspection.title}</h1>
        <span class="badge {statusClass(inspection.status)}">{inspection.status === 'bemaengelt' ? 'Mit Mängeln' : inspection.status}</span>
      </div>
      <div class="actions">
        {#if inspection.status === 'offen'}
          <button class="btn-primary" onclick={() => currentView.set(`inspection:execute:${inspectionId}`)}>Fortsetzen</button>
        {/if}
        <button class="btn-secondary" onclick={handlePrintProtocol} disabled={generatingPdf}>
          {generatingPdf ? 'Erstelle PDF...' : 'PDF Protokoll'}
        </button>
        {#if deficiencyCount > 0}
          <button class="btn-secondary" onclick={handlePrintDeficiencies}>PDF Mängel ({deficiencyCount})</button>
        {/if}
        {#if openDefectCount > 0}
          <button class="btn-secondary" onclick={handleReinspection}>Nachprüfung ({openDefectCount} Mängel)</button>
        {/if}
        <button class="btn-danger" onclick={handleDelete}>Löschen</button>
      </div>
    </div>

    <div class="meta-grid">
      <div><span class="label">Checkliste:</span> {inspection.template_name ?? '-'}</div>
      <div><span class="label">Gerät / Raum:</span> {inspection.object_name ?? '-'}</div>
      <div><span class="label">Prüfer:</span> {inspection.inspector}</div>
      <div><span class="label">Datum:</span> {formatDate(inspection.inspection_date)}</div>
      {#if inspection.due_date}
        <div><span class="label">Nächste Prüfung:</span> {formatDate(inspection.due_date)}</div>
      {/if}
    </div>

    {#if inspection.notes}
      <div class="notes">
        <span class="label">Hinweise:</span> {inspection.notes}
      </div>
    {/if}

    <h2>Ergebnisse ({results.length} Prüfpunkte)</h2>
    <table>
      <thead>
        <tr><th>Nr.</th><th>Prüfpunkt</th><th>Ergebnis</th><th>Bemerkung</th></tr>
      </thead>
      <tbody>
        {#each results as r, i}
          <tr>
            <td>{i + 1}</td>
            <td class="bold">{r.label}</td>
            <td><span class="result {resultClass(r.result)}">{resultLabel(r.result)}</span></td>
            <td class="muted">{r.remark ?? '-'}</td>
          </tr>
          {#if r.id}
            <tr class="attachment-row">
              <td colspan="4">
                <PhotoAttachment inspectionResultId={r.id} readonly={true} />
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>

    <button class="btn-secondary" onclick={() => currentView.set('inspections')}>Zurück</button>
  </div>
{/if}

<style>
  .page { display: flex; flex-direction: column; gap: 1rem; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem; }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.875rem; }
  .label { font-weight: 600; }
  .notes { font-size: 0.875rem; color: var(--color-text-muted); }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
  th { background: var(--color-surface); font-weight: 600; font-size: 0.8125rem; }
  .bold { font-weight: 600; }
  .muted { color: var(--color-text-muted); font-size: 0.8125rem; }
  .badge { padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; }
  .badge-success { background: #c6f6d5; color: #22543d; }
  .badge-danger { background: #fed7d7; color: #9b2c2c; }
  .badge-muted { background: #e2e8f0; color: #4a5568; }
  .result { font-weight: 600; font-size: 0.8125rem; }
  .result-ok { color: #38a169; }
  .result-fail { color: #e53e3e; }
  .result-na { color: #a0aec0; }
  .attachment-row td { padding: 0 0.5rem 0.5rem; border-bottom: 1px solid var(--color-border); }
  .btn-primary { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.375rem; }
  .btn-secondary { padding: 0.5rem 1rem; background: none; border: 1px solid var(--color-border); border-radius: 0.375rem; }
  .btn-danger { padding: 0.5rem 1rem; background: var(--color-danger); color: white; border: none; border-radius: 0.375rem; }
</style>
