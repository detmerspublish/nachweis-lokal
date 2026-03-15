const fs = require('node:fs');
const path = require('node:path');
const { ERROR_CODES } = require('./error-codes.js');

const LOG_LEVELS = { critical: 0, error: 1, warn: 2, info: 3, debug: 4 };
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 5;

let logDir = null;
let logLevel = LOG_LEVELS.info;

function initLogger(dir, level = 'info') {
  logDir = dir;
  logLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  fs.mkdirSync(logDir, { recursive: true });
}

function log(level, component, message, data = null) {
  if (LOG_LEVELS[level] > logLevel) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...(data ? { data } : {}),
  };

  const line = JSON.stringify(entry) + '\n';

  if (process.env.NODE_ENV === 'development') {
    process.stdout.write(`[${level.toUpperCase()}] ${component}: ${message}\n`);
  }

  if (!logDir) return;
  const logFile = path.join(logDir, 'app.log');

  try {
    fs.appendFileSync(logFile, line);
    rotateIfNeeded(logFile);
  } catch (_) {
    // Logging must never crash the app
  }
}

function rotateIfNeeded(logFile) {
  try {
    const stat = fs.statSync(logFile);
    if (stat.size < MAX_FILE_SIZE) return;
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const from = path.join(logDir, `app.${i}.log`);
      const to = path.join(logDir, `app.${i + 1}.log`);
      if (fs.existsSync(from)) {
        if (i + 1 >= MAX_FILES) fs.unlinkSync(from);
        else fs.renameSync(from, to);
      }
    }
    fs.renameSync(logFile, path.join(logDir, 'app.1.log'));
  } catch (_) {}
}

function logCodedError(component, errorCode, message, data = null) {
  const severity = ERROR_CODES[errorCode]?.severity || 'error';
  log(severity, component, message, { ...data, errorCode });

  if (['critical', 'error'].includes(severity)) {
    persistLastError(errorCode, message);
  }
}

function persistLastError(errorCode, message) {
  if (!logDir) return;
  const lastErrorPath = path.join(path.dirname(logDir), 'last-error.json');
  try {
    fs.writeFileSync(lastErrorPath, JSON.stringify({
      code: errorCode,
      timestamp: new Date().toISOString(),
      message,
    }));
  } catch (_) {}
}

const logCritical = (comp, msg, data) => log('critical', comp, msg, data);
const logError = (comp, msg, data) => log('error', comp, msg, data);
const logWarn = (comp, msg, data) => log('warn', comp, msg, data);
const logInfo = (comp, msg, data) => log('info', comp, msg, data);
const logDebug = (comp, msg, data) => log('debug', comp, msg, data);

module.exports = {
  initLogger, log, logCodedError,
  logCritical, logError, logWarn, logInfo, logDebug,
};
