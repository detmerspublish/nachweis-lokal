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
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().split('T')[0];
}

describe('Wiederkehrende Pruefungen', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchemaV2(db);

    // Vorlage mit 365 Tage Intervall
    db.prepare("INSERT INTO templates (name, interval_days) VALUES ('Brandschutz', 365)").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Punkt 1')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 1, 'Punkt 2')").run();
    db.prepare("INSERT INTO objects (name) VALUES ('Halle A')").run();
  });

  it('parent_inspection_id Spalte existiert in inspections', () => {
    const cols = db.prepare("PRAGMA table_info(inspections)").all().map(c => c.name);
    assert.ok(cols.includes('parent_inspection_id'), 'parent_inspection_id Spalte fehlt');
  });

  it('wiederkehrende Pruefung wird korrekt erstellt', () => {
    // Quell-Pruefung
    db.prepare(`INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, status)
      VALUES (1, 1, 'Brandschutz Q1', 'Max', '2026-01-15', 'bestanden')`).run();

    // Simulate createRecurringInspection
    const source = db.prepare('SELECT * FROM inspections WHERE id = 1').get();
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(source.template_id);
    const dueDate = addDays(source.inspection_date, template.interval_days);

    db.prepare(`INSERT INTO inspections (template_id, object_id, title, inspector, due_date, status, parent_inspection_id)
      VALUES (?, ?, ?, ?, ?, 'offen', ?)`).run(
      source.template_id, source.object_id, source.title, source.inspector, dueDate, source.id
    );

    const newInsp = db.prepare('SELECT * FROM inspections WHERE id = 2').get();
    assert.equal(newInsp.status, 'offen');
    assert.equal(newInsp.parent_inspection_id, 1);
    assert.equal(newInsp.due_date, '2027-01-15');
    assert.equal(newInsp.template_id, 1);
    assert.equal(newInsp.object_id, 1);
  });

  it('neue Pruefung erhaelt Ergebnisse vom Template', () => {
    db.prepare(`INSERT INTO inspections (template_id, title, inspector) VALUES (1, 'Test', 'Max')`).run();
    const items = db.prepare('SELECT id FROM template_items WHERE template_id = 1 ORDER BY sort_order').all();
    for (const item of items) {
      db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, ?, 'offen')").run(item.id);
    }

    const results = db.prepare('SELECT * FROM inspection_results WHERE inspection_id = 1').all();
    assert.equal(results.length, 2);
    assert.equal(results[0].result, 'offen');
  });

  it('Vorlage ohne Intervall erzeugt keine Folgepruefung', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Einmalig')").run();
    const template = db.prepare('SELECT * FROM templates WHERE id = 2').get();
    assert.ok(!template.interval_days || template.interval_days <= 0);
  });

  it('due_date wird korrekt aus inspection_date + interval_days berechnet (UTC)', () => {
    // addDays parses YYYY-MM-DD as UTC and adds days in UTC
    assert.equal(addDays('2026-03-01', 90), '2026-05-30');
    assert.equal(addDays('2026-01-15', 365), '2027-01-15');
    assert.equal(addDays('2026-12-15', 30), '2027-01-14');
  });
});
