const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

const { initLogger } = require('../lib/logger.js');
const { collectDiagnostics, formatCompactInfo } = require('../lib/support-bundle.js');

let tmpDir;
let db;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-support-'));
  const logDir = path.join(tmpDir, 'logs');
  const backupDir = path.join(tmpDir, 'backups');
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  initLogger(logDir);

  // Create test DB
  const dbPath = path.join(tmpDir, 'test.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE _schema_meta (id INTEGER PRIMARY KEY, schema_version INTEGER, app_version TEXT);
    INSERT INTO _schema_meta VALUES (1, 5, '0.4.0');
  `);
}

function teardown() {
  try { db.close(); } catch (_) {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('support-bundle', () => {
  beforeEach(setup);
  afterEach(teardown);

  describe('collectDiagnostics', () => {
    it('returns system-info and case-summary', () => {
      const result = collectDiagnostics({
        appName: 'TestApp',
        appVersion: '1.0.0',
        userDataPath: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
        db,
        logDir: path.join(tmpDir, 'logs'),
        backupDir: path.join(tmpDir, 'backups'),
      });

      const names = result.files.map(f => f.name);
      assert.ok(names.includes('system-info.json'));
      assert.ok(names.includes('case-summary.json'));
    });

    it('system-info contains expected fields', () => {
      const result = collectDiagnostics({
        appName: 'TestApp',
        appVersion: '1.0.0',
        userDataPath: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
        db,
        logDir: path.join(tmpDir, 'logs'),
        backupDir: path.join(tmpDir, 'backups'),
      });

      const sysInfo = JSON.parse(result.files.find(f => f.name === 'system-info.json').content);
      assert.equal(sysInfo.app, 'TestApp');
      assert.equal(sysInfo.version, '1.0.0');
      assert.ok(sysInfo.os);
      assert.ok(sysInfo.timestamp);
    });

    it('case-summary includes schema version from DB', () => {
      const result = collectDiagnostics({
        appName: 'TestApp',
        appVersion: '1.0.0',
        userDataPath: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
        db,
        logDir: path.join(tmpDir, 'logs'),
        backupDir: path.join(tmpDir, 'backups'),
      });

      const summary = JSON.parse(result.files.find(f => f.name === 'case-summary.json').content);
      assert.equal(summary.schemaVersion, 5);
      assert.equal(summary.dbIntegrity, 'ok');
    });

    it('includes schema-meta.json', () => {
      const result = collectDiagnostics({
        appName: 'TestApp',
        appVersion: '1.0.0',
        userDataPath: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
        db,
        logDir: path.join(tmpDir, 'logs'),
        backupDir: path.join(tmpDir, 'backups'),
      });

      const names = result.files.map(f => f.name);
      assert.ok(names.includes('schema-meta.json'));
      const meta = JSON.parse(result.files.find(f => f.name === 'schema-meta.json').content);
      assert.equal(meta.schema_version, 5);
    });

    it('includes last-error.json when present', () => {
      const lastError = { errorCode: 'CF-DB-002', timestamp: new Date().toISOString() };
      fs.writeFileSync(path.join(tmpDir, 'last-error.json'), JSON.stringify(lastError));

      const result = collectDiagnostics({
        appName: 'TestApp',
        appVersion: '1.0.0',
        userDataPath: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
        db,
        logDir: path.join(tmpDir, 'logs'),
        backupDir: path.join(tmpDir, 'backups'),
      });

      const names = result.files.map(f => f.name);
      assert.ok(names.includes('last-error.json'));
    });

    it('works without DB (stateless product)', () => {
      db.close();
      const result = collectDiagnostics({
        appName: 'FinanzRechner lokal',
        appVersion: '0.2.0',
        userDataPath: tmpDir,
        dbPath: null,
        db: null,
        logDir: path.join(tmpDir, 'logs'),
      });

      const names = result.files.map(f => f.name);
      assert.ok(names.includes('system-info.json'));
      assert.ok(names.includes('case-summary.json'));
      // No DB-specific files
      assert.ok(!names.includes('schema-meta.json'));
      assert.ok(!names.includes('integrity-check.json'));
    });

    it('case-summary has risk flags', () => {
      const result = collectDiagnostics({
        appName: 'TestApp',
        appVersion: '1.0.0',
        userDataPath: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
        db,
        logDir: path.join(tmpDir, 'logs'),
        backupDir: path.join(tmpDir, 'backups'),
      });

      const summary = JSON.parse(result.files.find(f => f.name === 'case-summary.json').content);
      assert.ok('risks' in summary);
      assert.equal(typeof summary.risks.dataLoss, 'boolean');
      assert.equal(typeof summary.risks.cloudSync, 'boolean');
      assert.equal(typeof summary.risks.staleBackup, 'boolean');
    });
  });

  describe('formatCompactInfo', () => {
    it('returns two lines', () => {
      const result = formatCompactInfo({
        appName: 'Mitglieder lokal',
        appVersion: '0.5.0',
        schemaVersion: 7,
        errorCode: 'CF-DB-002',
        lastBackup: '2026-03-07',
        dbSizeMB: 12.3,
        diskFreeMB: 2100,
      });

      const lines = result.split('\n');
      assert.equal(lines.length, 2);
      assert.ok(lines[0].includes('Mitglieder lokal'));
      assert.ok(lines[0].includes('0.5.0'));
      assert.ok(lines[0].includes('Schema v7'));
      assert.ok(lines[0].includes('CF-DB-002'));
      assert.ok(lines[1].includes('Backup: 2026-03-07'));
      assert.ok(lines[1].includes('DB: 12.3 MB'));
    });

    it('handles missing optional fields', () => {
      const result = formatCompactInfo({
        appName: 'FinanzRechner lokal',
        appVersion: '0.2.0',
      });

      assert.ok(result.includes('FinanzRechner lokal'));
      assert.ok(result.includes('kein Schema'));
      assert.ok(result.includes('kein Fehler'));
    });
  });
});
