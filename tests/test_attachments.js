import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

function initSchemaV2(db) {
  db.pragma('foreign_keys = ON');

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
  db.exec(`CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id),
    object_id INTEGER,
    title TEXT NOT NULL, inspector TEXT NOT NULL,
    inspection_date TEXT NOT NULL DEFAULT (date('now')),
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'offen',
    notes TEXT,
    parent_inspection_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS inspection_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    template_item_id INTEGER NOT NULL REFERENCES template_items(id),
    result TEXT NOT NULL DEFAULT 'offen',
    remark TEXT
  )`);
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
}

describe('Foto-Anhaenge (Attachments)', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchemaV2(db);

    db.prepare("INSERT INTO templates (name) VALUES ('Test')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Punkt 1')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector) VALUES (1, 'Test', 'Max')").run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, 1, 'ok')").run();
  });

  it('attachments Tabelle existiert mit korrekten Spalten', () => {
    const cols = db.prepare("PRAGMA table_info(attachments)").all().map(c => c.name);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('inspection_result_id'));
    assert.ok(cols.includes('file_name'));
    assert.ok(cols.includes('file_path'));
    assert.ok(cols.includes('mime_type'));
    assert.ok(cols.includes('size_bytes'));
    assert.ok(cols.includes('created_at'));
  });

  it('Anhang erstellen und laden', () => {
    db.prepare(`INSERT INTO attachments (inspection_result_id, file_name, file_path, mime_type, size_bytes)
      VALUES (1, 'foto.jpg', '/tmp/attachments/1/foto.jpg', 'image/jpeg', 12345)`).run();

    const attachments = db.prepare('SELECT * FROM attachments WHERE inspection_result_id = 1').all();
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].file_name, 'foto.jpg');
    assert.equal(attachments[0].mime_type, 'image/jpeg');
    assert.equal(attachments[0].size_bytes, 12345);
  });

  it('mehrere Anhaenge pro Ergebnis', () => {
    db.prepare("INSERT INTO attachments (inspection_result_id, file_name, file_path) VALUES (1, 'a.jpg', '/tmp/a.jpg')").run();
    db.prepare("INSERT INTO attachments (inspection_result_id, file_name, file_path) VALUES (1, 'b.png', '/tmp/b.png')").run();
    db.prepare("INSERT INTO attachments (inspection_result_id, file_name, file_path) VALUES (1, 'c.jpg', '/tmp/c.jpg')").run();

    const count = db.prepare('SELECT COUNT(*) as c FROM attachments WHERE inspection_result_id = 1').get().c;
    assert.equal(count, 3);
  });

  it('Anhang loeschen', () => {
    db.prepare("INSERT INTO attachments (inspection_result_id, file_name, file_path) VALUES (1, 'foto.jpg', '/tmp/foto.jpg')").run();
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM attachments').get().c, 1);

    db.prepare('DELETE FROM attachments WHERE id = 1').run();
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM attachments').get().c, 0);
  });

  it('CASCADE: Anhaenge werden bei Ergebnis-Loeschung geloescht', () => {
    db.prepare("INSERT INTO attachments (inspection_result_id, file_name, file_path) VALUES (1, 'a.jpg', '/tmp/a.jpg')").run();
    db.prepare("INSERT INTO attachments (inspection_result_id, file_name, file_path) VALUES (1, 'b.jpg', '/tmp/b.jpg')").run();

    // Pruefung loeschen → CASCADE loescht Results → CASCADE loescht Attachments
    db.prepare('DELETE FROM inspections WHERE id = 1').run();
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM attachments').get().c, 0);
  });
});
