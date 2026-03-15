const ERROR_CODES = {
  // --- Database ---
  'CF-DB-001': {
    category: 'db', severity: 'error',
    title: 'Datenbank gesperrt',
    userMessage: 'Die Datenbank wird von einem anderen Programm verwendet.',
    action: 'Bitte schliessen Sie andere Programme und versuchen Sie es erneut.',
  },
  'CF-DB-002': {
    category: 'db', severity: 'critical',
    title: 'Integritaetspruefung fehlgeschlagen',
    userMessage: 'Die Datenbank weist Inkonsistenzen auf.',
    action: 'Moechten Sie eine automatische Reparatur versuchen oder das letzte Backup wiederherstellen?',
  },
  'CF-DB-003': {
    category: 'db', severity: 'critical',
    title: 'Datenbank nicht lesbar',
    userMessage: 'Die Datenbankdatei kann nicht gelesen werden.',
    action: 'Bitte pruefen Sie die Dateiberechtigungen oder stellen Sie ein Backup wieder her.',
  },
  'CF-DB-005': {
    category: 'db', severity: 'error',
    title: 'Datenbank neuer als App',
    userMessage: 'Diese Datenbank wurde mit einer neueren Version erstellt.',
    action: 'Bitte aktualisieren Sie die Software auf die aktuelle Version.',
  },

  // --- Backup ---
  'CF-BAK-001': {
    category: 'backup', severity: 'error',
    title: 'Backup fehlgeschlagen',
    userMessage: 'Das Backup konnte nicht erstellt werden.',
    action: 'Bitte pruefen Sie den verfuegbaren Speicherplatz.',
  },
  'CF-BAK-002': {
    category: 'backup', severity: 'critical',
    title: 'Wiederherstellung fehlgeschlagen',
    userMessage: 'Das Backup konnte nicht wiederhergestellt werden.',
    action: 'Bitte versuchen Sie ein anderes Backup oder wenden Sie sich an den Support.',
  },

  // --- Migration ---
  'CF-MIG-001': {
    category: 'migration', severity: 'critical',
    title: 'Migration fehlgeschlagen',
    userMessage: 'Die Datenbank-Aktualisierung konnte nicht abgeschlossen werden.',
    action: 'Ihre Daten sind sicher — das automatische Backup wurde vorher erstellt. Bitte wenden Sie sich an den Support.',
  },

  // --- System ---
  'CF-SYS-001': {
    category: 'system', severity: 'critical',
    title: 'Datenordner nicht beschreibbar',
    userMessage: 'Der Datenordner ist nicht beschreibbar.',
    action: 'Bitte pruefen Sie die Ordner-Berechtigungen.',
  },
  'CF-SYS-002': {
    category: 'system', severity: 'error',
    title: 'Speicherplatz zu gering',
    userMessage: 'Nicht genuegend Speicherplatz auf dem Laufwerk.',
    action: 'Bitte schaffen Sie Speicherplatz frei.',
  },
  'CF-SYS-003': {
    category: 'system', severity: 'warn',
    title: 'Cloud-Sync-Risiko erkannt',
    userMessage: 'Die Datenbank liegt in einem Cloud-synchronisierten Ordner.',
    action: 'Empfehlung: Datenbank in einen lokalen Ordner verschieben.',
  },
  'CF-SYS-004': {
    category: 'system', severity: 'critical',
    title: 'Installationsdateien unvollstaendig',
    userMessage: 'Die Installation scheint beschaedigt zu sein.',
    action: 'Bitte fuehren Sie eine Reparaturinstallation durch.',
  },

  // --- Renderer/UI ---
  'CF-UI-001': {
    category: 'ui', severity: 'error',
    title: 'Oberflaeche konnte nicht geladen werden',
    userMessage: 'Die Benutzeroberflaeche konnte nicht geladen werden.',
    action: 'Bitte starten Sie die Anwendung im abgesicherten Modus.',
  },

  // --- App ---
  'CF-APP-001': {
    category: 'app', severity: 'critical',
    title: 'Unerwarteter Fehler',
    userMessage: 'Die Anwendung hat einen unerwarteten Fehler festgestellt.',
    action: 'Bitte exportieren Sie die Diagnosedaten (Hilfe → Diagnose).',
  },
};

function getErrorInfo(code) {
  return ERROR_CODES[code] || {
    category: 'unknown', severity: 'error',
    title: 'Unbekannter Fehler',
    userMessage: 'Ein unerwarteter Fehler ist aufgetreten.',
    action: 'Bitte exportieren Sie die Diagnosedaten und wenden Sie sich an den Support.',
  };
}

function formatErrorDialog(code, technicalDetail = null) {
  const info = getErrorInfo(code);
  let message = `${info.userMessage}\n\n${info.action}`;
  message += `\n\n[${code}]`;
  if (technicalDetail) {
    message += `\nTechnisch: ${technicalDetail}`;
  }
  return { title: info.title, message };
}

module.exports = { ERROR_CODES, getErrorInfo, formatErrorDialog };
