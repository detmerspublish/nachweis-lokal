const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ERROR_CODES, getErrorInfo, formatErrorDialog } = require('../lib/error-codes.js');

describe('error-codes', () => {
  it('all codes have required fields', () => {
    for (const [code, info] of Object.entries(ERROR_CODES)) {
      assert.ok(info.category, `${code} missing category`);
      assert.ok(info.severity, `${code} missing severity`);
      assert.ok(info.title, `${code} missing title`);
      assert.ok(info.userMessage, `${code} missing userMessage`);
      assert.ok(info.action, `${code} missing action`);
    }
  });

  it('all codes follow CF-XXX-NNN pattern', () => {
    for (const code of Object.keys(ERROR_CODES)) {
      assert.match(code, /^CF-[A-Z]{2,4}-\d{3}$/, `Invalid code format: ${code}`);
    }
  });

  it('getErrorInfo returns known code', () => {
    const info = getErrorInfo('CF-DB-001');
    assert.equal(info.category, 'db');
    assert.equal(info.severity, 'error');
  });

  it('getErrorInfo returns fallback for unknown code', () => {
    const info = getErrorInfo('CF-UNKNOWN-999');
    assert.equal(info.category, 'unknown');
  });

  it('formatErrorDialog includes code and message', () => {
    const { title, message } = formatErrorDialog('CF-DB-001');
    assert.ok(title.length > 0);
    assert.ok(message.includes('[CF-DB-001]'));
    assert.ok(message.includes('Datenbank'));
  });

  it('formatErrorDialog includes technical detail', () => {
    const { message } = formatErrorDialog('CF-DB-001', 'SQLITE_BUSY');
    assert.ok(message.includes('SQLITE_BUSY'));
  });
});
