const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');

const { initLogger } = require('../lib/logger.js');
const {
  createBackup,
  validateBackup,
  listBackups,
  needsBackup,
  rotateBackups,
  restoreBackup,
} = require('../lib/backup-core.js');

let tmpDir;
let dbPath;
let backupDir;
let db;

function setup() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-backup-'));
  dbPath = path.join(tmpDir, 'test.db');
  backupDir = path.join(tmpDir, 'backups');

  // Init logger once
  initLogger(path.join(tmpDir, 'logs'));

  // Create test DB with _schema_meta
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE _schema_meta (id INTEGER PRIMARY KEY, schema_version INTEGER, app_version TEXT, last_migration TEXT);
    INSERT INTO _schema_meta VALUES (1, 5, '0.4.0', '2026-03-07');
    CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT);
    INSERT INTO members VALUES (1, 'Test User');
  `);
}

function teardown() {
  try { db.close(); } catch (_) {}
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe('backup-core', () => {
  beforeEach(setup);
  afterEach(teardown);

  describe('createBackup', () => {
    it('creates a backup file and meta.json', () => {
      const result = createBackup(db, backupDir, 'test.db', { appVersion: '0.4.0', schemaVersion: 5 });
      assert.ok(result.ok);
      assert.ok(fs.existsSync(result.path));
      assert.ok(fs.existsSync(result.path + '.meta.json'));

      const meta = JSON.parse(fs.readFileSync(result.path + '.meta.json', 'utf-8'));
      assert.equal(meta.appVersion, '0.4.0');
      assert.equal(meta.schemaVersion, 5);
      assert.ok(meta.dbSizeBytes > 0);
    });

    it('backup contains correct data', () => {
      const result = createBackup(db, backupDir, 'test.db');
      const backupDb = new Database(result.path, { readonly: true });
      const row = backupDb.prepare('SELECT name FROM members WHERE id = 1').get();
      assert.equal(row.name, 'Test User');
      backupDb.close();
    });
  });

  describe('validateBackup', () => {
    it('validates a good backup', () => {
      const result = createBackup(db, backupDir, 'test.db');
      const validation = validateBackup(Database, result.path);
      assert.ok(validation.valid);
      assert.equal(validation.schemaVersion, 5);
      assert.equal(validation.appVersion, '0.4.0');
      assert.equal(validation.reason, 'OK');
    });

    it('returns invalid for non-existent file', () => {
      const validation = validateBackup(Database, '/tmp/nonexistent.db');
      assert.ok(!validation.valid);
      assert.equal(validation.reason, 'Datei nicht gefunden');
    });

    it('returns invalid for empty file', () => {
      const emptyPath = path.join(tmpDir, 'empty.db');
      fs.writeFileSync(emptyPath, '');
      const validation = validateBackup(Database, emptyPath);
      assert.ok(!validation.valid);
      assert.equal(validation.reason, 'Datei ist leer');
    });

    it('updates meta.json validated field', () => {
      const result = createBackup(db, backupDir, 'test.db');

      // Before validation: validated = false
      let meta = JSON.parse(fs.readFileSync(result.path + '.meta.json', 'utf-8'));
      assert.equal(meta.validated, false);

      validateBackup(Database, result.path);

      // After validation: validated = true
      meta = JSON.parse(fs.readFileSync(result.path + '.meta.json', 'utf-8'));
      assert.equal(meta.validated, true);
    });
  });

  describe('listBackups', () => {
    it('returns empty array when no backups', () => {
      const list = listBackups(backupDir, 'test.db');
      assert.equal(list.length, 0);
    });

    it('lists backups sorted by newest first', () => {
      createBackup(db, backupDir, 'test.db');
      // Small delay to ensure different timestamps
      const buf = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(buf, 0, 0, 50);
      createBackup(db, backupDir, 'test.db');

      const list = listBackups(backupDir, 'test.db');
      assert.equal(list.length, 2);
      assert.ok(list[0].mtime >= list[1].mtime);
    });

    it('includes metadata when available', () => {
      createBackup(db, backupDir, 'test.db', { appVersion: '0.4.0' });
      const list = listBackups(backupDir, 'test.db');
      assert.equal(list.length, 1);
      assert.ok(list[0].meta);
      assert.equal(list[0].meta.appVersion, '0.4.0');
    });
  });

  describe('needsBackup', () => {
    it('returns true when no backups exist', () => {
      assert.ok(needsBackup(backupDir, 'test.db'));
    });

    it('returns false after fresh backup', () => {
      createBackup(db, backupDir, 'test.db');
      assert.ok(!needsBackup(backupDir, 'test.db'));
    });

    it('returns true with very short maxAge', () => {
      createBackup(db, backupDir, 'test.db');
      // 0ms maxAge = always needs backup
      assert.ok(needsBackup(backupDir, 'test.db', 0));
    });
  });

  describe('rotateBackups', () => {
    it('does nothing with no backups', () => {
      const result = rotateBackups(backupDir, 'test.db');
      assert.equal(result.kept, 0);
      assert.equal(result.deleted, 0);
    });

    it('keeps backups within daily limit', () => {
      // Create 3 backups
      for (let i = 0; i < 3; i++) {
        createBackup(db, backupDir, 'test.db');
        const buf = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(buf, 0, 0, 50);
      }

      const result = rotateBackups(backupDir, 'test.db', { daily: 5, weekly: 0, monthly: 0 });
      assert.equal(result.deleted, 0);
      assert.equal(result.kept, 3);
    });

    it('deletes excess backups', () => {
      for (let i = 0; i < 5; i++) {
        createBackup(db, backupDir, 'test.db');
        const buf = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(buf, 0, 0, 50);
      }

      const result = rotateBackups(backupDir, 'test.db', { daily: 2, weekly: 0, monthly: 0 });
      assert.equal(result.deleted, 3);
      assert.equal(result.kept, 2);

      const remaining = listBackups(backupDir, 'test.db');
      assert.equal(remaining.length, 2);
    });
  });

  describe('restoreBackup', () => {
    it('restores from a valid backup', () => {
      // Create backup
      const backupResult = createBackup(db, backupDir, 'test.db');

      // Modify current DB
      db.exec("UPDATE members SET name = 'Modified' WHERE id = 1");
      const modified = db.prepare('SELECT name FROM members WHERE id = 1').get();
      assert.equal(modified.name, 'Modified');

      // Restore
      const restoreResult = restoreBackup(Database, db, dbPath, backupResult.path, backupDir, 'test.db');
      assert.ok(restoreResult.ok);

      // Verify restored data
      const restoredDb = new Database(dbPath, { readonly: true });
      const row = restoredDb.prepare('SELECT name FROM members WHERE id = 1').get();
      assert.equal(row.name, 'Test User');
      restoredDb.close();
    });

    it('creates safety backup before restore', () => {
      const backupResult = createBackup(db, backupDir, 'test.db');
      const beforeCount = listBackups(backupDir, 'test.db').length;

      restoreBackup(Database, db, dbPath, backupResult.path, backupDir, 'test.db');

      const afterCount = listBackups(backupDir, 'test.db').length;
      assert.ok(afterCount > beforeCount);
    });

    it('rejects invalid backup', () => {
      const badPath = path.join(tmpDir, 'bad.db');
      fs.writeFileSync(badPath, 'not a database');

      const result = restoreBackup(Database, db, dbPath, badPath, backupDir, 'test.db');
      assert.ok(!result.ok);
      assert.ok(result.error.includes('ungueltig'));
    });
  });
});
