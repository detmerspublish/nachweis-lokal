const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { initLogger } = require('../lib/logger.js');
const {
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
} = require('../lib/license-client.js');

let tmpDir;

// Helper: generate a valid key with correct CRC
function generateValidKey(prefix) {
  const chars = SAFE_ALPHABET;
  const randomChar = () => chars[Math.floor(Math.random() * chars.length)];
  const g1 = Array.from({ length: 4 }, randomChar).join('');
  const g2 = Array.from({ length: 4 }, randomChar).join('');
  const g3 = Array.from({ length: 4 }, randomChar).join('');
  const g4first2 = Array.from({ length: 2 }, randomChar).join('');
  const payload = prefix + g1 + g2 + g3 + g4first2;
  const checksum = crc8(payload);
  return `${prefix}-${g1}-${g2}-${g3}-${g4first2}${checksum}`;
}

// Mock safeStorage
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

describe('license-client', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-license-'));
    initLogger(path.join(tmpDir, 'logs'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('crc8', () => {
    it('returns a 2-char string from safe alphabet', () => {
      const result = crc8('CFMLABCDEFGHJKMN');
      assert.equal(result.length, 2);
      for (const c of result) {
        assert.ok(SAFE_ALPHABET.includes(c), `${c} not in safe alphabet`);
      }
    });

    it('is deterministic', () => {
      assert.equal(crc8('test'), crc8('test'));
    });

    it('different inputs produce different checksums', () => {
      assert.notEqual(crc8('CFMLABCDEFGH'), crc8('CFMLXYZWVUTS'));
    });
  });

  describe('validateKeyFormat', () => {
    it('accepts a valid key', () => {
      const key = generateValidKey('CFML');
      const result = validateKeyFormat(key, 'CFML');
      assert.ok(result.valid, `Key ${key} should be valid: ${result.reason}`);
    });

    it('rejects null/undefined', () => {
      assert.ok(!validateKeyFormat(null, 'CFML').valid);
      assert.ok(!validateKeyFormat(undefined, 'CFML').valid);
    });

    it('rejects wrong prefix', () => {
      const key = generateValidKey('CFFR');
      const result = validateKeyFormat(key, 'CFML');
      assert.ok(!result.valid);
      assert.ok(result.reason.includes('Produkt'));
    });

    it('rejects invalid format', () => {
      const result = validateKeyFormat('not-a-key', 'CFML');
      assert.ok(!result.valid);
      assert.ok(result.reason.includes('Format'));
    });

    it('rejects wrong checksum', () => {
      const key = generateValidKey('CFML');
      // Corrupt the last 2 chars
      const corrupted = key.slice(0, -2) + 'AA';
      const result = validateKeyFormat(corrupted, 'CFML');
      // Might still pass if AA happens to be the correct checksum (unlikely)
      // So we generate a definitely-wrong one
      const definitelyWrong = key.slice(0, -2) + (key.slice(-2) === 'ZZ' ? 'AA' : 'ZZ');
      const result2 = validateKeyFormat(definitelyWrong, 'CFML');
      // At least one should fail
      assert.ok(!result.valid || !result2.valid, 'At least one corrupted key should fail checksum');
    });

    it('is case-insensitive', () => {
      const key = generateValidKey('CFML');
      const result = validateKeyFormat(key.toLowerCase(), 'CFML');
      assert.ok(result.valid);
    });

    it('works with different prefixes', () => {
      const key = generateValidKey('CFFR');
      assert.ok(validateKeyFormat(key, 'CFFR').valid);
    });

    it('accepts trial key CFTM for mitglieder-lokal product (CFML prefix)', () => {
      const key = generateValidKey('CFTM');
      const result = validateKeyFormat(key, 'CFML');
      assert.ok(result.valid, `Trial key ${key} should be valid for CFML: ${result.reason}`);
    });

    it('accepts trial key CFTR for finanz-rechner product (CFFR prefix)', () => {
      const key = generateValidKey('CFTR');
      const result = validateKeyFormat(key, 'CFFR');
      assert.ok(result.valid, `Trial key ${key} should be valid for CFFR: ${result.reason}`);
    });

    it('rejects trial key CFTM for wrong product (CFFR)', () => {
      const key = generateValidKey('CFTM');
      const result = validateKeyFormat(key, 'CFFR');
      assert.ok(!result.valid);
    });

    it('rejects trial key CFTR for wrong product (CFML)', () => {
      const key = generateValidKey('CFTR');
      const result = validateKeyFormat(key, 'CFML');
      assert.ok(!result.valid);
    });
  });

  describe('PREFIX_TO_PRODUCT', () => {
    it('maps production prefixes correctly', () => {
      assert.equal(PREFIX_TO_PRODUCT['CFML'], 'mitglieder-lokal');
      assert.equal(PREFIX_TO_PRODUCT['CFFR'], 'finanz-rechner');
      assert.equal(PREFIX_TO_PRODUCT['CFBL'], 'berater-lokal');
    });

    it('maps trial prefixes to same products', () => {
      assert.equal(PREFIX_TO_PRODUCT['CFTM'], 'mitglieder-lokal');
      assert.equal(PREFIX_TO_PRODUCT['CFTR'], 'finanz-rechner');
      assert.equal(PREFIX_TO_PRODUCT['CFTB'], 'berater-lokal');
    });

    it('trial and production map to same product', () => {
      assert.equal(PREFIX_TO_PRODUCT['CFML'], PREFIX_TO_PRODUCT['CFTM']);
      assert.equal(PREFIX_TO_PRODUCT['CFFR'], PREFIX_TO_PRODUCT['CFTR']);
      assert.equal(PREFIX_TO_PRODUCT['CFBL'], PREFIX_TO_PRODUCT['CFTB']);
    });
  });

  describe('computeLicenseHash', () => {
    it('returns a 64-char hex string', () => {
      const hash = computeLicenseHash('CFML-ABCD-EFGH-JKMN-PQRS');
      assert.equal(hash.length, 64);
      assert.match(hash, /^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      const h1 = computeLicenseHash('CFML-ABCD-EFGH-JKMN-PQRS');
      const h2 = computeLicenseHash('CFML-ABCD-EFGH-JKMN-PQRS');
      assert.equal(h1, h2);
    });

    it('different keys produce different hashes', () => {
      const h1 = computeLicenseHash('CFML-ABCD-EFGH-JKMN-PQRS');
      const h2 = computeLicenseHash('CFML-WXYZ-EFGH-JKMN-PQRS');
      assert.notEqual(h1, h2);
    });

    it('is case-insensitive', () => {
      const h1 = computeLicenseHash('cfml-abcd-efgh-jkmn-pqrs');
      const h2 = computeLicenseHash('CFML-ABCD-EFGH-JKMN-PQRS');
      assert.equal(h1, h2);
    });
  });

  describe('license cache', () => {
    it('returns null when no cache exists', () => {
      const cache = readLicenseCache(mockSafeStorage, tmpDir);
      assert.equal(cache.licenseKey, null);
      assert.equal(cache.lastValidation, null);
    });

    it('round-trips key through write/read', () => {
      const key = 'CFML-ABCD-EFGH-JKMN-PQRS';
      writeLicenseCache(mockSafeStorage, tmpDir, key, 'mitglieder-lokal', {
        valid: true, status: 'active', expiresAt: '2027-03-07T00:00:00Z',
      });

      const cache = readLicenseCache(mockSafeStorage, tmpDir);
      assert.equal(cache.licenseKey, key);
      assert.equal(cache.productId, 'mitglieder-lokal');
      assert.ok(cache.lastValidation);
      assert.equal(cache.lastValidation.valid, true);
    });

    it('removeLicenseCache deletes the file', () => {
      writeLicenseCache(mockSafeStorage, tmpDir, 'CFML-TEST-TEST-TEST-TEST', 'test', {});
      assert.ok(fs.existsSync(path.join(tmpDir, 'license.json')));

      removeLicenseCache(tmpDir);
      assert.ok(!fs.existsSync(path.join(tmpDir, 'license.json')));
    });
  });

  describe('getLicenseStatus', () => {
    it('returns inactive when no validation', () => {
      const status = getLicenseStatus(null);
      assert.equal(status.active, false);
      assert.equal(status.reason, 'no_license');
    });

    it('returns active for valid recent cache', () => {
      const status = getLicenseStatus({
        valid: true,
        status: 'active',
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        features: ['support', 'updates'],
      });
      assert.equal(status.active, true);
      assert.deepEqual(status.features, ['support', 'updates']);
    });

    it('returns inactive for revoked key', () => {
      const status = getLicenseStatus({
        valid: true,
        status: 'revoked',
        timestamp: new Date().toISOString(),
      });
      assert.equal(status.active, false);
      assert.equal(status.reason, 'revoked');
    });

    it('returns inactive for expired key beyond grace period', () => {
      const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      const status = getLicenseStatus({
        valid: true,
        status: 'expired',
        timestamp: new Date().toISOString(),
        expiresAt: expired.toISOString(),
      });
      assert.equal(status.active, false);
      assert.equal(status.reason, 'expired');
    });

    it('returns active during grace period', () => {
      const expired = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      const status = getLicenseStatus({
        valid: true,
        status: 'active',
        timestamp: new Date().toISOString(),
        expiresAt: expired.toISOString(),
        features: ['support'],
      });
      assert.equal(status.active, true);
    });

    it('returns inactive for very old cache (>180d)', () => {
      const oldTimestamp = new Date(Date.now() - 181 * 24 * 60 * 60 * 1000);
      const status = getLicenseStatus({
        valid: true,
        status: 'active',
        timestamp: oldTimestamp.toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      assert.equal(status.active, false);
      assert.equal(status.reason, 'cache_expired');
    });
  });

  describe('needsRevalidation', () => {
    it('returns true when no validation', () => {
      assert.ok(needsRevalidation(null));
    });

    it('returns false for recent validation', () => {
      assert.ok(!needsRevalidation({ timestamp: new Date().toISOString() }));
    });

    it('returns true for old validation (>30d)', () => {
      const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      assert.ok(needsRevalidation({ timestamp: old.toISOString() }));
    });
  });

  describe('getOrCreateInstanceId', () => {
    it('creates a new instance ID on first call', () => {
      const id = getOrCreateInstanceId(tmpDir);
      assert.ok(id);
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('returns the same ID on subsequent calls', () => {
      const id1 = getOrCreateInstanceId(tmpDir);
      const id2 = getOrCreateInstanceId(tmpDir);
      assert.equal(id1, id2);
    });

    it('persists ID to instance.json file', () => {
      const id = getOrCreateInstanceId(tmpDir);
      const filePath = path.join(tmpDir, 'instance.json');
      assert.ok(fs.existsSync(filePath));
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.equal(data.instanceId, id);
      assert.ok(data.createdAt);
    });

    it('regenerates if file is corrupted', () => {
      const filePath = path.join(tmpDir, 'instance.json');
      fs.writeFileSync(filePath, 'invalid json');
      const id = getOrCreateInstanceId(tmpDir);
      assert.ok(id);
      assert.match(id, /^[0-9a-f]{8}-/);
    });

    it('survives license removal', () => {
      const id = getOrCreateInstanceId(tmpDir);
      writeLicenseCache(mockSafeStorage, tmpDir, 'CFML-TEST-TEST-TEST-TEST', 'test', {});
      removeLicenseCache(tmpDir);
      // Instance file should still exist
      const id2 = getOrCreateInstanceId(tmpDir);
      assert.equal(id, id2);
    });
  });
});
