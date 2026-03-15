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
    parent_inspection_id INTEGER REFERENCES inspections(id),
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
}

describe('Maengeltracking (Defects)', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchemaV2(db);

    db.prepare("INSERT INTO templates (name) VALUES ('Brandschutz')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Fluchtweg frei?')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 1, 'Feuerloescher?')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 2, 'Rauchmelder?')").run();
    db.prepare("INSERT INTO objects (name) VALUES ('Halle A')").run();

    // Pruefung mit Maengeln
    db.prepare(`INSERT INTO inspections (template_id, object_id, title, inspector, status)
      VALUES (1, 1, 'Brandschutz Q1', 'Max', 'bemaengelt')`).run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, 1, 'ok')").run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result, remark) VALUES (1, 2, 'maengel', 'Abgelaufen')").run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result, remark) VALUES (1, 3, 'maengel', 'Batterie leer')").run();
  });

  it('defects Tabelle existiert mit korrekten Spalten', () => {
    const cols = db.prepare("PRAGMA table_info(defects)").all().map(c => c.name);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('inspection_id'));
    assert.ok(cols.includes('inspection_result_id'));
    assert.ok(cols.includes('description'));
    assert.ok(cols.includes('status'));
    assert.ok(cols.includes('due_date'));
    assert.ok(cols.includes('resolved_at'));
  });

  it('defects Status CHECK Constraint', () => {
    assert.throws(() => {
      db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, status) VALUES (1, 2, 'ungueltig')").run();
    }, /CHECK/);
  });

  it('Defects werden aus bemaengelten Ergebnissen erstellt', () => {
    // Simulate createDefectsFromInspection
    const results = db.prepare("SELECT * FROM inspection_results WHERE inspection_id = 1 AND result = 'maengel'").all();
    for (const r of results) {
      db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, description) VALUES (1, ?, ?)").run(r.id, r.remark ?? '');
    }

    const defects = db.prepare('SELECT * FROM defects WHERE inspection_id = 1').all();
    assert.equal(defects.length, 2);
    assert.equal(defects[0].status, 'offen');
    assert.equal(defects[0].description, 'Abgelaufen');
    assert.equal(defects[1].description, 'Batterie leer');
  });

  it('Defect Status-Aenderung: offen → behoben → verifiziert', () => {
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, description) VALUES (1, 2, 'Abgelaufen')").run();

    // offen → behoben
    db.prepare("UPDATE defects SET status = 'behoben', resolved_at = datetime('now'), updated_at = datetime('now') WHERE id = 1").run();
    let defect = db.prepare('SELECT * FROM defects WHERE id = 1').get();
    assert.equal(defect.status, 'behoben');
    assert.ok(defect.resolved_at);

    // behoben → verifiziert
    db.prepare("UPDATE defects SET status = 'verifiziert', updated_at = datetime('now') WHERE id = 1").run();
    defect = db.prepare('SELECT * FROM defects WHERE id = 1').get();
    assert.equal(defect.status, 'verifiziert');
  });

  it('Defect wieder oeffnen (verifiziert → offen)', () => {
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, description, status) VALUES (1, 2, 'Test', 'verifiziert')").run();
    db.prepare("UPDATE defects SET status = 'offen', resolved_at = NULL WHERE id = 1").run();
    const defect = db.prepare('SELECT * FROM defects WHERE id = 1').get();
    assert.equal(defect.status, 'offen');
    assert.equal(defect.resolved_at, null);
  });

  it('Offene Maengel zaehlen', () => {
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, status) VALUES (1, 2, 'offen')").run();
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, status) VALUES (1, 3, 'offen')").run();
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, status) VALUES (1, 2, 'behoben')").run();

    const count = db.prepare("SELECT COUNT(*) as c FROM defects WHERE status = 'offen'").get().c;
    assert.equal(count, 2);
  });

  it('Nachpruefung erstellt neue Pruefung nur mit Maengel-Items', () => {
    // Defects erstellen
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, description) VALUES (1, 2, 'Abgelaufen')").run();
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, description) VALUES (1, 3, 'Batterie leer')").run();

    // Simulate createReinspection
    const source = db.prepare('SELECT * FROM inspections WHERE id = 1').get();
    db.prepare(`INSERT INTO inspections (template_id, object_id, title, inspector, status, parent_inspection_id)
      VALUES (?, ?, ?, ?, 'offen', ?)`).run(
      source.template_id, source.object_id, `Nachpruefung: ${source.title}`, source.inspector, source.id
    );

    const defects = db.prepare('SELECT * FROM defects WHERE inspection_id = 1').all();
    for (const d of defects) {
      const ir = db.prepare('SELECT template_item_id FROM inspection_results WHERE id = ?').get(d.inspection_result_id);
      db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result, remark) VALUES (2, ?, 'offen', ?)").run(
        ir.template_item_id, d.description
      );
    }

    const newInsp = db.prepare('SELECT * FROM inspections WHERE id = 2').get();
    assert.equal(newInsp.title, 'Nachpruefung: Brandschutz Q1');
    assert.equal(newInsp.parent_inspection_id, 1);

    const newResults = db.prepare('SELECT * FROM inspection_results WHERE inspection_id = 2').all();
    assert.equal(newResults.length, 2); // Nur die 2 Maengel-Items, nicht alle 3
  });

  it('Defect mit Frist (due_date)', () => {
    db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, description, due_date) VALUES (1, 2, 'Frist', '2026-04-01')").run();
    const defect = db.prepare('SELECT * FROM defects WHERE id = 1').get();
    assert.equal(defect.due_date, '2026-04-01');
  });
});
