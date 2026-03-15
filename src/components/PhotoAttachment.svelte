<script>
  import { onMount } from 'svelte';
  import { saveAttachment, getAttachments, deleteAttachment } from '../lib/db.js';

  let { inspectionResultId, readonly = false } = $props();
  let attachments = $state([]);
  let loading = $state(false);

  onMount(async () => {
    await loadAttachments();
  });

  async function loadAttachments() {
    attachments = await getAttachments(inspectionResultId);
  }

  async function handleAddPhoto() {
    if (!window.electronAPI?.dialog?.openFile) return;
    loading = true;

    try {
      const result = await window.electronAPI.dialog.openFile({
        filters: [{ name: 'Bilder', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }],
        properties: ['openFile'],
      });

      if (result && result.filePath) {
        const fileName = result.filePath.split(/[/\\]/).pop();
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };
        const mimeType = mimeMap[ext] ?? 'image/jpeg';

        // Copy file to userData attachments directory
        const userData = await window.electronAPI.app.getPath('userData');
        const destDir = `${userData}/attachments/${inspectionResultId}`;
        const destPath = `${destDir}/${Date.now()}_${fileName}`;

        await window.electronAPI.fs.mkdir(destDir, { recursive: true });
        await window.electronAPI.fs.copyFile(result.filePath, destPath);

        const stats = await window.electronAPI.fs.stat(result.filePath);
        await saveAttachment(inspectionResultId, fileName, destPath, mimeType, stats?.size ?? 0);
        await loadAttachments();
      }
    } catch (err) {
      console.error('Foto hinzufuegen fehlgeschlagen:', err);
    }
    loading = false;
  }

  async function handleDelete(attachment) {
    if (!confirm(`Foto "${attachment.file_name}" löschen?`)) return;
    const deleted = await deleteAttachment(attachment.id);
    if (deleted?.file_path && window.electronAPI?.fs?.unlink) {
      try { await window.electronAPI.fs.unlink(deleted.file_path); } catch { /* ignore */ }
    }
    await loadAttachments();
  }
</script>

<div class="photo-attachment">
  {#if attachments.length > 0}
    <div class="thumbnails">
      {#each attachments as a}
        <div class="thumbnail">
          <img src="file://{a.file_path}" alt={a.file_name} loading="lazy" />
          <span class="thumb-name">{a.file_name}</span>
          {#if !readonly}
            <button class="thumb-delete" onclick={() => handleDelete(a)} title="Löschen">&times;</button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
  {#if !readonly}
    <button class="btn-photo" onclick={handleAddPhoto} disabled={loading}>
      {loading ? 'Wird geladen...' : 'Foto hinzufügen'}
    </button>
  {/if}
</div>

<style>
  .photo-attachment { margin-top: 0.5rem; margin-left: 2rem; }
  .thumbnails { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .thumbnail {
    position: relative;
    width: 120px;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    overflow: hidden;
    background: var(--color-surface);
  }
  .thumbnail img { width: 100%; height: 80px; object-fit: cover; display: block; }
  .thumb-name { display: block; font-size: 0.625rem; padding: 0.125rem 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .thumb-delete {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(0,0,0,0.6);
    color: white;
    border: none;
    font-size: 12px;
    line-height: 1;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .thumb-delete:hover { background: var(--color-danger); }
  .btn-photo {
    padding: 0.25rem 0.5rem;
    border: 1px dashed var(--color-border);
    border-radius: 0.25rem;
    background: none;
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }
  .btn-photo:hover { border-color: var(--color-primary); color: var(--color-primary); }
</style>
