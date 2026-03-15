const path = require('node:path');
const https = require('node:https');
const http = require('node:http');
const { collectDiagnostics, formatCompactInfo } = require('../lib/support-bundle.js');
const { sanitizeBundle } = require('../lib/support-sanitizer.js');
const { computeLicenseHash, readLicenseCache } = require('../lib/license-client.js');
const { checkDbIntegrity } = require('../lib/health.js');
const { attemptDbRepair } = require('../lib/recovery.js');
const { listBackups } = require('../lib/backup-core.js');
const { logInfo, logWarn } = require('../lib/logger.js');

/**
 * Registers support/recovery IPC handlers.
 *
 * @param {Object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {Electron.App} deps.app
 * @param {Object} deps.config - Product config
 * @param {Function} deps.getDb - Returns current DB instance
 * @param {boolean} deps.safeMode - Whether app is in safe mode
 */
function registerSupportHandlers({ ipcMain, app, config, getDb, safeMode }) {
  const userDataPath = app.getPath('userData');
  const logDir = path.join(userDataPath, 'logs');
  const backupDir = path.join(userDataPath, 'backups');
  const dbPath = config.dbName ? path.join(userDataPath, config.dbName) : null;
  const productId = config.productId || config.identifier;

  ipcMain.handle('support:collectBundle', () => {
    return collectDiagnostics({
      appName: config.name,
      appVersion: config.version || '0.0.0',
      userDataPath,
      dbPath,
      db: getDb(),
      logDir,
      backupDir,
      safeMode,
    });
  });

  ipcMain.handle('support:compactInfo', () => {
    const db = getDb();
    let schemaVersion = null;
    if (db) {
      try {
        const meta = db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
        schemaVersion = meta?.schema_version;
      } catch (_) {}
    }

    let lastErrorCode = null;
    try {
      const fs = require('node:fs');
      const lastErrorPath = path.join(userDataPath, 'last-error.json');
      if (fs.existsSync(lastErrorPath)) {
        const err = JSON.parse(fs.readFileSync(lastErrorPath, 'utf-8'));
        lastErrorCode = err.errorCode || null;
      }
    } catch (_) {}

    let dbSizeMB = null;
    let diskFreeMB = null;
    const fs = require('node:fs');
    if (dbPath) {
      try { dbSizeMB = Math.round(fs.statSync(dbPath).size / 1024 / 1024 * 100) / 100; } catch (_) {}
    }
    try {
      const stats = fs.statfsSync(path.dirname(dbPath || userDataPath));
      diskFreeMB = Math.round((stats.bavail * stats.bsize) / 1024 / 1024);
    } catch (_) {}

    let lastBackup = null;
    const backups = listBackups(backupDir, config.dbName || 'app');
    if (backups.length > 0) {
      lastBackup = backups[0].mtime.toISOString().split('T')[0];
    }

    return formatCompactInfo({
      appName: config.name,
      appVersion: config.version || '0.0.0',
      schemaVersion,
      errorCode: lastErrorCode,
      lastBackup,
      dbSizeMB,
      diskFreeMB,
    });
  });

  ipcMain.handle('recovery:checkDb', () => {
    const db = getDb();
    if (!db) return { ok: false, message: 'Keine Datenbank vorhanden' };
    return checkDbIntegrity(db);
  });

  ipcMain.handle('recovery:repairDb', () => {
    if (!dbPath) return { repaired: false, results: [{ step: 'no_db', success: false, message: 'Keine Datenbank' }] };
    const Database = require('better-sqlite3');
    return attemptDbRepair(Database, dbPath, backupDir, config.dbName);
  });

  ipcMain.handle('recovery:getStatus', () => {
    const db = getDb();
    const fs = require('node:fs');

    let meta = null;
    if (db) {
      try { meta = db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get(); } catch (_) {}
    }

    const backups = config.dbName ? listBackups(backupDir, config.dbName) : [];

    let dbSizeBytes = null;
    if (dbPath) {
      try { dbSizeBytes = fs.statSync(dbPath).size; } catch (_) {}
    }

    return {
      appName: config.name,
      appVersion: config.version || '0.0.0',
      schemaVersion: meta?.schema_version || null,
      appVersionFromDb: meta?.app_version || null,
      lastMigration: meta?.last_migration || null,
      backupCount: backups.length,
      lastBackup: backups[0]?.mtime || null,
      dbSizeBytes,
      safeMode,
      dbPath,
      userDataPath,
    };
  });

  // --- Ticket submission (requires license + portal URL) ---

  ipcMain.handle('support:submitTicket', async (_event, userDescription) => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) {
      return { ok: false, error: 'Portal-URL nicht konfiguriert' };
    }

    // Get license hash
    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (_) {}

    const cache = readLicenseCache(safeStorage, userDataPath);
    if (!cache.licenseKey) {
      return { ok: false, error: 'Kein Lizenzkey hinterlegt' };
    }
    const licenseHash = computeLicenseHash(cache.licenseKey);

    // Collect full bundle, then sanitize to Klasse-C
    const fullBundle = collectDiagnostics({
      appName: config.name,
      appVersion: config.version || '0.0.0',
      userDataPath,
      dbPath,
      db: getDb(),
      logDir,
      backupDir,
      safeMode,
    });
    const kiBundle = sanitizeBundle(fullBundle);

    // Submit to portal
    try {
      const result = await postJson(portalUrl, '/api/support/ticket', {
        licenseHash,
        productId,
        userDescription: userDescription || null,
        kiBundle,
      });
      logInfo('support', 'Ticket erstellt', { ticketRef: result.ticketRef });
      return { ok: true, ticketRef: result.ticketRef, status: result.status };
    } catch (err) {
      logWarn('support', 'Ticket-Erstellung fehlgeschlagen', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('support:getTickets', async () => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) return [];

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (_) {}

    const cache = readLicenseCache(safeStorage, userDataPath);
    if (!cache.licenseKey) return [];

    const licenseHash = computeLicenseHash(cache.licenseKey);

    try {
      const url = new URL('/api/support/tickets', portalUrl);
      url.searchParams.set('licenseHash', licenseHash);
      url.searchParams.set('status', 'open,resolved');
      return await getJson(url.toString());
    } catch (err) {
      logWarn('support', 'Ticket-Abruf fehlgeschlagen', { error: err.message });
      return [];
    }
  });

  // --- Feature Requests ---

  ipcMain.handle('featureRequest:submit', async (_event, data) => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) {
      return { ok: false, error: 'Portal-URL nicht konfiguriert' };
    }

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (_) {}

    const cache = readLicenseCache(safeStorage, userDataPath);
    if (!cache.licenseKey) {
      return { ok: false, error: 'Kein Lizenzkey hinterlegt' };
    }

    try {
      const result = await postJson(portalUrl, '/api/requests', {
        license_key: cache.licenseKey,
        title: data.title,
        description: data.description,
        priority: data.priority || 'normal',
      });
      logInfo('support', 'Feature-Request erstellt', { requestNumber: result.request_number });
      return { ok: true, requestNumber: result.request_number, status: result.status };
    } catch (err) {
      logWarn('support', 'Feature-Request fehlgeschlagen', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('featureRequest:list', async () => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) return [];

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (_) {}

    const cache = readLicenseCache(safeStorage, userDataPath);
    if (!cache.licenseKey) return [];

    try {
      const url = new URL('/api/requests', portalUrl);
      url.searchParams.set('key', cache.licenseKey);
      return await getJson(url.toString());
    } catch (err) {
      logWarn('support', 'Feature-Request-Abruf fehlgeschlagen', { error: err.message });
      return [];
    }
  });

  ipcMain.handle('featureRequest:get', async (_event, requestNumber) => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) return null;

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (_) {}

    const cache = readLicenseCache(safeStorage, userDataPath);
    if (!cache.licenseKey) return null;

    try {
      const url = new URL(`/api/requests/${requestNumber}`, portalUrl);
      url.searchParams.set('key', cache.licenseKey);
      return await getJson(url.toString());
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle('featureRequest:listPublic', async () => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) return [];

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (_) {}

    const cache = readLicenseCache(safeStorage, userDataPath);
    if (!cache.licenseKey) return [];

    try {
      const url = new URL('/api/requests/public', portalUrl);
      url.searchParams.set('key', cache.licenseKey);
      return await getJson(url.toString());
    } catch (err) {
      logWarn('support', 'Public-Requests-Abruf fehlgeschlagen', { error: err.message });
      return [];
    }
  });

  ipcMain.handle('featureRequest:vote', async (_event, requestNumber) => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) return { ok: false, error: 'Portal-URL nicht konfiguriert' };

    let safeStorage = null;
    try { safeStorage = require('electron').safeStorage; } catch (_) {}

    const cache = readLicenseCache(safeStorage, userDataPath);
    if (!cache.licenseKey) return { ok: false, error: 'Kein Lizenzkey hinterlegt' };

    try {
      const result = await postJson(portalUrl, `/api/requests/${requestNumber}/vote`, {
        license_key: cache.licenseKey,
      });
      return { ok: true, ...result };
    } catch (err) {
      logWarn('support', 'Vote fehlgeschlagen', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('changelog:list', async () => {
    const portalUrl = config.portalUrl;
    if (!portalUrl) return [];

    try {
      const url = new URL(`/api/changelog/${productId}`, portalUrl);
      return await getJson(url.toString());
    } catch (err) {
      logWarn('support', 'Changelog-Abruf fehlgeschlagen', { error: err.message });
      return [];
    }
  });

  logInfo('ipc', 'Support-Handler registriert');
}

/**
 * POST JSON to portal endpoint.
 */
function postJson(baseUrl, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(endpoint, baseUrl);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 15000,
    }, (res) => {
      let responseData = '';
      res.on('data', chunk => { responseData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (_) {
          reject(new Error('Ungueltige Antwort vom Server'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Zeitueberschreitung')); });
    req.write(data);
    req.end();
  });
}

/**
 * GET JSON from URL.
 */
function getJson(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(url, { method: 'GET', timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (_) {
          reject(new Error('Ungueltige Antwort'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Zeitueberschreitung')); });
    req.end();
  });
}

module.exports = { registerSupportHandlers };
