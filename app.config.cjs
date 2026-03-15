const path = require('node:path');
const fs = require('node:fs');

module.exports = {
  name: 'Nachweis Lokal',
  identifier: 'de.detmers-publish.nachweis-lokal',
  productId: 'nachweis-lokal',
  windowTitle: 'Nachweis Lokal — Pruefprotokolle & Checklisten',
  width: 1024,
  height: 768,
  dbName: 'nachweis.db',
  encryption: false,
  iconPath: path.join(__dirname, 'assets', 'icons', '128x128.png'),
  preloadPath: path.join(__dirname, 'node_modules', '@codefabrik', 'electron-platform', 'preload.cjs'),
  distPath: path.join(__dirname, 'dist', 'index.html'),
  licensePrefix: 'CFNW',
  portalUrl: 'https://portal.detmers-publish.de',
  autoUpdate: false,
  updateUrl: null,

  registerIpcHandlers: ({ ipcMain, app, getDb }) => {
    const { startServer, stopServer, getStatus, setInspection } = require('./electron/mobile-server.cjs');
    const { generateQR } = require('./electron/mobile-qr.cjs');
    const mobilePath = path.join(__dirname, 'mobile');

    ipcMain.handle('mobile:start', async (_event, inspectionId) => {
      const userDataPath = app.getPath('userData');

      // 1. Check for active paid license
      const licenseFile = path.join(userDataPath, 'license.json');
      let hasActiveLicense = false;
      try {
        const data = JSON.parse(fs.readFileSync(licenseFile, 'utf-8'));
        if (data.lastValidation?.valid && data.lastValidation?.status === 'active') {
          const expiresAt = data.lastValidation.expiresAt ? new Date(data.lastValidation.expiresAt) : null;
          hasActiveLicense = !expiresAt || expiresAt > new Date();
        }
      } catch (_) {}

      // 2. If no paid license, check/create trial
      let trialInfo = null;
      if (!hasActiveLicense) {
        const trialFile = path.join(userDataPath, 'mobile-trial.json');
        try {
          const trial = JSON.parse(fs.readFileSync(trialFile, 'utf-8'));
          const startedAt = new Date(trial.startedAt);
          const expiresAt = new Date(startedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
          const now = new Date();
          if (now >= expiresAt) {
            return { ok: false, reason: 'trial_expired', trialExpiresAt: expiresAt.toISOString() };
          }
          const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          trialInfo = { trial: true, trialDaysLeft: daysLeft, trialExpiresAt: expiresAt.toISOString() };
        } catch (_) {
          // No trial file yet — create it (first use)
          const startedAt = new Date().toISOString();
          fs.writeFileSync(trialFile, JSON.stringify({ startedAt }));
          const expiresAt = new Date(new Date(startedAt).getTime() + 30 * 24 * 60 * 60 * 1000);
          trialInfo = { trial: true, trialDaysLeft: 30, trialExpiresAt: expiresAt.toISOString() };
        }
      }

      // 3. Start mobile server
      const result = await startServer({
        getDb,
        mobilePath,
        onResultUpdate: (data) => {
          try {
            const { BrowserWindow } = require('electron');
            const windows = BrowserWindow.getAllWindows();
            if (windows[0]) windows[0].webContents.send('mobile:resultUpdated', data);
          } catch (_) {}
        },
      });
      setInspection(inspectionId);
      const qr = generateQR(result.url + '/inspect/' + inspectionId + '?token=' + result.token);
      return { ...result, qrMatrix: qr.matrix, inspectionId, ...(trialInfo || {}) };
    });

    ipcMain.handle('mobile:stop', async () => {
      stopServer();
      return { ok: true };
    });

    ipcMain.handle('mobile:getStatus', () => {
      return getStatus();
    });
  },
};
