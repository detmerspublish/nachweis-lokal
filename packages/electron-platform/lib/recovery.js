const fs = require('node:fs');
const { logInfo, logWarn } = require('./logger.js');

function openDbWithRetry(Database, dbPath, maxRetries = 3, options = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const db = new Database(dbPath);

      // SQLCipher: set encryption key before any other operation
      if (options.encryptionKey) {
        db.pragma(`key = '${options.encryptionKey.replace(/'/g, "''")}'`);
      }

      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      db.pragma('busy_timeout = 5000');
      logInfo('recovery', `DB geoeffnet (Versuch ${attempt})`);
      return db;
    } catch (err) {
      logWarn('recovery', `DB-Oeffnung fehlgeschlagen (Versuch ${attempt}/${maxRetries})`, {
        error: err.message,
      });

      if (attempt < maxRetries) {
        cleanupStaleLocks(dbPath);
        const waitMs = attempt * 2000;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
      } else {
        throw err;
      }
    }
  }
}

function cleanupStaleLocks(dbPath) {
  for (const ext of ['-wal', '-shm']) {
    const lockFile = dbPath + ext;
    if (fs.existsSync(lockFile)) {
      try {
        const stat = fs.statSync(lockFile);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 30_000) {
          fs.unlinkSync(lockFile);
          logInfo('recovery', `Veraltete Lock-Datei entfernt: ${ext}`);
        }
      } catch (_) {}
    }
  }
}

function attemptDbRepair(Database, dbPath, backupDir, dbName) {
  const results = [];

  // Step 1: Re-check integrity
  try {
    const db = new Database(dbPath, { readonly: true });
    const check = db.pragma('integrity_check');
    db.close();
    if (check.length === 1 && check[0].integrity_check === 'ok') {
      results.push({ step: 'integrity_check', success: true, message: 'DB ist doch OK.' });
      return { repaired: true, results };
    }
    results.push({ step: 'integrity_check', success: false, message: 'DB ist beschaedigt.' });
  } catch (err) {
    results.push({ step: 'integrity_check', success: false, message: err.message });
  }

  // Step 2: VACUUM INTO new file
  const repairedPath = dbPath + '.repaired';
  try {
    const db = new Database(dbPath, { readonly: true });
    db.exec(`VACUUM INTO '${repairedPath.replace(/'/g, "''")}'`);
    db.close();

    const repaired = new Database(repairedPath, { readonly: true });
    const check = repaired.pragma('integrity_check');
    repaired.close();

    if (check.length === 1 && check[0].integrity_check === 'ok') {
      const backupOfCorrupt = dbPath + '.corrupt';
      fs.renameSync(dbPath, backupOfCorrupt);
      fs.renameSync(repairedPath, dbPath);
      logInfo('recovery', 'DB erfolgreich repariert via VACUUM INTO');
      results.push({ step: 'vacuum_repair', success: true });
      return { repaired: true, results, corruptBackup: backupOfCorrupt };
    }
    results.push({ step: 'vacuum_repair', success: false, message: 'Reparierte DB auch inkonsistent.' });
  } catch (err) {
    results.push({ step: 'vacuum_repair', success: false, message: err.message });
  }

  try {
    if (fs.existsSync(repairedPath)) fs.unlinkSync(repairedPath);
  } catch (_) {}

  results.push({
    step: 'backup_required', success: false,
    message: 'Automatische Reparatur fehlgeschlagen. Backup-Wiederherstellung empfohlen.',
  });

  return { repaired: false, results };
}

module.exports = { openDbWithRetry, attemptDbRepair };
