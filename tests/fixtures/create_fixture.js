#!/usr/bin/env node
// Creates db_v0.1.0.sqlite and events_v0.1.0.json fixtures for Nachweis Lokal.
// Run once: node tests/fixtures/create_fixture.js

import Database from 'better-sqlite3';
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'db_v0.1.0.sqlite');
const EVENTS_PATH = join(__dirname, 'events_v0.1.0.json');
const APP_SECRET = 'codefabrik-vereins-v1';

function computeHmacSync(message) {
  return createHmac('sha256', APP_SECRET).update(message).digest('hex');
}

// --- Schema v1 ---
const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS org_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '', street TEXT DEFAULT '', zip TEXT DEFAULT '',
    city TEXT DEFAULT '', contact_email TEXT DEFAULT '', contact_phone TEXT DEFAULT '',
    responsible TEXT DEFAULT '', logo_path TEXT DEFAULT ''
  )`,
  `INSERT OR IGNORE INTO org_profile (id) VALUES (1)`,

  `CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
    category TEXT DEFAULT '', interval_days INTEGER, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL, hint TEXT,
    required INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS idx_template_items_template ON template_items(template_id, sort_order)`,

  `CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    location TEXT DEFAULT '', category TEXT DEFAULT '', identifier TEXT DEFAULT '',
    notes TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  `CREATE TABLE IF NOT EXISTS inspections (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inspections_template ON inspections(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inspections_object ON inspections(object_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status)`,
  `CREATE INDEX IF NOT EXISTS idx_inspections_due ON inspections(due_date)`,

  `CREATE TABLE IF NOT EXISTS inspection_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    template_item_id INTEGER NOT NULL REFERENCES template_items(id),
    result TEXT NOT NULL DEFAULT 'offen'
      CHECK (result IN ('offen', 'ok', 'maengel', 'nicht_anwendbar')),
    remark TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_results_inspection ON inspection_results(inspection_id)`,

  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, timestamp TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'app', version INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL, hash TEXT NOT NULL, prev_hash TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,

  `CREATE TABLE IF NOT EXISTS _schema_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL DEFAULT 1,
    app_version TEXT NOT NULL, last_migration TEXT, event_replay_at TEXT
  )`,
  `INSERT OR REPLACE INTO _schema_meta (id, schema_version, app_version, last_migration) VALUES (1, 1, '0.1.0', datetime('now'))`,
];

function appendEvent(db, type, data) {
  const prev = db.prepare('SELECT id, hash FROM events ORDER BY id DESC LIMIT 1').get();
  const prevHash = prev?.hash ?? '0';
  const timestamp = new Date().toISOString();
  const dataJson = JSON.stringify(data);
  const message = `${type}|${timestamp}|${dataJson}|${prevHash}`;
  const hash = computeHmacSync(message);
  db.prepare(
    'INSERT INTO events (type, timestamp, actor, version, data, hash, prev_hash) VALUES (?, ?, ?, 1, ?, ?, ?)'
  ).run(type, timestamp, 'app', dataJson, hash, prevHash);
}

// --- Create DB ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

for (const sql of SCHEMA_SQL) {
  db.exec(sql);
}

appendEvent(db, 'AppGestartet', { version: '0.1.0', schema_version: 1 });

// --- Seed data ---

// Organisationsprofil
db.prepare("UPDATE org_profile SET name = 'Muster GmbH', street = 'Industriestr. 5', zip = '12345', city = 'Musterstadt', responsible = 'Max Mustermann', contact_email = 'info@muster.de', contact_phone = '0170-1234567' WHERE id = 1").run();
appendEvent(db, 'ProfilGespeichert', { name: 'Muster GmbH', street: 'Industriestr. 5', zip: '12345', city: 'Musterstadt', responsible: 'Max Mustermann', contact_email: 'info@muster.de', contact_phone: '0170-1234567', logo_path: '' });

// Vorlagen
db.prepare("INSERT INTO templates (name, description, category, interval_days) VALUES ('Brandschutzpruefung', 'Jaehrliche Brandschutzbegehung gemaess Arbeitsschutzgesetz', 'Sicherheit', 365)").run();
appendEvent(db, 'VorlageAngelegt', { id: 1, name: 'Brandschutzpruefung', description: 'Jaehrliche Brandschutzbegehung gemaess Arbeitsschutzgesetz', category: 'Sicherheit', interval_days: 365 });

db.prepare("INSERT INTO templates (name, description, category, interval_days) VALUES ('Spielplatzkontrolle', 'Woechentliche Sichtpruefung nach DIN EN 1176', 'Kontrolle', 7)").run();
appendEvent(db, 'VorlageAngelegt', { id: 2, name: 'Spielplatzkontrolle', description: 'Woechentliche Sichtpruefung nach DIN EN 1176', category: 'Kontrolle', interval_days: 7 });

db.prepare("INSERT INTO templates (name, description, category, interval_days) VALUES ('Geraetepruefung DGUV V3', 'Elektrische Betriebsmittel nach DGUV Vorschrift 3', 'Sicherheit', 730)").run();
appendEvent(db, 'VorlageAngelegt', { id: 3, name: 'Geraetepruefung DGUV V3', description: 'Elektrische Betriebsmittel nach DGUV Vorschrift 3', category: 'Sicherheit', interval_days: 730 });

// Pruefpunkte fuer Brandschutz
const brandschutzItems = [
  { label: 'Fluchttueren frei und funktionsfaehig?', hint: 'Alle Fluchttueren auf Gaengigkeit pruefen', required: 1 },
  { label: 'Feuerloescher vorhanden und geprueft?', hint: 'Plakette mit Pruefdatum kontrollieren', required: 1 },
  { label: 'Brandmeldeanlage funktionsfaehig?', hint: null, required: 1 },
  { label: 'Fluchtwegebeschilderung vollstaendig?', hint: 'Nachleuchtende Schilder pruefen', required: 1 },
  { label: 'Brandschutzklappe zugaenglich?', hint: null, required: 0 },
];
for (let i = 0; i < brandschutzItems.length; i++) {
  const item = brandschutzItems[i];
  db.prepare('INSERT INTO template_items (template_id, sort_order, label, hint, required) VALUES (1, ?, ?, ?, ?)').run(i, item.label, item.hint, item.required);
}
appendEvent(db, 'PruefpunkteGespeichert', { template_id: 1, count: brandschutzItems.length });

// Pruefpunkte fuer Spielplatz
const spielplatzItems = [
  { label: 'Schaukel: Aufhaengung und Ketten intakt?', hint: null, required: 1 },
  { label: 'Rutsche: Oberflaeche glatt, keine scharfen Kanten?', hint: null, required: 1 },
  { label: 'Sand: Sauber, keine Fremdkoerper?', hint: 'Auf Glasscherben und Tierkot achten', required: 1 },
  { label: 'Zaun: Geschlossen, keine Luecken?', hint: null, required: 1 },
];
for (let i = 0; i < spielplatzItems.length; i++) {
  const item = spielplatzItems[i];
  db.prepare('INSERT INTO template_items (template_id, sort_order, label, hint, required) VALUES (2, ?, ?, ?, ?)').run(i, item.label, item.hint, item.required);
}
appendEvent(db, 'PruefpunkteGespeichert', { template_id: 2, count: spielplatzItems.length });

// Pruefpunkte fuer DGUV V3
const dguvItems = [
  { label: 'Sichtpruefung: Gehaeuse unbeschaedigt?', hint: null, required: 1 },
  { label: 'Anschlussleitung: Keine Beschaedigung?', hint: 'Kabelmantel auf Risse pruefen', required: 1 },
  { label: 'Schutzleiter: Durchgang gemessen?', hint: null, required: 1 },
  { label: 'Isolationswiderstand: >= 1 MOhm?', hint: null, required: 1 },
  { label: 'Schutzleiterstrom: <= 3,5 mA?', hint: null, required: 1 },
  { label: 'Funktionspruefung bestanden?', hint: null, required: 1 },
];
for (let i = 0; i < dguvItems.length; i++) {
  const item = dguvItems[i];
  db.prepare('INSERT INTO template_items (template_id, sort_order, label, hint, required) VALUES (3, ?, ?, ?, ?)').run(i, item.label, item.hint, item.required);
}
appendEvent(db, 'PruefpunkteGespeichert', { template_id: 3, count: dguvItems.length });

// Objekte
db.prepare("INSERT INTO objects (name, location, category, identifier) VALUES ('Halle A', 'Erdgeschoss links', 'Gebaeude', 'GEB-001')").run();
appendEvent(db, 'ObjektAngelegt', { id: 1, name: 'Halle A', location: 'Erdgeschoss links', category: 'Gebaeude', identifier: 'GEB-001' });

db.prepare("INSERT INTO objects (name, location, category, identifier) VALUES ('Spielplatz Lindenweg', 'Lindenweg 12', 'Aussenanlage', 'SPL-001')").run();
appendEvent(db, 'ObjektAngelegt', { id: 2, name: 'Spielplatz Lindenweg', location: 'Lindenweg 12', category: 'Aussenanlage', identifier: 'SPL-001' });

db.prepare("INSERT INTO objects (name, location, category, identifier, notes) VALUES ('Bohrmaschine Metabo', 'Werkstatt Regal 3', 'Geraet', 'EL-042', 'Seriennr. M-2024-55891')").run();
appendEvent(db, 'ObjektAngelegt', { id: 3, name: 'Bohrmaschine Metabo', location: 'Werkstatt Regal 3', category: 'Geraet', identifier: 'EL-042', notes: 'Seriennr. M-2024-55891' });

// Pruefungen
db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, due_date, status) VALUES (1, 1, 'Brandschutz Halle A 2025', 'Max Mustermann', '2025-11-15', '2026-11-15', 'bestanden')").run();
appendEvent(db, 'PruefungAngelegt', { id: 1, template_id: 1, object_id: 1, title: 'Brandschutz Halle A 2025', inspector: 'Max Mustermann', inspection_date: '2025-11-15', due_date: '2026-11-15', status: 'bestanden' });

// Ergebnisse fuer Brandschutz
const brandschutzResults = ['ok', 'ok', 'ok', 'ok', 'nicht_anwendbar'];
for (let i = 0; i < brandschutzResults.length; i++) {
  db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result, remark) VALUES (1, ?, ?, ?)").run(i + 1, brandschutzResults[i], null);
}
appendEvent(db, 'ErgebnisseGespeichert', { inspection_id: 1, count: brandschutzResults.length });

db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, status, notes) VALUES (2, 2, 'Spielplatz KW10 2026', 'Anna Schmidt', '2026-03-09', 'bemaengelt', 'Rutsche hat Kratzer')").run();
appendEvent(db, 'PruefungAngelegt', { id: 2, template_id: 2, object_id: 2, title: 'Spielplatz KW10 2026', inspector: 'Anna Schmidt', inspection_date: '2026-03-09', status: 'bemaengelt', notes: 'Rutsche hat Kratzer' });

// Ergebnisse fuer Spielplatz
db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (2, 6, 'ok')").run();
db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result, remark) VALUES (2, 7, 'maengel', 'Tiefe Kratzer auf der Rutschflaeche, Splittergefahr')").run();
db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (2, 8, 'ok')").run();
db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (2, 9, 'ok')").run();
appendEvent(db, 'ErgebnisseGespeichert', { inspection_id: 2, count: 4 });

db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, status) VALUES (3, 3, 'DGUV V3 Bohrmaschine 2026', 'Klaus Weber', '2026-02-20', 'offen')").run();
appendEvent(db, 'PruefungAngelegt', { id: 3, template_id: 3, object_id: 3, title: 'DGUV V3 Bohrmaschine 2026', inspector: 'Klaus Weber', inspection_date: '2026-02-20', status: 'offen' });

// --- Export events ---
const events = db.prepare('SELECT * FROM events ORDER BY id').all();
writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2));

db.close();

console.log(`Fixture erstellt: ${DB_PATH}`);
console.log(`Events exportiert: ${EVENTS_PATH} (${events.length} Events)`);
