const path = require('node:path');
const { createBackup, validateBackup, listBackups, restoreBackup, rotateBackups } = require('../lib/backup-core.js');
const { logInfo } = require('../lib/logger.js');

/**
 * Registers backup-related IPC handlers.
 *
 * @param {Object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {Electron.App} deps.app
 * @param {Object} deps.config - Product config
 * @param {Function} deps.getDb - Returns current DB instance
 */
function registerBackupHandlers({ ipcMain, app, config, getDb }) {
  const userDataPath = app.getPath('userData');
  const backupDir = path.join(userDataPath, 'backups');
  const dbPath = config.dbName ? path.join(userDataPath, config.dbName) : null;

  ipcMain.handle('backup:create', () => {
    const db = getDb();
    if (!db) return { ok: false, error: 'Keine Datenbank vorhanden' };
    return createBackup(db, backupDir, config.dbName, {
      appVersion: config.version,
    });
  });

  ipcMain.handle('backup:list', () => {
    if (!config.dbName) return [];
    return listBackups(backupDir, config.dbName);
  });

  ipcMain.handle('backup:validate', (_event, backupPath) => {
    const Database = require('better-sqlite3');
    return validateBackup(Database, backupPath);
  });

  ipcMain.handle('backup:restore', (_event, backupPath) => {
    const db = getDb();
    if (!db) return { ok: false, error: 'Keine Datenbank vorhanden' };
    if (!dbPath) return { ok: false, error: 'Kein DB-Pfad konfiguriert' };
    const Database = require('better-sqlite3');
    return restoreBackup(Database, db, dbPath, backupPath, backupDir, config.dbName);
  });

  ipcMain.handle('backup:rotate', () => {
    if (!config.dbName) return { kept: 0, deleted: 0 };
    const retention = config.backupRotation || {};
    return rotateBackups(backupDir, config.dbName, retention);
  });

  logInfo('ipc', 'Backup-Handler registriert');
}

module.exports = { registerBackupHandlers };
