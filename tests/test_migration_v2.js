import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize v1 schema (same as test_schema.js initSchema)
function initSchemaV1(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS org_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '', street TEXT DEFAULT '', zip TEXT DEFAULT '',
    city TEXT DEFAULT '', contact_email TEXT DEFAULT '', contact_phone TEXT DEFAULT '',
    responsible TEXT DEFAULT '', logo_path TEXT DEFAULT ''
  )`);
  db.exec(`INSERT OR IGNORE INTO org_profile (id) VALUES (1)`);
  db.exec(`CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
    category TEXT DEFAULT '', interval_days INTEGER, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL, hint TEXT,
    required INTEGER NOT NULL DEFAULT 1
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    location TEXT DEFAULT '', category TEXT DEFAULT '', identifier TEXT DEFAULT '',
    notes TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id),
    object_id INTEGER REFERENCES objects(id),
    title TEXT NOT NULL, inspector TEXT NOT NULL,
    inspection_date TEXT NOT NULL DEFAULT (date('now')),
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'offen'
      CHECK (status IN ('offen', 'bestanden', 'bemaengelt', 'abgebrochen')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS inspection_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    template_item_id INTEGER NOT NULL REFERENCES template_items(id),
    result TEXT NOT NULL DEFAULT 'offen'
      CHECK (result IN ('offen', 'ok', 'maengel', 'nicht_anwendbar')),
    remark TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, timestamp TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'app', version INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL, hash TEXT NOT NULL, prev_hash TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS _schema_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL DEFAULT 1,
    app_version TEXT NOT NULL, last_migration TEXT, event_replay_at TEXT
  )`);
  db.exec(`INSERT OR REPLACE INTO _schema_meta (id, schema_version, app_version, last_migration) VALUES (1, 1, '0.1.0', datetime('now'))`);
}

// Apply v2 migration (same as db.js MIGRATION_V2_SQL)
function migrateToV2(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_result_id INTEGER NOT NULL
      REFERENCES inspection_results(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_attachments_result ON attachments(inspection_result_id)');

  db.exec(`CREATE TABLE IF NOT EXISTS defects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id),
    inspection_result_id INTEGER NOT NULL REFERENCES inspection_results(id),
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'offen'
      CHECK (status IN ('offen', 'behoben', 'verifiziert')),
    due_date TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_defects_inspection ON defects(inspection_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_defects_status ON defects(status)');

  // ALTER TABLE fuer parent_inspection_id
  try {
    db.exec('ALTER TABLE inspections ADD COLUMN parent_inspection_id INTEGER REFERENCES inspections(id)');
  } catch {
    // Already exists
  }

  db.exec(`UPDATE _schema_meta SET schema_version = 2, app_version = '0.2.0', last_migration = datetime('now') WHERE id = 1`);
}

describe('Migration v1 → v2', () => {
  it('Migration fuegt neue Tabellen hinzu', () => {
    const db = new Database(':memory:');
    initSchemaV1(db);
    migrateToV2(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all().map(r => r.name).sort();

    assert.ok(tables.includes('attachments'), 'attachments Tabelle fehlt');
    assert.ok(tables.includes('defects'), 'defects Tabelle fehlt');
    db.close();
  });

  it('Migration fuegt parent_inspection_id Spalte hinzu', () => {
    const db = new Database(':memory:');
    initSchemaV1(db);
    migrateToV2(db);

    const cols = db.prepare("PRAGMA table_info(inspections)").all().map(c => c.name);
    assert.ok(cols.includes('parent_inspection_id'), 'parent_inspection_id fehlt');
    db.close();
  });

  it('_schema_meta wird auf v2 aktualisiert', () => {
    const db = new Database(':memory:');
    initSchemaV1(db);
    migrateToV2(db);

    const meta = db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
    assert.equal(meta.schema_version, 2);
    assert.equal(meta.app_version, '0.2.0');
    db.close();
  });

  it('v1 Daten bleiben nach Migration erhalten', () => {
    const db = new Database(':memory:');
    initSchemaV1(db);

    // v1 Daten einfuegen
    db.prepare("INSERT INTO templates (name, interval_days) VALUES ('Brandschutz', 365)").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Punkt 1')").run();
    db.prepare("INSERT INTO objects (name) VALUES ('Halle A')").run();
    db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, status) VALUES (1, 1, 'Q1', 'Max', 'bestanden')").run();

    migrateToV2(db);

    // Daten muessen noch da sein
    const template = db.prepare('SELECT * FROM templates WHERE id = 1').get();
    assert.equal(template.name, 'Brandschutz');
    const object = db.prepare('SELECT * FROM objects WHERE id = 1').get();
    assert.equal(object.name, 'Halle A');
    const inspection = db.prepare('SELECT * FROM inspections WHERE id = 1').get();
    assert.equal(inspection.title, 'Q1');
    assert.equal(inspection.parent_inspection_id, null);

    db.close();
  });

  it('Doppelte Migration ist idempotent', () => {
    const db = new Database(':memory:');
    initSchemaV1(db);
    migrateToV2(db);
    migrateToV2(db); // Second call should not fail

    const meta = db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
    assert.equal(meta.schema_version, 2);
    db.close();
  });

  it('Fixture v0.1.0 ist gueltige v1 Datenbank', () => {
    const fixturePath = join(__dirname, 'fixtures', 'db_v0.1.0.sqlite');
    const db = new Database(fixturePath, { readonly: true });

    // Verify it's v1
    const meta = db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
    assert.equal(meta.schema_version, 1);
    assert.equal(meta.app_version, '0.1.0');

    // Verify v1 tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all().map(r => r.name).sort();
    assert.ok(tables.includes('templates'), 'templates fehlt');
    assert.ok(tables.includes('inspections'), 'inspections fehlt');
    assert.ok(tables.includes('events'), 'events fehlt');

    db.close();
  });
});
