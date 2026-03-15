const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { initLogger, logInfo, logWarn, logCritical, logError, logCodedError } = require('./lib/logger.js');
const { formatErrorDialog } = require('./lib/error-codes.js');
const { checkInstallIntegrity, checkWritable, checkDiskSpace, checkStorageRisks, checkDbIntegrity, checkResourceLimits } = require('./lib/health.js');
const { openDbWithRetry, attemptDbRepair } = require('./lib/recovery.js');
const { registerUpdateHandlers } = require('./ipc/update.js');
const { registerBackupHandlers } = require('./ipc/backup.js');
const { registerSupportHandlers } = require('./ipc/support.js');
const { getOrCreateDbKey } = require('./lib/keystore.js');
const { needsBackup, createBackup, rotateBackups } = require('./lib/backup-core.js');
const { registerLicenseHandlers } = require('./ipc/license.js');
const { registerAuditHandlers } = require('./ipc/audit.js');

/**
 * Creates and starts the Electron app with product-specific configuration.
 *
 * @param {Object} config
 * @param {string} config.name - Product display name
 * @param {string} config.identifier - App identifier
 * @param {string} config.windowTitle - Window title
 * @param {number} [config.width=1024] - Window width
 * @param {number} [config.height=768] - Window height
 * @param {string|null} [config.dbName=null] - Database filename (null = stateless product)
 * @param {boolean} [config.encryption=false] - Enable SQLCipher DB encryption (requires better-sqlite3-multiple-ciphers)
 * @param {string} [config.iconPath] - Path to icon file
 * @param {string} [config.preloadPath] - Custom preload script path
 * @param {string} [config.distPath] - Path to built renderer files
 * @param {Function} [config.registerIpcHandlers] - Product-specific IPC handler registration
 */
function createApp(config) {
  const hasDb = config.dbName != null;

  // 1. Single-Instance-Lock
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }

  let mainWindow = null;
  let splash = null;
  let db = null;
  let walInterval = null;
  let rendererTimeout = null;

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // --- Crash handlers (register early) ---
  process.on('uncaughtException', (err) => {
    logCritical('crash', 'Unbehandelte Exception', { message: err.message, stack: err.stack });
    try {
      const { title, message } = formatErrorDialog('CF-APP-001', err.message);
      dialog.showErrorBox(title, message);
    } catch (_) {}
  });
  process.on('unhandledRejection', (reason) => {
    logCritical('crash', 'Unbehandelte Promise-Rejection', {
      message: reason?.message || String(reason), stack: reason?.stack,
    });
  });

  // --- DB helpers (only for DB products) ---
  function getDb() {
    if (!hasDb) return null;
    return db;
  }

  // --- IPC: Database (only registered for DB products) ---
  function registerDbHandlers() {
    ipcMain.handle('db:execute', (_event, sql, params = []) => {
      const conn = getDb();
      const stmt = conn.prepare(sql);
      const info = stmt.run(...params);
      return { rowsAffected: info.changes, lastInsertId: info.lastInsertRowid };
    });

    ipcMain.handle('db:query', (_event, sql, params = []) => {
      const conn = getDb();
      const stmt = conn.prepare(sql);
      return stmt.all(...params);
    });
  }

  // --- IPC: Dialog (all products) ---
  function registerDialogHandlers() {
    ipcMain.handle('dialog:openFile', async (_event, options = {}) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: options.filters || [],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    });
  }

  // --- IPC: File operations (all products) ---
  function registerFsHandlers() {
    ipcMain.handle('fs:copyFile', (_event, src, destDir, fileName) => {
      const userDataDir = app.getPath('userData');
      const targetDir = path.join(userDataDir, destDir);
      fs.mkdirSync(targetDir, { recursive: true });
      const dest = path.join(targetDir, fileName);
      fs.copyFileSync(src, dest);
      return dest;
    });
  }

  // --- IPC: App info (all products) ---
  function registerAppHandlers() {
    ipcMain.handle('app:rendererReady', () => {
      if (rendererTimeout) {
        clearTimeout(rendererTimeout);
        rendererTimeout = null;
      }
      logInfo('app', 'Renderer bereit');
    });

    ipcMain.handle('app:isSafeMode', () => {
      return safeMode;
    });

    ipcMain.handle('firstRun:complete', () => {
      // Mark first run as done and load the actual app
      const marker = path.join(app.getPath('userData'), '.first-run-done');
      try { fs.writeFileSync(marker, new Date().toISOString()); } catch (_) {}
      logInfo('app', 'Erster-Start-Assistent abgeschlossen');

      // Load actual app
      if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      } else {
        const distPath = config.distPath || path.join(process.cwd(), 'dist', 'index.html');
        mainWindow.loadFile(distPath);
      }
    });
  }

  // --- Splash screen ---
  function showSplash() {
    splash = new BrowserWindow({
      width: 400, height: 200,
      frame: false, alwaysOnTop: true, resizable: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    splash.loadFile(path.join(__dirname, 'splash.html'));
  }

  function closeSplash() {
    if (splash && !splash.isDestroyed()) {
      splash.close();
      splash = null;
    }
  }

  // --- Main window creation ---
  function createWindow() {
    const preloadPath = config.preloadPath ||
      path.join(__dirname, 'preload.cjs');

    const windowOptions = {
      width: config.width || 1024,
      height: config.height || 768,
      title: config.windowTitle || config.name,
      show: false, // Show after ready-to-show
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    };

    if (fs.existsSync(preloadPath)) {
      windowOptions.webPreferences.preload = preloadPath;
    }

    if (config.iconPath) {
      windowOptions.icon = config.iconPath;
    }

    mainWindow = new BrowserWindow(windowOptions);

    mainWindow.once('ready-to-show', () => {
      closeSplash();
      mainWindow.show();
    });

    // Renderer timeout: 15s then show error page
    rendererTimeout = setTimeout(() => {
      logCodedError('app', 'CF-UI-001', 'Renderer hat nicht innerhalb von 15 Sekunden geantwortet');
      mainWindow.loadFile(path.join(__dirname, 'error.html'));
      closeSplash();
      mainWindow.show();
    }, 15_000);

    // First-run detection: show welcome screen on first start
    const firstRunMarker = path.join(app.getPath('userData'), '.first-run-done');
    const isFirstRun = !fs.existsSync(firstRunMarker);

    if (isFirstRun) {
      mainWindow.loadFile(path.join(__dirname, 'welcome.html'));
    } else if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      const distPath = config.distPath || path.join(process.cwd(), 'dist', 'index.html');
      mainWindow.loadFile(distPath);
    }
  }

  // --- Startup sequence ---
  const safeMode = process.argv.includes('--safe-mode');

  app.whenReady().then(() => {
    const userDataPath = app.getPath('userData');
    const logDir = path.join(userDataPath, 'logs');
    const markerPath = path.join(userDataPath, '.startup-marker');

    // 2. Initialize logger
    initLogger(logDir);
    logInfo('app', `${config.name} gestartet`, {
      platform: `${process.platform} ${process.arch}`,
      electron: process.versions.electron,
      safeMode,
    });

    // Show splash immediately
    showSplash();

    // 3. Crash detection (previous start not cleanly shut down?)
    const previousCrash = fs.existsSync(markerPath);
    if (previousCrash && !safeMode) {
      logWarn('app', 'Vorheriger Start nicht sauber beendet — Safe Mode empfohlen');
    }
    try {
      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(markerPath, new Date().toISOString());
    } catch (_) {}

    // 4. Install integrity check
    const appPath = config.distPath
      ? path.dirname(config.distPath)
      : path.join(process.cwd(), 'dist');
    const installCheck = checkInstallIntegrity(path.dirname(appPath));
    if (!installCheck.ok && !process.env.VITE_DEV_SERVER_URL) {
      logCodedError('health', 'CF-SYS-004', 'Installation beschaedigt', { missing: installCheck.missing });
      const { title, message } = formatErrorDialog('CF-SYS-004');
      closeSplash();
      dialog.showErrorBox(title, message);
      app.quit();
      return;
    }

    // 5. userData writable?
    const writable = checkWritable(userDataPath);
    if (!writable.ok) {
      logCodedError('health', 'CF-SYS-001', 'userData nicht beschreibbar');
      const { title, message } = formatErrorDialog('CF-SYS-001', writable.message);
      closeSplash();
      dialog.showErrorBox(title, message);
      app.quit();
      return;
    }

    // 6. Disk space
    const disk = checkDiskSpace(userDataPath, 300 * 1024 * 1024);
    if (!disk.ok) {
      logCodedError('health', 'CF-SYS-002', disk.message);
      const { title, message } = formatErrorDialog('CF-SYS-002', disk.message);
      closeSplash();
      dialog.showErrorBox(title, message);
      app.quit();
      return;
    }
    if (disk.warning) {
      logWarn('health', disk.message);
    }

    // --- DB-specific startup (only for DB products) ---
    if (hasDb && !safeMode) {
      const dbPath = path.join(userDataPath, config.dbName);
      const backupDir = path.join(userDataPath, 'backups');

      // 7. Storage risks (cloud sync, network drive)
      const risks = checkStorageRisks(dbPath);
      for (const risk of risks) {
        logWarn('health', risk.message, { type: risk.type });
        if (risk.severity === 'high') {
          dialog.showMessageBoxSync({
            type: 'warning', title: 'Hinweis zur Datensicherheit',
            message: risk.message + '\n\nEmpfehlung: Datenbank in einen lokalen Ordner verschieben.',
            buttons: ['Verstanden'],
          });
        }
      }

      // 8. Encryption key (SQLCipher, optional)
      let encryptionKey = null;
      if (config.encryption) {
        const { safeStorage } = require('electron');
        encryptionKey = getOrCreateDbKey(safeStorage, userDataPath, config.dbName);
        if (encryptionKey) {
          logInfo('db', 'DB-Verschluesselung aktiviert');
        } else {
          logWarn('db', 'DB-Verschluesselung angefordert aber nicht verfuegbar');
        }
      }

      // 9. Open DB (with lock recovery)
      try {
        const Database = require('better-sqlite3');
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        db = openDbWithRetry(Database, dbPath, 3, { encryptionKey });
      } catch (err) {
        logCodedError('db', 'CF-DB-003', 'DB nicht oeffenbar', { error: err.message });
        const choice = dialog.showMessageBoxSync({
          type: 'error', title: 'Datenbankfehler',
          message: `Die Datenbank konnte nicht geoeffnet werden.\n\n[CF-DB-003] ${err.message}`,
          buttons: ['Reparatur versuchen', 'Beenden'],
          defaultId: 0, cancelId: 1,
        });
        if (choice === 0) {
          try {
            const Database = require('better-sqlite3');
            const repair = attemptDbRepair(Database, dbPath, backupDir, config.dbName);
            if (repair.repaired) {
              db = openDbWithRetry(Database, dbPath, 3, { encryptionKey });
            } else {
              closeSplash();
              dialog.showErrorBox('Reparatur fehlgeschlagen',
                'Automatische Reparatur nicht moeglich. Bitte wenden Sie sich an den Support.');
              app.quit();
              return;
            }
          } catch (_) {
            closeSplash();
            dialog.showErrorBox('Reparatur fehlgeschlagen', 'Schwerwiegender Datenbankfehler.');
            app.quit();
            return;
          }
        } else {
          closeSplash();
          app.quit();
          return;
        }
      }

      // 9. DB health check
      if (db) {
        const health = checkDbIntegrity(db);
        if (!health.ok) {
          logCodedError('health', 'CF-DB-002', 'Integritaetspruefung fehlgeschlagen');
        }

        // Resource limits
        const dbPath2 = path.join(userDataPath, config.dbName);
        const warnings = checkResourceLimits(dbPath2);
        for (const w of warnings) { logWarn('health', w.message, { type: w.type }); }
      }

      // 10. Auto-backup (if last backup > 24h)
      if (db) {
        try {
          if (needsBackup(backupDir, config.dbName)) {
            const result = createBackup(db, backupDir, config.dbName, {
              appVersion: config.version,
            });
            if (result.ok) {
              rotateBackups(backupDir, config.dbName, config.backupRotation || {});
            }
          }
        } catch (err) {
          logWarn('backup', 'Auto-Backup fehlgeschlagen', { error: err.message });
        }
      }

      // 11. WAL checkpoints (every 5 min)
      if (db) {
        walInterval = setInterval(() => {
          try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (_) {}
        }, 5 * 60 * 1000);
      }
    }

    // Register platform IPC handlers
    registerDialogHandlers();
    registerFsHandlers();
    registerAppHandlers();

    if (hasDb) {
      registerDbHandlers();
      registerAuditHandlers({ ipcMain, getDb });
    }

    // Register backup handlers (DB products only)
    if (hasDb) {
      registerBackupHandlers({ ipcMain, app, config, getDb });
    }

    // Register support/recovery handlers
    registerSupportHandlers({ ipcMain, app, config, getDb, safeMode });

    // Register license handlers
    registerLicenseHandlers({ ipcMain, app, config });

    // Register update handlers
    registerUpdateHandlers({ ipcMain, app, config });

    // Register product-specific IPC handlers
    if (typeof config.registerIpcHandlers === 'function') {
      config.registerIpcHandlers({ ipcMain, app, dialog, getDb });
    }

    createWindow();
  });

  // --- Shutdown ---
  app.on('window-all-closed', () => {
    if (walInterval) clearInterval(walInterval);

    if (db) {
      try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
      db.close();
      db = null;
    }

    // Clean startup marker (clean shutdown)
    const markerPath = path.join(app.getPath('userData'), '.startup-marker');
    try { fs.unlinkSync(markerPath); } catch (_) {}

    app.quit();
  });
}

module.exports = { createApp };
