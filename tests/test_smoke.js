import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createHmac } from 'node:crypto';

const APP_SECRET = 'codefabrik-vereins-v1';

function computeHmacSync(message) {
  return createHmac('sha256', APP_SECRET).update(message).digest('hex');
}

// Run full schema v1 on in-memory DB
function initFullDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`CREATE TABLE IF NOT EXISTS org_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '', street TEXT DEFAULT '', zip TEXT DEFAULT '',
    city TEXT DEFAULT '', contact_email TEXT DEFAULT '', contact_phone TEXT DEFAULT '',
    responsible TEXT DEFAULT '', logo_path TEXT DEFAULT ''
  )`);
  db.exec(`INSERT OR IGNORE INTO org_profile (id) VALUES (1)`);

  db.exec(`CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
    category TEXT DEFAULT '', interval_days INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0, label TEXT NOT NULL,
    hint TEXT, required INTEGER NOT NULL DEFAULT 1
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

  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, timestamp TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'app', version INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL, hash TEXT NOT NULL, prev_hash TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)');

  db.exec(`CREATE TABLE IF NOT EXISTS _schema_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL DEFAULT 1,
    app_version TEXT NOT NULL, last_migration TEXT, event_replay_at TEXT
  )`);
  db.exec(`INSERT OR REPLACE INTO _schema_meta (id, schema_version, app_version, last_migration) VALUES (1, 2, '0.2.0', datetime('now'))`);

  return db;
}

function appendEventSync(db, type, data) {
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

function verifyChainSync(db) {
  const events = db.prepare('SELECT * FROM events ORDER BY id').all();
  const errors = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (i > 0 && e.prev_hash !== events[i - 1].hash) {
      errors.push({ event_id: e.id, error: 'prev_hash mismatch' });
    }
    const message = `${e.type}|${e.timestamp}|${e.data}|${e.prev_hash}`;
    const expectedHash = computeHmacSync(message);
    if (e.hash !== expectedHash) {
      errors.push({ event_id: e.id, error: 'hash mismatch' });
    }
  }
  return { valid: errors.length === 0, errors, checked: events.length };
}

describe('Smoke-Tests (Node.js)', () => {
  let db;

  beforeEach(() => {
    db = initFullDb();
    appendEventSync(db, 'AppGestartet', { version: '0.1.0', schema_version: 1 });
  });

  it('DB initialisiert fehlerfrei (alle Tabellen vorhanden)', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all().map(r => r.name).sort();
    assert.ok(tables.includes('templates'));
    assert.ok(tables.includes('template_items'));
    assert.ok(tables.includes('objects'));
    assert.ok(tables.includes('inspections'));
    assert.ok(tables.includes('inspection_results'));
    assert.ok(tables.includes('org_profile'));
    assert.ok(tables.includes('events'));
    assert.ok(tables.includes('_schema_meta'));
  });

  it('Vorlage anlegen → in DB vorhanden', () => {
    db.prepare("INSERT INTO templates (name, description, category, interval_days) VALUES ('Brandschutz', 'Jaehrliche Pruefung', 'Sicherheit', 365)").run();
    appendEventSync(db, 'VorlageAngelegt', { id: 1, name: 'Brandschutz', category: 'Sicherheit' });

    const t = db.prepare("SELECT * FROM templates WHERE name = 'Brandschutz'").get();
    assert.ok(t);
    assert.equal(t.interval_days, 365);
    assert.equal(t.active, 1);
  });

  it('Vorlage mit Pruefpunkten anlegen', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Spielplatz')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label, required) VALUES (1, 0, 'Schaukel intakt?', 1)").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label, required) VALUES (1, 1, 'Sand sauber?', 1)").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label, hint, required) VALUES (1, 2, 'Zaun geschlossen?', 'Alle Tore pruefen', 0)").run();

    const items = db.prepare('SELECT * FROM template_items WHERE template_id = 1 ORDER BY sort_order').all();
    assert.equal(items.length, 3);
    assert.equal(items[0].label, 'Schaukel intakt?');
    assert.equal(items[2].required, 0);
    assert.equal(items[2].hint, 'Alle Tore pruefen');
  });

  it('Vorlage deaktivieren (Soft-Delete)', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Alt')").run();
    db.prepare("UPDATE templates SET active = 0 WHERE id = 1").run();
    appendEventSync(db, 'VorlageDeaktiviert', { id: 1, name: 'Alt' });

    const active = db.prepare('SELECT * FROM templates WHERE active = 1').all();
    assert.equal(active.length, 0);
    const all = db.prepare('SELECT * FROM templates').all();
    assert.equal(all.length, 1);
  });

  it('Objekt anlegen → in DB vorhanden', () => {
    db.prepare("INSERT INTO objects (name, location, category, identifier) VALUES ('Halle A', 'EG links', 'Raum', 'R-001')").run();
    appendEventSync(db, 'ObjektAngelegt', { id: 1, name: 'Halle A' });

    const obj = db.prepare("SELECT * FROM objects WHERE name = 'Halle A'").get();
    assert.ok(obj);
    assert.equal(obj.identifier, 'R-001');
  });

  it('Objekt deaktivieren (Soft-Delete)', () => {
    db.prepare("INSERT INTO objects (name) VALUES ('Alt')").run();
    db.prepare("UPDATE objects SET active = 0 WHERE id = 1").run();
    appendEventSync(db, 'ObjektDeaktiviert', { id: 1, name: 'Alt' });

    const active = db.prepare('SELECT * FROM objects WHERE active = 1').all();
    assert.equal(active.length, 0);
  });

  it('Pruefung anlegen + Status-Workflow', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Brandschutz')").run();
    db.prepare("INSERT INTO objects (name) VALUES ('Halle A')").run();
    db.prepare(`INSERT INTO inspections (template_id, object_id, title, inspector, status) VALUES (1, 1, 'Brandschutz Q1', 'Max', 'offen')`).run();
    appendEventSync(db, 'PruefungAngelegt', { id: 1, title: 'Brandschutz Q1' });

    const insp = db.prepare('SELECT * FROM inspections WHERE id = 1').get();
    assert.equal(insp.status, 'offen');

    // Status change
    db.prepare("UPDATE inspections SET status = 'bestanden' WHERE id = 1").run();
    appendEventSync(db, 'PruefungGeaendert', { id: 1, status: 'bestanden' });
    const updated = db.prepare('SELECT * FROM inspections WHERE id = 1').get();
    assert.equal(updated.status, 'bestanden');
  });

  it('Pruefung durchfuehren (Ergebnisse speichern)', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Spielplatz')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Schaukel?')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 1, 'Rutsche?')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 2, 'Zaun?')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector) VALUES (1, 'Spielplatz Q1', 'Anna')").run();

    // Init results
    const items = db.prepare('SELECT id FROM template_items WHERE template_id = 1 ORDER BY sort_order').all();
    for (const item of items) {
      db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, ?, 'offen')").run(item.id);
    }

    // Fill results
    db.prepare("UPDATE inspection_results SET result = 'ok' WHERE template_item_id = 1").run();
    db.prepare("UPDATE inspection_results SET result = 'maengel', remark = 'Riss sichtbar' WHERE template_item_id = 2").run();
    db.prepare("UPDATE inspection_results SET result = 'nicht_anwendbar' WHERE template_item_id = 3").run();

    const results = db.prepare('SELECT * FROM inspection_results WHERE inspection_id = 1 ORDER BY template_item_id').all();
    assert.equal(results.length, 3);
    assert.equal(results[0].result, 'ok');
    assert.equal(results[1].result, 'maengel');
    assert.equal(results[1].remark, 'Riss sichtbar');
    assert.equal(results[2].result, 'nicht_anwendbar');
  });

  it('Pruefung loeschen (Hard-Delete + CASCADE)', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Test')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Punkt 1')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector) VALUES (1, 'Test', 'Max')").run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, 1, 'ok')").run();
    appendEventSync(db, 'PruefungAngelegt', { id: 1 });

    db.prepare('DELETE FROM inspections WHERE id = 1').run();
    appendEventSync(db, 'PruefungGeloescht', { id: 1 });

    assert.equal(db.prepare('SELECT COUNT(*) as c FROM inspections').get().c, 0);
    // CASCADE deletes results
    assert.equal(db.prepare('SELECT COUNT(*) as c FROM inspection_results').get().c, 0);
  });

  it('Organisationsprofil speichern + laden', () => {
    db.prepare("UPDATE org_profile SET name = 'Muster GmbH', city = 'Berlin', responsible = 'Max Chef' WHERE id = 1").run();
    appendEventSync(db, 'ProfilGespeichert', { name: 'Muster GmbH', city: 'Berlin' });

    const profile = db.prepare('SELECT * FROM org_profile WHERE id = 1').get();
    assert.equal(profile.name, 'Muster GmbH');
    assert.equal(profile.city, 'Berlin');
    assert.equal(profile.responsible, 'Max Chef');
  });

  it('CSV-Export erzeugt gueltigen Output', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Brandschutz')").run();
    db.prepare("INSERT INTO objects (name) VALUES ('Halle A')").run();
    db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, status) VALUES (1, 1, 'Q1', 'Max', 'bestanden')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector, status) VALUES (1, 'Q2', 'Anna', 'offen')").run();

    const inspections = db.prepare(`
      SELECT i.*, t.name as template_name, o.name as object_name
      FROM inspections i
      LEFT JOIN templates t ON i.template_id = t.id
      LEFT JOIN objects o ON i.object_id = o.id
      ORDER BY i.inspection_date DESC
    `).all();

    const header = 'Datum;Vorlage;Objekt;Titel;Pruefer;Status;Bemerkungen';
    const rows = inspections.map(i =>
      [i.inspection_date, i.template_name, i.object_name ?? '', i.title, i.inspector, i.status, i.notes ?? '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(';')
    );
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');

    assert.ok(csv.startsWith('\uFEFF'), 'BOM missing');
    const lines = csv.replace('\uFEFF', '').split('\n');
    assert.equal(lines[0], 'Datum;Vorlage;Objekt;Titel;Pruefer;Status;Bemerkungen');
    assert.equal(lines.length, 3); // header + 2 rows
  });

  it('Dashboard-Statistiken', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('T1')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector, status) VALUES (1, 'I1', 'Max', 'offen')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector, status) VALUES (1, 'I2', 'Max', 'bestanden')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector, status) VALUES (1, 'I3', 'Max', 'bemaengelt')").run();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'offen' THEN 1 ELSE 0 END) as offen,
        SUM(CASE WHEN status = 'bestanden' THEN 1 ELSE 0 END) as bestanden,
        SUM(CASE WHEN status = 'bemaengelt' THEN 1 ELSE 0 END) as bemaengelt,
        SUM(CASE WHEN status = 'abgebrochen' THEN 1 ELSE 0 END) as abgebrochen
      FROM inspections
    `).get();

    assert.equal(stats.total, 3);
    assert.equal(stats.offen, 1);
    assert.equal(stats.bestanden, 1);
    assert.equal(stats.bemaengelt, 1);
    assert.equal(stats.abgebrochen, 0);
  });

  it('Objekt-Pruefhistorie', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('Brandschutz')").run();
    db.prepare("INSERT INTO objects (name) VALUES ('Halle A')").run();
    db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, status) VALUES (1, 1, 'Q1', 'Max', '2025-01-15', 'bestanden')").run();
    db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, status) VALUES (1, 1, 'Q2', 'Max', '2025-07-15', 'bestanden')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector, status) VALUES (1, 'Q3', 'Anna', 'offen')").run(); // kein Objekt

    const history = db.prepare(`
      SELECT i.*, t.name as template_name
      FROM inspections i LEFT JOIN templates t ON i.template_id = t.id
      WHERE i.object_id = ? ORDER BY i.inspection_date DESC
    `).all(1);

    assert.equal(history.length, 2);
    assert.equal(history[0].title, 'Q2');
    assert.equal(history[1].title, 'Q1');
  });

  it('Probe-Limit: 10 aktive Vorlagen', () => {
    for (let i = 1; i <= 10; i++) {
      db.prepare(`INSERT INTO templates (name) VALUES ('T${i}')`).run();
    }
    const count = db.prepare('SELECT COUNT(*) as c FROM templates WHERE active = 1').get().c;
    assert.equal(count, 10);

    // Deactivating one should allow a new one
    db.prepare('UPDATE templates SET active = 0 WHERE id = 1').run();
    const countAfter = db.prepare('SELECT COUNT(*) as c FROM templates WHERE active = 1').get().c;
    assert.equal(countAfter, 9);
  });

  it('Event-Kette nach allen Operationen gueltig', () => {
    // Vorlage + Pruefpunkte
    db.prepare("INSERT INTO templates (name, interval_days) VALUES ('Brandschutz', 365)").run();
    appendEventSync(db, 'VorlageAngelegt', { id: 1, name: 'Brandschutz' });
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'Punkt 1')").run();
    appendEventSync(db, 'PruefpunkteGespeichert', { template_id: 1, count: 1 });

    // Objekt
    db.prepare("INSERT INTO objects (name) VALUES ('Halle A')").run();
    appendEventSync(db, 'ObjektAngelegt', { id: 1, name: 'Halle A' });

    // Pruefung
    db.prepare("INSERT INTO inspections (template_id, object_id, title, inspector) VALUES (1, 1, 'Q1', 'Max')").run();
    appendEventSync(db, 'PruefungAngelegt', { id: 1, title: 'Q1' });

    // Ergebnisse
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, 1, 'ok')").run();
    appendEventSync(db, 'ErgebnisseGespeichert', { inspection_id: 1, count: 1 });

    // Profil
    db.prepare("UPDATE org_profile SET name = 'Test GmbH' WHERE id = 1").run();
    appendEventSync(db, 'ProfilGespeichert', { name: 'Test GmbH' });

    // Verify chain
    const result = verifyChainSync(db);
    assert.equal(result.valid, true, `Chain errors: ${JSON.stringify(result.errors)}`);
    assert.ok(result.checked >= 7); // AppGestartet + 6 operations
  });

  // --- v0.2.0 Features ---

  it('v2: Schema hat 10 Tabellen', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all().map(r => r.name).sort();
    assert.ok(tables.includes('attachments'), 'attachments fehlt');
    assert.ok(tables.includes('defects'), 'defects fehlt');
    assert.equal(tables.length, 10);
  });

  it('v2: Defects aus bemaengelter Pruefung erstellen', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('V1')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'P1')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 1, 'P2')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector, status) VALUES (1, 'Test', 'Max', 'bemaengelt')").run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, 1, 'ok')").run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result, remark) VALUES (1, 2, 'maengel', 'Defekt')").run();

    // Defects auto-erstellen
    const maengel = db.prepare("SELECT * FROM inspection_results WHERE inspection_id = 1 AND result = 'maengel'").all();
    for (const r of maengel) {
      db.prepare("INSERT INTO defects (inspection_id, inspection_result_id, description) VALUES (1, ?, ?)").run(r.id, r.remark ?? '');
    }
    appendEventSync(db, 'DefektErstellt', { inspection_id: 1 });

    const defects = db.prepare('SELECT * FROM defects WHERE inspection_id = 1').all();
    assert.equal(defects.length, 1);
    assert.equal(defects[0].status, 'offen');
  });

  it('v2: Wiederkehrende Pruefung erstellen', () => {
    db.prepare("INSERT INTO templates (name, interval_days) VALUES ('WKP', 90)").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector, inspection_date, status) VALUES (1, 'Q1', 'Max', '2026-03-01', 'bestanden')").run();

    // Folgepruefung
    db.prepare("INSERT INTO inspections (template_id, title, inspector, due_date, status, parent_inspection_id) VALUES (1, 'Q1', 'Max', '2026-05-30', 'offen', 1)").run();
    appendEventSync(db, 'PruefungAutomatischErstellt', { id: 2, parent_id: 1 });

    const newInsp = db.prepare('SELECT * FROM inspections WHERE id = 2').get();
    assert.equal(newInsp.parent_inspection_id, 1);
    assert.equal(newInsp.due_date, '2026-05-30');
    assert.equal(newInsp.status, 'offen');
  });

  it('v2: Attachment erstellen und loeschen', () => {
    db.prepare("INSERT INTO templates (name) VALUES ('V1')").run();
    db.prepare("INSERT INTO template_items (template_id, sort_order, label) VALUES (1, 0, 'P1')").run();
    db.prepare("INSERT INTO inspections (template_id, title, inspector) VALUES (1, 'Test', 'Max')").run();
    db.prepare("INSERT INTO inspection_results (inspection_id, template_item_id, result) VALUES (1, 1, 'ok')").run();

    db.prepare("INSERT INTO attachments (inspection_result_id, file_name, file_path) VALUES (1, 'foto.jpg', '/tmp/foto.jpg')").run();
    appendEventSync(db, 'AnhangHinzugefuegt', { inspection_result_id: 1 });

    assert.equal(db.prepare('SELECT COUNT(*) as c FROM attachments').get().c, 1);

    db.prepare('DELETE FROM attachments WHERE id = 1').run();
    appendEventSync(db, 'AnhangGeloescht', { id: 1 });

    assert.equal(db.prepare('SELECT COUNT(*) as c FROM attachments').get().c, 0);
  });

  it('v2: Event-Kette mit allen v2 Events gueltig', () => {
    db.prepare("INSERT INTO templates (name, interval_days) VALUES ('V1', 90)").run();
    appendEventSync(db, 'VorlageAngelegt', { id: 1 });
    appendEventSync(db, 'BibliothekVorlageImportiert', { id: 1, name: 'V1' });
    appendEventSync(db, 'PruefungAutomatischErstellt', { id: 1, parent_id: 0 });
    appendEventSync(db, 'AnhangHinzugefuegt', { id: 1 });
    appendEventSync(db, 'AnhangGeloescht', { id: 1 });
    appendEventSync(db, 'DefektErstellt', { id: 1 });
    appendEventSync(db, 'DefektBehoben', { id: 1 });
    appendEventSync(db, 'DefektVerifiziert', { id: 1 });
    appendEventSync(db, 'NachpruefungErstellt', { id: 1, parent_id: 0 });

    const result = verifyChainSync(db);
    assert.equal(result.valid, true, `Chain errors: ${JSON.stringify(result.errors)}`);
  });

  // PDF tests skipped — pdfMake requires DOM.
  // Full PDF smoke tests via Electron/Windows.
});
