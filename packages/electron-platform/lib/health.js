const fs = require('node:fs');
const path = require('node:path');

function checkInstallIntegrity(appPath) {
  const criticalFiles = ['dist/index.html'];
  const missing = [];
  for (const file of criticalFiles) {
    const fullPath = path.join(appPath, file);
    if (!fs.existsSync(fullPath)) {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message: 'Die Installation scheint beschaedigt zu sein. ' +
        'Fehlende Dateien: ' + missing.join(', ') + '. ' +
        'Bitte fuehren Sie eine Reparaturinstallation durch.',
    };
  }
  return { ok: true };
}

function checkWritable(dirPath) {
  const testFile = path.join(dirPath, '.write-test');
  try {
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: `Verzeichnis nicht beschreibbar: ${err.message}` };
  }
}

function checkDiskSpace(dirPath, requiredBytes) {
  try {
    const stats = fs.statfsSync(dirPath);
    const freeBytes = stats.bavail * stats.bsize;
    const freeMB = Math.round(freeBytes / 1024 / 1024);

    if (freeBytes < requiredBytes) {
      return {
        ok: false, freeMB,
        message: `Nur ${freeMB} MB frei. Mindestens ${Math.round(requiredBytes / 1024 / 1024)} MB benoetigt.`,
      };
    }
    if (freeBytes < 1024 * 1024 * 1024) { // < 1 GB
      return { ok: true, warning: true, freeMB, message: `Wenig Speicherplatz: ${freeMB} MB frei.` };
    }
    return { ok: true, freeMB };
  } catch (_) {
    return { ok: true }; // If we can't check, continue
  }
}

function checkStorageRisks(dbPath) {
  const lower = dbPath.toLowerCase();
  const risks = [];

  const cloudServices = ['onedrive', 'dropbox', 'google drive', 'icloud'];
  const cloudMatch = cloudServices.find(s => lower.includes(s));
  if (cloudMatch) {
    risks.push({
      type: 'cloud-sync', service: cloudMatch, severity: 'high',
      message: `Datenbank liegt in ${cloudMatch}-Ordner. ` +
        'Cloud-Synchronisation kann zu Datenverlust fuehren.',
    });
  }

  if (lower.startsWith('\\\\') || lower.startsWith('//')) {
    risks.push({
      type: 'network-path', severity: 'high',
      message: 'Datenbank liegt auf einem Netzlaufwerk. ' +
        'SQLite auf Netzlaufwerken ist nicht zuverlaessig und kann zu Korruption fuehren.',
    });
  }

  return risks;
}

function checkDbIntegrity(db) {
  try {
    const result = db.pragma('integrity_check');
    const ok = result.length === 1 && result[0].integrity_check === 'ok';
    if (ok) return { ok: true, message: 'Datenbank ist in Ordnung.' };
    const details = result.map(r => r.integrity_check).join('\n');
    return { ok: false, message: 'Die Datenbank weist Inkonsistenzen auf.', details };
  } catch (err) {
    return { ok: false, message: `Pruefung fehlgeschlagen: ${err.message}` };
  }
}

function checkResourceLimits(dbPath) {
  const warnings = [];

  try {
    const dbSize = fs.statSync(dbPath).size;
    const dbSizeMB = Math.round(dbSize / 1024 / 1024);
    if (dbSizeMB > 500) {
      warnings.push({ type: 'db-size', message: `DB ist ${dbSizeMB} MB gross.`, severity: 'warn' });
    }
  } catch (_) {}

  try {
    const walPath = dbPath + '-wal';
    if (fs.existsSync(walPath)) {
      const walSizeMB = Math.round(fs.statSync(walPath).size / 1024 / 1024);
      if (walSizeMB > 100) {
        warnings.push({ type: 'wal-size', message: `WAL ist ${walSizeMB} MB gross.`, severity: 'warn' });
      }
    }
  } catch (_) {}

  try {
    const stats = fs.statfsSync(path.dirname(dbPath));
    const freeMB = Math.round((stats.bavail * stats.bsize) / 1024 / 1024);
    if (freeMB < 300) {
      warnings.push({ type: 'disk-low', message: `Nur ${freeMB} MB frei.`, severity: 'critical' });
    } else if (freeMB < 1024) {
      warnings.push({ type: 'disk-low', message: `Wenig Speicher: ${freeMB} MB frei.`, severity: 'warn' });
    }
  } catch (_) {}

  return warnings;
}

module.exports = {
  checkInstallIntegrity, checkWritable, checkDiskSpace,
  checkStorageRisks, checkDbIntegrity, checkResourceLimits,
};
