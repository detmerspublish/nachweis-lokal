const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { logInfo, logWarn } = require('./logger.js');

/**
 * Manages the DB encryption key via Electron's safeStorage API.
 * Key is stored encrypted in userData — only decryptable on the same machine/user.
 *
 * Usage:
 *   const key = getOrCreateDbKey(safeStorage, userDataPath, dbName);
 *   // key is a hex string used as SQLCipher PRAGMA key
 */

const KEY_FILE_NAME = '.db-key.enc';

function getKeyFilePath(userDataPath, dbName) {
  return path.join(userDataPath, `${dbName}${KEY_FILE_NAME}`);
}

/**
 * Gets existing key or creates a new one.
 * Returns null if safeStorage is not available (encryption disabled).
 *
 * @param {Electron.SafeStorage} safeStorage
 * @param {string} userDataPath
 * @param {string} dbName
 * @returns {string|null} hex encryption key or null
 */
function getOrCreateDbKey(safeStorage, userDataPath, dbName) {
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
    logWarn('keystore', 'safeStorage not available — DB encryption disabled');
    return null;
  }

  const keyPath = getKeyFilePath(userDataPath, dbName);

  if (fs.existsSync(keyPath)) {
    // Read and decrypt existing key
    try {
      const encrypted = fs.readFileSync(keyPath);
      const decrypted = safeStorage.decryptString(encrypted);
      logInfo('keystore', 'DB key loaded from keystore');
      return decrypted;
    } catch (err) {
      logWarn('keystore', 'Failed to decrypt DB key — generating new one', { error: err.message });
      // Key file corrupt or from different user/machine — fall through to create new
    }
  }

  // Generate new key (32 bytes = 64 hex chars)
  const newKey = crypto.randomBytes(32).toString('hex');

  try {
    const encrypted = safeStorage.encryptString(newKey);
    fs.writeFileSync(keyPath, encrypted);
    logInfo('keystore', 'New DB key generated and stored');
    return newKey;
  } catch (err) {
    logWarn('keystore', 'Failed to store DB key — encryption disabled', { error: err.message });
    return null;
  }
}

/**
 * Checks if a DB key exists (without decrypting).
 */
function hasDbKey(userDataPath, dbName) {
  return fs.existsSync(getKeyFilePath(userDataPath, dbName));
}

module.exports = { getOrCreateDbKey, hasDbKey };
