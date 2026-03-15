const fs = require('node:fs');
const path = require('node:path');
const { logInfo, logWarn, logCodedError } = require('./logger.js');

/**
 * Creates a backup of the database using SQLite's backup API.
 * Writes a .meta.json alongside the backup file.
 *
 * @param {import('better-sqlite3').Database} db - Open database connection
 * @param {string} backupDir - Directory to store backups
 * @param {string} dbName - Database filename (used as prefix)
 * @param {Object} [meta] - Additional metadata (appVersion, schemaVersion)
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
function createBackup(db, backupDir, dbName, meta = {}) {
  try {
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = dbName.replace(/\.db$/, '');
    const backupName = `${baseName}_${timestamp}.db`;
    const backupPath = path.join(backupDir, backupName);

    // VACUUM INTO creates a clean, defragmented copy (synchronous, WAL-safe)
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

    // Write metadata
    const stat = fs.statSync(backupPath);
    const metaData = {
      appVersion: meta.appVersion || null,
      schemaVersion: meta.schemaVersion || null,
      timestamp: new Date().toISOString(),
      validated: false,
      dbSizeBytes: stat.size,
    };
    fs.writeFileSync(backupPath + '.meta.json', JSON.stringify(metaData, null, 2));

    logInfo('backup', 'Backup erstellt', { path: backupName, size: stat.size });
    return { ok: true, path: backupPath };
  } catch (err) {
    logCodedError('backup', 'CF-BAK-001', 'Backup fehlgeschlagen', { error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Validates a backup file by opening it and running integrity_check.
 *
 * @param {Function} Database - better-sqlite3 constructor
 * @param {string} backupPath - Path to backup file
 * @returns {{ valid: boolean, size?: number, schemaVersion?: number, appVersion?: string, reason: string }}
 */
function validateBackup(Database, backupPath) {
  try {
    if (!fs.existsSync(backupPath)) {
      return { valid: false, reason: 'Datei nicht gefunden' };
    }

    const stat = fs.statSync(backupPath);
    if (stat.size === 0) {
      return { valid: false, reason: 'Datei ist leer' };
    }

    const db = new Database(backupPath, { readonly: true });
    const check = db.pragma('integrity_check');
    const ok = check.length === 1 && check[0].integrity_check === 'ok';

    let meta = null;
    try {
      meta = db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
    } catch (_) {}

    db.close();

    // Update .meta.json if it exists
    const metaPath = backupPath + '.meta.json';
    if (fs.existsSync(metaPath)) {
      try {
        const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        metaData.validated = ok;
        fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
      } catch (_) {}
    }

    return {
      valid: ok,
      size: stat.size,
      schemaVersion: meta?.schema_version || null,
      appVersion: meta?.app_version || null,
      reason: ok ? 'OK' : 'Integritaetspruefung fehlgeschlagen',
    };
  } catch (err) {
    return { valid: false, reason: err.message };
  }
}

/**
 * Lists all backups in the backup directory with metadata.
 *
 * @param {string} backupDir - Backup directory
 * @param {string} dbName - Database filename (used as filter prefix)
 * @returns {Array<{ name: string, path: string, size: number, mtime: Date, meta: Object|null }>}
 */
function listBackups(backupDir, dbName) {
  if (!fs.existsSync(backupDir)) return [];

  const baseName = dbName.replace(/\.db$/, '');
  return fs.readdirSync(backupDir)
    .filter(f => f.startsWith(baseName + '_') && f.endsWith('.db'))
    .map(f => {
      const fullPath = path.join(backupDir, f);
      const stat = fs.statSync(fullPath);

      let meta = null;
      const metaPath = fullPath + '.meta.json';
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (_) {}
      }

      return { name: f, path: fullPath, size: stat.size, mtime: stat.mtime, meta };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/**
 * Checks if a backup is needed (last backup > maxAgeMs ago).
 *
 * @param {string} backupDir - Backup directory
 * @param {string} dbName - Database filename
 * @param {number} [maxAgeMs=86400000] - Max age in ms (default: 24h)
 * @returns {boolean}
 */
function needsBackup(backupDir, dbName, maxAgeMs = 24 * 60 * 60 * 1000) {
  const backups = listBackups(backupDir, dbName);
  if (backups.length === 0) return true;
  const ageMs = Date.now() - backups[0].mtime.getTime();
  return ageMs > maxAgeMs;
}

/**
 * Rotates backups according to retention policy.
 * Default: 7 daily, 4 weekly, 12 monthly.
 *
 * @param {string} backupDir - Backup directory
 * @param {string} dbName - Database filename
 * @param {Object} [retention] - Retention config
 * @param {number} [retention.daily=7] - Keep N daily backups
 * @param {number} [retention.weekly=4] - Keep N weekly backups
 * @param {number} [retention.monthly=12] - Keep N monthly backups
 * @returns {{ kept: number, deleted: number }}
 */
function rotateBackups(backupDir, dbName, retention = {}) {
  const daily = retention.daily ?? 7;
  const weekly = retention.weekly ?? 4;
  const monthly = retention.monthly ?? 12;

  const backups = listBackups(backupDir, dbName);
  if (backups.length === 0) return { kept: 0, deleted: 0 };

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const WEEK = 7 * DAY;

  const keep = new Set();

  // Keep N most recent (daily)
  for (let i = 0; i < Math.min(daily, backups.length); i++) {
    keep.add(backups[i].name);
  }

  // Keep one per week for the last N weeks
  for (let w = 0; w < weekly; w++) {
    const weekStart = now - (w + 1) * WEEK;
    const weekEnd = now - w * WEEK;
    const inWeek = backups.find(b => b.mtime.getTime() >= weekStart && b.mtime.getTime() < weekEnd);
    if (inWeek) keep.add(inWeek.name);
  }

  // Keep one per month for the last N months
  const nowDate = new Date(now);
  for (let m = 0; m < monthly; m++) {
    const monthDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - m, 1);
    const nextMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - m + 1, 1);
    const inMonth = backups.find(b => b.mtime >= monthDate && b.mtime < nextMonth);
    if (inMonth) keep.add(inMonth.name);
  }

  let deleted = 0;
  for (const backup of backups) {
    if (!keep.has(backup.name)) {
      try {
        fs.unlinkSync(backup.path);
        const metaPath = backup.path + '.meta.json';
        if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
        deleted++;
      } catch (_) {}
    }
  }

  logInfo('backup', 'Rotation abgeschlossen', { kept: keep.size, deleted });
  return { kept: keep.size, deleted };
}

/**
 * Restores a database from backup.
 * 1. Creates safety backup of current DB
 * 2. Validates the backup to restore
 * 3. Replaces current DB (removes WAL/SHM)
 *
 * @param {Function} Database - better-sqlite3 constructor
 * @param {import('better-sqlite3').Database} currentDb - Currently open DB (will be closed)
 * @param {string} dbPath - Path to current database
 * @param {string} backupPath - Path to backup to restore
 * @param {string} backupDir - Backup directory (for safety backup)
 * @param {string} dbName - Database filename
 * @returns {{ ok: boolean, error?: string, safetyBackup?: string }}
 */
function restoreBackup(Database, currentDb, dbPath, backupPath, backupDir, dbName) {
  // 1. Validate the backup first
  const validation = validateBackup(Database, backupPath);
  if (!validation.valid) {
    return { ok: false, error: `Backup ungueltig: ${validation.reason}` };
  }

  // 2. Safety backup of current DB
  let safetyBackup = null;
  try {
    const safetyResult = createBackup(currentDb, backupDir, dbName, {});
    if (safetyResult.ok) {
      safetyBackup = safetyResult.path;
    }
  } catch (_) {}

  // 3. Close current DB
  try {
    currentDb.close();
  } catch (_) {}

  // 4. Replace DB file
  try {
    fs.copyFileSync(backupPath, dbPath);

    // Remove WAL and SHM files
    for (const ext of ['-wal', '-shm']) {
      const f = dbPath + ext;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    logInfo('backup', 'Restore abgeschlossen', { from: path.basename(backupPath) });
    return { ok: true, safetyBackup };
  } catch (err) {
    logCodedError('backup', 'CF-BAK-002', 'Restore fehlgeschlagen', { error: err.message });
    return { ok: false, error: err.message, safetyBackup };
  }
}

module.exports = {
  createBackup,
  validateBackup,
  listBackups,
  needsBackup,
  rotateBackups,
  restoreBackup,
};
