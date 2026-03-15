const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { checkDbIntegrity, checkStorageRisks, checkResourceLimits } = require('./health.js');

/**
 * Collects diagnostic data for a support bundle.
 * Contains NO customer data — only system info, logs, and health status.
 *
 * @param {Object} params
 * @param {string} params.appName - Product name
 * @param {string} params.appVersion - Product version
 * @param {string} params.userDataPath - userData directory
 * @param {string} [params.dbPath] - Path to database (null for stateless products)
 * @param {import('better-sqlite3').Database} [params.db] - Open DB connection (null for stateless)
 * @param {string} params.logDir - Log directory
 * @param {string} [params.backupDir] - Backup directory
 * @param {boolean} [params.safeMode=false] - Whether app is in safe mode
 * @returns {{ files: Array<{ name: string, content: string }> }}
 */
function collectDiagnostics(params) {
  const files = [];

  // 1. System info (NO customer data)
  const systemInfo = {
    app: params.appName,
    version: params.appVersion,
    electron: typeof process !== 'undefined' ? process.versions?.electron : null,
    node: typeof process !== 'undefined' ? process.versions?.node : null,
    chrome: typeof process !== 'undefined' ? process.versions?.chrome : null,
    os: `${os.platform()} ${os.release()} (${os.arch()})`,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    userDataPath: params.userDataPath,
    dbPath: params.dbPath || null,
    safeMode: params.safeMode || false,
    timestamp: new Date().toISOString(),
  };

  // Disk space
  try {
    const stats = fs.statfsSync(path.dirname(params.dbPath || params.userDataPath));
    systemInfo.diskFreeMB = Math.round((stats.bavail * stats.bsize) / 1024 / 1024);
  } catch (_) {}

  // DB size
  if (params.dbPath) {
    try {
      systemInfo.dbSizeMB = Math.round(fs.statSync(params.dbPath).size / 1024 / 1024 * 100) / 100;
    } catch (_) {}

    // WAL size
    try {
      const walPath = params.dbPath + '-wal';
      if (fs.existsSync(walPath)) {
        systemInfo.walSizeMB = Math.round(fs.statSync(walPath).size / 1024 / 1024 * 100) / 100;
      }
    } catch (_) {}
  }

  files.push({ name: 'system-info.json', content: JSON.stringify(systemInfo, null, 2) });

  // 2. DB integrity check
  if (params.db) {
    try {
      const integrity = checkDbIntegrity(params.db);
      files.push({ name: 'integrity-check.json', content: JSON.stringify(integrity, null, 2) });
    } catch (_) {}
  }

  // 3. Schema version
  if (params.db) {
    try {
      const meta = params.db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
      files.push({ name: 'schema-meta.json', content: JSON.stringify(meta, null, 2) });
    } catch (_) {}
  }

  // 4. Log files (last 2, max 500 KB each)
  try {
    if (fs.existsSync(params.logDir)) {
      const logFiles = fs.readdirSync(params.logDir)
        .filter(f => f.startsWith('app') && f.endsWith('.log'))
        .sort().slice(0, 2);
      for (const f of logFiles) {
        const content = fs.readFileSync(path.join(params.logDir, f), 'utf-8');
        files.push({ name: f, content: content.slice(-500 * 1024) });
      }
    }
  } catch (_) {}

  // 5. Backup overview (metadata only, no contents)
  if (params.backupDir) {
    try {
      if (fs.existsSync(params.backupDir)) {
        const backups = fs.readdirSync(params.backupDir)
          .filter(f => f.endsWith('.db'))
          .map(f => {
            const stat = fs.statSync(path.join(params.backupDir, f));
            return { name: f, size: stat.size, mtime: stat.mtime };
          });
        files.push({ name: 'backups.json', content: JSON.stringify(backups, null, 2) });
      }
    } catch (_) {}
  }

  // 6. Update status
  try {
    const updateState = path.join(params.userDataPath, 'update-state.json');
    if (fs.existsSync(updateState)) {
      files.push({ name: 'update-state.json', content: fs.readFileSync(updateState, 'utf-8') });
    }
  } catch (_) {}

  // 7. Storage risks
  if (params.dbPath) {
    try {
      const risks = checkStorageRisks(params.dbPath);
      if (risks.length > 0) {
        files.push({ name: 'storage-risks.json', content: JSON.stringify(risks, null, 2) });
      }
    } catch (_) {}
  }

  // 8. Last known error (survives crashes)
  let lastError = null;
  try {
    const lastErrorPath = path.join(params.userDataPath, 'last-error.json');
    if (fs.existsSync(lastErrorPath)) {
      lastError = JSON.parse(fs.readFileSync(lastErrorPath, 'utf-8'));
      files.push({ name: 'last-error.json', content: JSON.stringify(lastError, null, 2) });
    }
  } catch (_) {}

  // 9. Recent errors from log (codes + timestamps only)
  let recentErrors = [];
  try {
    const logFile = path.join(params.logDir, 'app.log');
    if (fs.existsSync(logFile)) {
      const logContent = fs.readFileSync(logFile, 'utf-8');
      const lines = logContent.trim().split('\n').slice(-500);
      recentErrors = lines
        .map(line => { try { return JSON.parse(line); } catch (_) { return null; } })
        .filter(entry => entry?.data?.errorCode)
        .slice(-10)
        .map(entry => ({
          code: entry.data.errorCode,
          timestamp: entry.ts,
          component: entry.component,
        }));
    }
  } catch (_) {}

  // 10. Resource limits
  if (params.dbPath) {
    try {
      const warnings = checkResourceLimits(params.dbPath);
      if (warnings.length > 0) {
        files.push({ name: 'resource-warnings.json', content: JSON.stringify(warnings, null, 2) });
      }
    } catch (_) {}
  }

  // 11. case-summary.json — machine-readable for KI analysis
  const caseSummary = buildCaseSummary(params, lastError, recentErrors);
  files.push({ name: 'case-summary.json', content: JSON.stringify(caseSummary, null, 2) });

  return { files };
}

/**
 * Builds the case-summary.json — the first file KI reads.
 */
function buildCaseSummary(params, lastError, recentErrors) {
  const summary = {
    product: params.appName,
    version: params.appVersion,
    schemaVersion: null,
    os: `${os.platform()} ${os.release()} (${os.arch()})`,
    safeMode: params.safeMode || false,
    activeErrors: lastError ? [lastError] : [],
    recentErrors,
    dbIntegrity: 'unknown',
    lastBackup: null,
    backupAge: 'unknown',
    diskFreePercent: null,
    walSizeMB: null,
    updateStatus: 'unknown',
    risks: {
      dataLoss: false,
      cloudSync: false,
      networkDrive: false,
      diskLow: false,
      staleBackup: false,
    },
  };

  // Schema version
  if (params.db) {
    try {
      const meta = params.db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
      summary.schemaVersion = meta?.schema_version;
    } catch (_) {}
  }

  // DB integrity
  if (params.db) {
    try {
      const integrity = checkDbIntegrity(params.db);
      summary.dbIntegrity = integrity.ok ? 'ok' : 'failed';
      summary.risks.dataLoss = !integrity.ok;
    } catch (_) {}
  }

  // Backup age
  if (params.backupDir) {
    try {
      if (fs.existsSync(params.backupDir)) {
        const backups = fs.readdirSync(params.backupDir)
          .filter(f => f.endsWith('.db'))
          .map(f => fs.statSync(path.join(params.backupDir, f)).mtime)
          .sort((a, b) => b - a);
        if (backups.length > 0) {
          summary.lastBackup = backups[0].toISOString();
          const ageHours = (Date.now() - backups[0].getTime()) / (1000 * 60 * 60);
          summary.backupAge = ageHours < 24 ? 'recent'
            : ageHours < 168 ? 'over_24h' : 'over_7d';
          summary.risks.staleBackup = ageHours > 24;
        } else {
          summary.backupAge = 'none';
          summary.risks.staleBackup = true;
        }
      }
    } catch (_) {}
  }

  // Disk space
  try {
    const stats = fs.statfsSync(path.dirname(params.dbPath || params.userDataPath));
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    summary.diskFreePercent = Math.round((freeBytes / totalBytes) * 100);
    summary.risks.diskLow = summary.diskFreePercent < 15;
  } catch (_) {}

  // WAL size
  if (params.dbPath) {
    try {
      const walPath = params.dbPath + '-wal';
      if (fs.existsSync(walPath)) {
        summary.walSizeMB = Math.round(fs.statSync(walPath).size / 1024 / 1024 * 100) / 100;
      }
    } catch (_) {}
  }

  // Update status
  try {
    const updateStatePath = path.join(params.userDataPath, 'update-state.json');
    if (fs.existsSync(updateStatePath)) {
      const us = JSON.parse(fs.readFileSync(updateStatePath, 'utf-8'));
      summary.updateStatus = us.status || 'unknown';
    } else {
      summary.updateStatus = 'current';
    }
  } catch (_) {}

  // Storage risks
  if (params.dbPath) {
    try {
      const storageRisks = checkStorageRisks(params.dbPath);
      for (const r of storageRisks) {
        if (r.type === 'cloud-sync') summary.risks.cloudSync = true;
        if (r.type === 'network-path') summary.risks.networkDrive = true;
      }
    } catch (_) {}
  }

  return summary;
}

/**
 * Formats compact tech info for phone support (2 lines, readable).
 *
 * @param {Object} params
 * @param {string} params.appName
 * @param {string} params.appVersion
 * @param {string} [params.schemaVersion]
 * @param {string} [params.errorCode]
 * @param {string} [params.lastBackup]
 * @param {number} [params.dbSizeMB]
 * @param {number} [params.diskFreeMB]
 * @returns {string}
 */
function formatCompactInfo(params) {
  const os_ = `${os.platform()}-${os.release()}`;
  const schema = params.schemaVersion ? `Schema v${params.schemaVersion}` : 'kein Schema';
  const code = params.errorCode || 'kein Fehler';
  const line1 = `${params.appName} ${params.appVersion} | ${os_} | ${schema} | ${code}`;

  const backup = params.lastBackup || 'kein Backup';
  const dbSize = params.dbSizeMB != null ? `DB: ${params.dbSizeMB} MB` : 'keine DB';
  const disk = params.diskFreeMB != null ? `Platte: ${params.diskFreeMB} MB frei` : '';
  const line2 = [
    `Backup: ${backup}`,
    dbSize,
    disk,
  ].filter(Boolean).join(' | ');

  return `${line1}\n${line2}`;
}

module.exports = { collectDiagnostics, formatCompactInfo };
