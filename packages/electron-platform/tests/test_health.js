const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { checkInstallIntegrity, checkWritable, checkStorageRisks } = require('../lib/health.js');

describe('health', () => {
  it('checkInstallIntegrity passes when dist/index.html exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-health-'));
    fs.mkdirSync(path.join(tmpDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'dist', 'index.html'), '<html>');
    const result = checkInstallIntegrity(tmpDir);
    assert.ok(result.ok);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('checkInstallIntegrity fails when dist/index.html missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-health-'));
    const result = checkInstallIntegrity(tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.missing.includes('dist/index.html'));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('checkWritable passes for writable directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-write-'));
    const result = checkWritable(tmpDir);
    assert.ok(result.ok);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('checkStorageRisks detects OneDrive path', () => {
    const risks = checkStorageRisks('/Users/test/OneDrive/data/app.db');
    assert.equal(risks.length, 1);
    assert.equal(risks[0].type, 'cloud-sync');
    assert.equal(risks[0].service, 'onedrive');
  });

  it('checkStorageRisks detects Dropbox path', () => {
    const risks = checkStorageRisks('/home/user/Dropbox/db.sqlite');
    assert.equal(risks.length, 1);
    assert.equal(risks[0].service, 'dropbox');
  });

  it('checkStorageRisks detects network path', () => {
    const risks = checkStorageRisks('\\\\server\\share\\db.sqlite');
    assert.equal(risks.length, 1);
    assert.equal(risks[0].type, 'network-path');
  });

  it('checkStorageRisks returns empty for normal path', () => {
    const risks = checkStorageRisks('/home/user/.local/share/app/data.db');
    assert.equal(risks.length, 0);
  });
});
