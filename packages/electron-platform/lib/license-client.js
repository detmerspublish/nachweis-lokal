const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { logInfo, logWarn } = require('./logger.js');

/**
 * License key format: CFML-XXXX-XXXX-XXXX-XXXX
 * - 4-char product prefix (CFML, CFFR, etc.)
 * - 4 groups of 4 chars from safe alphabet
 * - Last 2 chars of final group = CRC-8 checksum
 * - Alphabet: ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no O/0, I/1/l)
 */

const SAFE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const KEY_PATTERN = /^[A-Z]{2,4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

const HMAC_PEPPER = 'codefabrik-support-v1';
const LICENSE_FILE = 'license.json';
const INSTANCE_FILE = 'instance.json';

// Maps product prefix to product ID (production + trial keys)
const PREFIX_TO_PRODUCT = {
  'CFML': 'mitglieder-lokal',
  'CFFR': 'finanz-rechner',
  'CFRL': 'rechnung-lokal',
  'CFNW': 'nachweis-lokal',
  'CFBL': 'berater-lokal',
  'CFTM': 'mitglieder-lokal',
  'CFTR': 'finanz-rechner',
  'CFTL': 'rechnung-lokal',
  'CFTN': 'nachweis-lokal',
  'CFTB': 'berater-lokal',
};

/**
 * CRC-8 checksum over a string (simple polynomial).
 * Returns a 2-char value from the safe alphabet.
 */
function crc8(str) {
  let crc = 0;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }
  const c1 = SAFE_ALPHABET[crc % SAFE_ALPHABET.length];
  const c2 = SAFE_ALPHABET[Math.floor(crc / SAFE_ALPHABET.length) % SAFE_ALPHABET.length];
  return c1 + c2;
}

/**
 * Validates the license key format offline (no network).
 * Checks: pattern, prefix matches product, CRC-8 checksum.
 *
 * @param {string} key - License key (e.g. "CFML-ABCD-EFGH-JKMN-PQRS")
 * @param {string} expectedPrefix - Expected product prefix (e.g. "CFML")
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateKeyFormat(key, expectedPrefix) {
  if (!key || typeof key !== 'string') {
    return { valid: false, reason: 'Kein Key angegeben' };
  }

  const normalized = key.toUpperCase().trim();

  if (!KEY_PATTERN.test(normalized)) {
    return { valid: false, reason: 'Ungueltiges Format' };
  }

  // Check prefix: accept both production and trial prefixes for the same product
  const prefix = normalized.split('-')[0];
  const prefixProduct = PREFIX_TO_PRODUCT[prefix];
  const expectedProduct = PREFIX_TO_PRODUCT[expectedPrefix];
  if (!prefixProduct || prefixProduct !== expectedProduct) {
    return { valid: false, reason: 'Key passt nicht zu diesem Produkt' };
  }

  // Check CRC-8: compute over first 22 chars (prefix + 3 groups + first 2 of last group)
  const parts = normalized.split('-');
  const payload = parts[0] + parts[1] + parts[2] + parts[3] + parts[4].substring(0, 2);
  const expected = crc8(payload);
  const actual = parts[4].substring(2, 4);

  if (actual !== expected) {
    return { valid: false, reason: 'Pruefsumme ungueltig — bitte Key pruefen' };
  }

  return { valid: true };
}

/**
 * Computes HMAC-SHA256 hash of a license key for portal communication.
 * The key itself is never sent to the portal for ticket/support operations.
 *
 * @param {string} licenseKey
 * @returns {string} hex hash
 */
function computeLicenseHash(licenseKey) {
  return crypto.createHmac('sha256', HMAC_PEPPER)
    .update(licenseKey.toUpperCase().trim())
    .digest('hex');
}

/**
 * Reads the cached license state from disk.
 *
 * @param {Object} safeStorage - Electron safeStorage API
 * @param {string} userDataPath
 * @returns {{ licenseKey: string|null, lastValidation: Object|null }}
 */
function readLicenseCache(safeStorage, userDataPath) {
  const filePath = path.join(userDataPath, LICENSE_FILE);
  if (!fs.existsSync(filePath)) {
    return { licenseKey: null, lastValidation: null };
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Decrypt the key if safeStorage is available
    let licenseKey = null;
    if (data.encryptedKey && safeStorage?.isEncryptionAvailable()) {
      try {
        licenseKey = safeStorage.decryptString(Buffer.from(data.encryptedKey, 'base64'));
      } catch (_) {
        logWarn('license', 'Key-Entschluesselung fehlgeschlagen');
      }
    }

    return {
      licenseKey,
      productId: data.productId || null,
      lastValidation: data.lastValidation || null,
    };
  } catch (_) {
    return { licenseKey: null, lastValidation: null };
  }
}

/**
 * Writes the license state to disk (key encrypted via safeStorage).
 *
 * @param {Object} safeStorage - Electron safeStorage API
 * @param {string} userDataPath
 * @param {string} licenseKey
 * @param {string} productId
 * @param {Object} validationResult
 */
function writeLicenseCache(safeStorage, userDataPath, licenseKey, productId, validationResult) {
  const filePath = path.join(userDataPath, LICENSE_FILE);

  let encryptedKey = null;
  if (safeStorage?.isEncryptionAvailable()) {
    encryptedKey = safeStorage.encryptString(licenseKey).toString('base64');
  }

  const data = {
    encryptedKey,
    productId,
    lastValidation: {
      timestamp: new Date().toISOString(),
      ...validationResult,
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  logInfo('license', 'Lizenz-Cache aktualisiert');
}

/**
 * Removes the license from disk.
 *
 * @param {string} userDataPath
 */
function removeLicenseCache(userDataPath) {
  const filePath = path.join(userDataPath, LICENSE_FILE);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logInfo('license', 'Lizenz entfernt');
  }
}

/**
 * Determines the current license status based on cached validation.
 *
 * @param {Object|null} lastValidation - Cached validation result
 * @returns {{ active: boolean, reason: string, features: string[] }}
 */
function getLicenseStatus(lastValidation) {
  if (!lastValidation) {
    return { active: false, reason: 'no_license', features: [] };
  }

  if (!lastValidation.valid) {
    return { active: false, reason: lastValidation.reason || 'invalid', features: [] };
  }

  // Check if expired
  if (lastValidation.expiresAt) {
    const expiresAt = new Date(lastValidation.expiresAt);
    const now = new Date();
    const graceDays = 30;
    const graceMs = graceDays * 24 * 60 * 60 * 1000;

    if (now > new Date(expiresAt.getTime() + graceMs)) {
      return { active: false, reason: 'expired', features: [] };
    }
  }

  // Check if revoked
  if (lastValidation.status === 'revoked') {
    return { active: false, reason: 'revoked', features: [] };
  }

  // Check cache age (180 days max offline)
  if (lastValidation.timestamp) {
    const cacheAge = Date.now() - new Date(lastValidation.timestamp).getTime();
    const maxOfflineMs = 180 * 24 * 60 * 60 * 1000;
    if (cacheAge > maxOfflineMs) {
      return { active: false, reason: 'cache_expired', features: [] };
    }
  }

  return {
    active: true,
    reason: 'active',
    features: lastValidation.features || ['support', 'updates'],
    expiresAt: lastValidation.expiresAt,
    status: lastValidation.status,
  };
}

/**
 * Checks if a background re-validation is needed (cache > 30 days).
 *
 * @param {Object|null} lastValidation
 * @returns {boolean}
 */
function needsRevalidation(lastValidation) {
  if (!lastValidation?.timestamp) return true;
  const cacheAge = Date.now() - new Date(lastValidation.timestamp).getTime();
  const revalidateMs = 30 * 24 * 60 * 60 * 1000;
  return cacheAge > revalidateMs;
}

/**
 * Returns or creates a persistent instance ID (UUID v4).
 * Stored in a separate file so it survives license removal.
 *
 * @param {string} userDataPath
 * @returns {string} UUID v4
 */
function getOrCreateInstanceId(userDataPath) {
  const filePath = path.join(userDataPath, INSTANCE_FILE);

  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (data.instanceId && typeof data.instanceId === 'string') {
        return data.instanceId;
      }
    }
  } catch (_) {
    // Corrupted file — regenerate
  }

  const instanceId = crypto.randomUUID();
  fs.writeFileSync(filePath, JSON.stringify({ instanceId, createdAt: new Date().toISOString() }, null, 2));
  logInfo('license', 'Instance-ID erstellt', { instanceId });
  return instanceId;
}

module.exports = {
  SAFE_ALPHABET,
  PREFIX_TO_PRODUCT,
  crc8,
  validateKeyFormat,
  computeLicenseHash,
  readLicenseCache,
  writeLicenseCache,
  removeLicenseCache,
  getLicenseStatus,
  needsRevalidation,
  getOrCreateInstanceId,
};
