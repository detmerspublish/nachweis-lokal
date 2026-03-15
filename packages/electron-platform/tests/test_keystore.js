const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// Test keystore logic with a mock safeStorage
describe('keystore', () => {
  let tmpDir;
  let getOrCreateDbKey;
  let hasDbKey;

  // Simple mock: "encrypts" by prepending a marker, "decrypts" by removing it
  const MARKER = Buffer.from('ENC:');
  const mockSafeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (str) => Buffer.concat([MARKER, Buffer.from(str, 'utf-8')]),
    decryptString: (buf) => {
      const s = buf.toString('utf-8');
      if (!s.startsWith('ENC:')) throw new Error('Cannot decrypt');
      return s.slice(4);
    },
  };

  const mockSafeStorageUnavailable = {
    isEncryptionAvailable: () => false,
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-keystore-'));
    // Suppress logger output during tests
    const loggerPath = path.join(__dirname, '..', 'lib', 'logger.js');
    const logger = require(loggerPath);
    if (!logger._initialized) {
      logger.initLogger(path.join(tmpDir, 'logs'));
      logger._initialized = true;
    }
    ({ getOrCreateDbKey, hasDbKey } = require('../lib/keystore.js'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new key when none exists', () => {
    const key = getOrCreateDbKey(mockSafeStorage, tmpDir, 'test.db');
    assert.ok(key, 'Key should not be null');
    assert.equal(key.length, 64, 'Key should be 64 hex chars (32 bytes)');
    assert.match(key, /^[0-9a-f]{64}$/, 'Key should be hex');
  });

  it('returns same key on second call', () => {
    const key1 = getOrCreateDbKey(mockSafeStorage, tmpDir, 'test.db');
    const key2 = getOrCreateDbKey(mockSafeStorage, tmpDir, 'test.db');
    assert.equal(key1, key2);
  });

  it('returns null when safeStorage is unavailable', () => {
    const key = getOrCreateDbKey(mockSafeStorageUnavailable, tmpDir, 'test.db');
    assert.equal(key, null);
  });

  it('returns null when safeStorage is null', () => {
    const key = getOrCreateDbKey(null, tmpDir, 'test.db');
    assert.equal(key, null);
  });

  it('hasDbKey returns false when no key exists', () => {
    assert.equal(hasDbKey(tmpDir, 'test.db'), false);
  });

  it('hasDbKey returns true after key creation', () => {
    getOrCreateDbKey(mockSafeStorage, tmpDir, 'test.db');
    assert.equal(hasDbKey(tmpDir, 'test.db'), true);
  });

  it('generates new key when encrypted file is corrupt', () => {
    // Write garbage to key file
    const keyPath = path.join(tmpDir, 'test.db.db-key.enc');
    fs.writeFileSync(keyPath, 'garbage-data');

    const key = getOrCreateDbKey(mockSafeStorage, tmpDir, 'test.db');
    assert.ok(key, 'Should generate new key despite corrupt file');
    assert.equal(key.length, 64);
  });

  it('creates separate keys for different databases', () => {
    const key1 = getOrCreateDbKey(mockSafeStorage, tmpDir, 'db1.db');
    const key2 = getOrCreateDbKey(mockSafeStorage, tmpDir, 'db2.db');
    assert.notEqual(key1, key2, 'Different DBs should have different keys');
  });
});
