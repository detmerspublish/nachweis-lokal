const fs = require('node:fs');
const path = require('node:path');
const { logInfo, logWarn, logError, logCodedError } = require('../lib/logger.js');

let autoUpdater = null;
let updateStatePath = null;

function getUpdateState() {
  if (!updateStatePath || !fs.existsSync(updateStatePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(updateStatePath, 'utf-8'));
  } catch (_) { return null; }
}

function saveUpdateState(state) {
  if (!updateStatePath) return;
  try {
    fs.writeFileSync(updateStatePath, JSON.stringify(state, null, 2));
  } catch (_) {}
}

function registerUpdateHandlers({ ipcMain, app, config }) {
  const userDataPath = app.getPath('userData');
  updateStatePath = path.join(userDataPath, 'update-state.json');

  if (!config.autoUpdate || !config.updateUrl) {
    // Auto-update disabled — register no-op handlers
    ipcMain.handle('update:check', () => ({ available: false, reason: 'disabled' }));
    ipcMain.handle('update:install', () => ({ success: false, reason: 'disabled' }));
    ipcMain.handle('update:getState', () => getUpdateState());
    return;
  }

  // Lazy-load electron-updater (only when auto-update is enabled)
  try {
    const { autoUpdater: au } = require('electron-updater');
    autoUpdater = au;
  } catch (err) {
    logWarn('update', 'electron-updater not available', { error: err.message });
    ipcMain.handle('update:check', () => ({ available: false, reason: 'updater-missing' }));
    ipcMain.handle('update:install', () => ({ success: false, reason: 'updater-missing' }));
    ipcMain.handle('update:getState', () => getUpdateState());
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.setFeedURL({ provider: 'generic', url: config.updateUrl });

  let pendingUpdate = null;

  autoUpdater.on('update-available', (info) => {
    logInfo('update', 'Update verfuegbar', { version: info.version });
    pendingUpdate = info;
  });

  autoUpdater.on('update-not-available', () => {
    logInfo('update', 'Kein Update verfuegbar');
  });

  autoUpdater.on('download-progress', (progress) => {
    logInfo('update', 'Download-Fortschritt', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logInfo('update', 'Update heruntergeladen', { version: info.version });

    // Save update state before install
    saveUpdateState({
      previousVersion: app.getVersion(),
      currentVersion: info.version,
      updateDate: new Date().toISOString(),
      status: 'downloaded',
    });
  });

  autoUpdater.on('error', (err) => {
    logCodedError('update', 'CF-UPD-002', 'Update fehlgeschlagen', { error: err.message });
    pendingUpdate = null;
  });

  // IPC handlers
  ipcMain.handle('update:check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.updateInfo) {
        return { available: true, version: result.updateInfo.version };
      }
      return { available: false };
    } catch (err) {
      logCodedError('update', 'CF-UPD-001', 'Update-Pruefung fehlgeschlagen', { error: err.message });
      return { available: false, error: err.message };
    }
  });

  ipcMain.handle('update:download', async () => {
    if (!pendingUpdate) return { success: false, reason: 'no-update' };
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('update:install', () => {
    const state = getUpdateState();
    if (!state || state.status !== 'downloaded') {
      return { success: false, reason: 'not-downloaded' };
    }
    state.status = 'installed';
    saveUpdateState(state);
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  });

  ipcMain.handle('update:getState', () => getUpdateState());

  // Delayed auto-check (10s after start)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);

  // Verify update health on startup
  checkUpdateHealth(app);
}

function checkUpdateHealth(app) {
  const state = getUpdateState();
  if (!state) return;

  if (state.status === 'installed') {
    // First start after update — verify after 60s
    logInfo('update', 'Erster Start nach Update', { version: state.currentVersion });
    setTimeout(() => {
      state.status = 'verified';
      saveUpdateState(state);
      logInfo('update', 'Update als stabil verifiziert', { version: state.currentVersion });
    }, 60_000);
  }
}

module.exports = { registerUpdateHandlers };
