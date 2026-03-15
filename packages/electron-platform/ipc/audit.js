/**
 * IPC handlers for tamper-evident audit log.
 * Runs entirely in the main process — no IPC round-trips for hash chain operations.
 *
 * @license GPL-3.0-only
 */

const { createSqliteAuditStore } = require('../lib/sqlite-audit-store.js');

const AUDIT_SECRET = 'codefabrik-vereins-v1';

/**
 * Register audit IPC handlers.
 *
 * Uses dynamic import for tamper-evident-log (ESM) from CJS context.
 *
 * @param {Object} deps
 * @param {import('electron').IpcMain} deps.ipcMain
 * @param {Function} deps.getDb - Returns better-sqlite3 connection
 */
function registerAuditHandlers({ ipcMain, getDb }) {
  let auditLog = null;

  async function ensureAuditLog() {
    if (auditLog) return auditLog;
    const db = getDb();
    if (!db) throw new Error('audit: Datenbank nicht verfuegbar');
    const { createAuditLog } = await import('tamper-evident-log');
    const store = createSqliteAuditStore(db);
    auditLog = createAuditLog({ store, secret: AUDIT_SECRET });
    return auditLog;
  }

  ipcMain.handle('audit:append', async (_event, type, data, actor) => {
    const log = await ensureAuditLog();
    return log.append(type, data, actor);
  });

  ipcMain.handle('audit:verify', async (_event, options) => {
    const log = await ensureAuditLog();
    return log.verify(options);
  });

  ipcMain.handle('audit:getEvents', async (_event, options) => {
    const log = await ensureAuditLog();
    return log.getEvents(options);
  });
}

module.exports = { registerAuditHandlers };
