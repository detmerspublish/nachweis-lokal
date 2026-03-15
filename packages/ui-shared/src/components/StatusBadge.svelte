<script>
  /** @type {{ status: string, labels?: Record<string, string> }} */
  let { status, labels = {} } = $props();

  const defaultLabels = {
    active: 'Aktiv', inactive: 'Inaktiv', deleted: 'Gelöscht',
    draft: 'Entwurf', sent: 'Versendet', paid: 'Bezahlt',
    overdue: 'Überfällig', cancelled: 'Storniert',
    open: 'Offen', closed: 'Geschlossen',
    yes: 'Ja', no: 'Nein',
    aktiv: 'Aktiv', passiv: 'Passiv', ausgetreten: 'Ausgetreten', verstorben: 'Verstorben',
    bezahlt: 'Bezahlt', teilweise: 'Teilweise', offen: 'Offen', befreit: 'Befreit',
  };

  let label = $derived(labels[status] || defaultLabels[status] || status);

  const variantMap = {
    active: 'success', paid: 'success', yes: 'success', closed: 'success',
    draft: 'neutral', inactive: 'neutral', no: 'neutral',
    sent: 'info', open: 'info',
    overdue: 'warning',
    cancelled: 'muted', deleted: 'muted',
  };

  let variant = $derived(variantMap[status] || 'neutral');
</script>

<span class="badge badge-{variant}">{label}</span>

<style>
  .badge { padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.8rem; font-weight: 500; white-space: nowrap; }
  .badge-success { background: #d1e7dd; color: #0f5132; }
  .badge-info { background: #cfe2ff; color: #0d6efd; }
  .badge-warning { background: #f8d7da; color: #842029; }
  .badge-neutral { background: #e0e0e0; color: #555; }
  .badge-muted { background: #f5f5f5; color: #999; }
</style>
