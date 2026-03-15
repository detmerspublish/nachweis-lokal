import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// Run all schema v1 SQL from db.js manually
function initSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS org_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    street TEXT DEFAULT '',
    zip TEXT DEFAULT '',
    city TEXT DEFAULT '',
    contact_email TEXT DEFAULT '',
    contact_phone TEXT DEFAULT '',
    responsible TEXT DEFAULT '',
    logo_path TEXT DEFAULT ''
  )`);
  db.exec(`INSERT OR IGNORE INTO org_profile (id) VALUES (1)`);

  db.exec(`CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT '',
    interval_days INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL,
    hint TEXT,
    required INTEGER NOT NULL DEFAULT 1
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_template_items_template ON template_items(template_id, sort_order)`);

  db.exec(`CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT DEFAULT '',
    category TEXT DEFAULT '',
    identifier TEXT DEFAULT '',
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id),
    object_id INTEGER REFERENCES objects(id),
    title TEXT NOT NULL,
    inspector TEXT NOT NULL,
    inspection_date TEXT NOT NULL DEFAULT (date('now')),
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'offen'
      CHECK (status IN ('offen', 'bestanden', 'bemaengelt', 'abgebrochen')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inspections_template ON inspections(template_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inspections_object ON inspections(object_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_inspections_due ON inspections(due_date)`);

  db.exec(`CREATE TABLE IF NOT EXISTS inspection_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    template_item_id INTEGER NOT NULL REFERENCES template_items(id),
    result TEXT NOT NULL DEFAULT 'offen'
      CHECK (result IN ('offen', 'ok', 'maengel', 'nicht_anwendbar')),
    remark TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_results_inspection ON inspection_results(inspection_id)`);

  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'app',
    version INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL,
    hash TEXT NOT NULL,
    prev_hash TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`);

  db.exec(`CREATE TABLE IF NOT EXISTS _schema_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL DEFAULT 1,
    app_version TEXT NOT NULL,
    last_migration TEXT,
    event_replay_at TEXT
  )`);
  db.exec(`INSERT OR REPLACE INTO _schema_meta (id, schema_version, app_version, last_migration) VALUES (1, 1, '0.1.0', datetime('now'))`);
}

describe('Schema v1', () => {
  it('alle 8 v1-Tabellen werden angelegt', () => {
    const db = new Database(':memory:');
    initSchema(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all().map(r => r.name).sort();
    assert.deepEqual(tables, [
      '_schema_meta', 'events', 'inspection_results', 'inspections',
      'objects', 'org_profile', 'template_items', 'templates',
    ]);
    db.close();
  });

  it('_schema_meta wird korrekt initialisiert', () => {
    const db = new Database(':memory:');
    initSchema(db);
    const meta = db.prepare('SELECT * FROM _schema_meta WHERE id = 1').get();
    assert.ok(meta, '_schema_meta row must exist');
    assert.equal(meta.schema_version, 1);
    assert.equal(meta.app_version, '0.1.0');
    db.close();
  });

  it('org_profile Singleton existiert nach Init', () => {
    const db = new Database(':memory:');
    initSchema(db);
    const profile = db.prepare('SELECT * FROM org_profile WHERE id = 1').get();
    assert.ok(profile, 'org_profile singleton must exist');
    assert.equal(profile.name, '');
    db.close();
  });

  it('templates Tabelle hat active-Default 1', () => {
    const db = new Database(':memory:');
    initSchema(db);
    db.prepare("INSERT INTO templates (name) VALUES ('Test')").run();
    const t = db.prepare('SELECT active FROM templates WHERE id = 1').get();
    assert.equal(t.active, 1);
    db.close();
  });

  it('inspections status CHECK Constraint funktioniert', () => {
    const db = new Database(':memory:');
    initSchema(db);
    db.prepare("INSERT INTO templates (name) VALUES ('Vorlage')").run();
    assert.throws(() => {
      db.prepare(`INSERT INTO inspections (template_id, title, inspector, status) VALUES (1, 'Test', 'Pruefer', 'ungueltig')`).run();
    }, /CHECK/);
    db.close();
  });

  it('inspection_results result CHECK Constraint funktioniert', () => {
    const db = new Database(':memory:');
    initSchema(db);
    db.prepare("INSERT INTO templates (name) VALUES ('Vorlage')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Punkt 1')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector) VALUES (1, 'Test', 'Pruefer')").run();
    assert.throws(() => {
      db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, 1, 'falsch')").run();
    }, /CHECK/);
    db.close();
  });

  it('template_items CASCADE bei Template-Loeschung', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    db.prepare("INSERT INTO templates (name) VALUES ('Vorlage')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Punkt 1')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 1, 'Punkt 2')").run();
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM template_items').get().c, 2);

    db.prepare('DELETE FROM templates WHERE id = 1').run();
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM template_items').get().c, 0);
    db.close();
  });
});
