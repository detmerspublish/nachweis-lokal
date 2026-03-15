import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_SECRET = 'codefabrik-vereins-v1';

function computeHmacSync(message) {
  return createHmac('sha256', APP_SECRET).update(message).digest('hex');
}

// Create empty v1 DB with tables but no data
function createEmptyDb() {
  const db = new Database(':memory:');
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
  return { type, timestamp, data: dataJson, hash, prev_hash: prevHash };
}

// Replay a single event into the database
function replayEvent(db, event) {
  const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

  switch (event.type) {
    case 'AppGestartet':
      db.exec(`INSERT OR REPLACE INTO _schema_meta (id, schema_version, app_version) VALUES (1, ${data.schema_version}, '${data.version}')`);
      break;

    case 'VorlageAngelegt':
      db.prepare(`INSERT INTO templates (id, name, description, category, interval_days) VALUES (?, ?, ?, ?, ?)`)
        .run(data.id, data.name, data.description ?? null, data.category ?? '', data.interval_days ?? null);
      break;

    case 'VorlageGeaendert':
      db.prepare(`UPDATE templates SET name = ?, description = ?, category = ?, interval_days = ?, active = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(data.name, data.description ?? null, data.category ?? '', data.interval_days ?? null, data.active ?? 1, data.id);
      break;

    case 'VorlageDeaktiviert':
      db.prepare("UPDATE templates SET active = 0, updated_at = datetime('now') WHERE id = ?").run(data.id);
      break;

    case 'PruefpunkteGespeichert':
      // Items are not individually tracked in events — skip
      break;

    case 'ObjektAngelegt':
      db.prepare(`INSERT INTO objects (id, name, location, category, identifier, notes) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(data.id, data.name, data.location ?? '', data.category ?? '', data.identifier ?? '', data.notes ?? null);
      break;

    case 'ObjektGeaendert':
      db.prepare(`UPDATE objects SET name = ?, location = ?, category = ?, identifier = ?, notes = ?, active = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(data.name, data.location ?? '', data.category ?? '', data.identifier ?? '', data.notes ?? null, data.active ?? 1, data.id);
      break;

    case 'ObjektDeaktiviert':
      db.prepare("UPDATE objects SET active = 0, updated_at = datetime('now') WHERE id = ?").run(data.id);
      break;

    case 'PruefungAngelegt':
      db.prepare(`INSERT INTO inspections (id, template_id, object_id, title, inspector, inspection_date, due_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(data.id, data.template_id, data.object_id ?? null, data.title, data.inspector, data.inspection_date ?? new Date().toISOString().split('T')[0], data.due_date ?? null, data.status ?? 'offen', data.notes ?? null);
      break;

    case 'PruefungGeaendert':
      db.prepare(`UPDATE inspections SET template_id = ?, object_id = ?, title = ?, inspector = ?, inspection_date = ?, due_date = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(data.template_id, data.object_id ?? null, data.title, data.inspector, data.inspection_date, data.due_date ?? null, data.status, data.notes ?? null, data.id);
      break;

    case 'PruefungGeloescht':
      db.prepare('DELETE FROM inspection_results WHERE inspection_id = ?').run(data.id);
      db.prepare('DELETE FROM inspections WHERE id = ?').run(data.id);
      break;

    case 'ProfilGespeichert':
      db.prepare(`UPDATE org_profile SET name = ?, street = ?, zip = ?, city = ?, contact_email = ?, contact_phone = ?, responsible = ?, logo_path = ? WHERE id = 1`)
        .run(data.name ?? '', data.street ?? '', data.zip ?? '', data.city ?? '', data.contact_email ?? '', data.contact_phone ?? '', data.responsible ?? '', data.logo_path ?? '');
      break;

    case 'ErgebnisseGespeichert':
      // Results are not individually tracked in events — skip
      break;

    case 'BibliothekVorlageImportiert':
      // Template already created via VorlageAngelegt or inline
      break;

    case 'PruefungAutomatischErstellt':
      if (!replayedInspections?.has(data.id)) {
        db.prepare(`INSERT OR IGNORE INTO inspections (id, template_id, title, inspector, due_date, status, parent_inspection_id) VALUES (?, ?, 'Auto', 'Auto', ?, 'offen', ?)`)
          .run(data.id, data.template_id, data.due_date ?? null, data.parent_id ?? null);
      }
      break;

    case 'AnhangHinzugefuegt':
    case 'AnhangGeloescht':
      // Attachments are file-system dependent — skip in replay
      break;

    case 'DefektErstellt':
    case 'DefektBehoben':
    case 'DefektVerifiziert':
    case 'DefektStatusGeaendert':
      // Defect state changes — skip in replay (derived from inspections)
      break;

    case 'NachpruefungErstellt':
      // Similar to PruefungAutomatischErstellt
      break;

    default:
      break;
  }
}

describe('Replay-Tests v0.1', () => {
  let sourceDb;
  let events;

  beforeEach(() => {
    // Build a source DB with known state, then extract events
    sourceDb = createEmptyDb();
    appendEventSync(sourceDb, 'AppGestartet', { version: '0.1.0', schema_version: 1 });

    // Create templates
    sourceDb.prepare("INSERT INTO templates (name, description, category, interval_days) VALUES ('Brandschutz', 'Jaehrlich', 'Sicherheit', 365)").run();
    appendEventSync(sourceDb, 'VorlageAngelegt', { id: 1, name: 'Brandschutz', description: 'Jaehrlich', category: 'Sicherheit', interval_days: 365 });

    sourceDb.prepare("INSERT INTO templates (name, category) VALUES ('Spielplatz', 'Kontrolle')").run();
    appendEventSync(sourceDb, 'VorlageAngelegt', { id: 2, name: 'Spielplatz', category: 'Kontrolle' });

    // Create object
    sourceDb.prepare("INSERT INTO objects (name, location, category, identifier) VALUES ('Halle A', 'EG', 'Raum', 'R-001')").run();
    appendEventSync(sourceDb, 'ObjektAngelegt', { id: 1, name: 'Halle A', location: 'EG', category: 'Raum', identifier: 'R-001' });

    // Create inspection
    sourceDb.prepare("INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, status) VALUES (1, 1, 'Brandschutz Q1', 'Max', '2026-03-12', 'bestanden')").run();
    appendEventSync(sourceDb, 'PruefungAngelegt', { id: 1, template_id: 1, object_id: 1, title: 'Brandschutz Q1', inspector: 'Max', inspection_date: '2026-03-12', status: 'bestanden' });

    // Update profile
    sourceDb.prepare("UPDATE org_profile SET name = 'Muster GmbH', city = 'Berlin' WHERE id = 1").run();
    appendEventSync(sourceDb, 'ProfilGespeichert', { name: 'Muster GmbH', city: 'Berlin' });

    // Collect events
    events = sourceDb.prepare('SELECT * FROM events ORDER BY id').all();
  });

  it('Hash-Kette der Events ist gueltig', () => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const message = `${e.type}|${e.timestamp}|${e.data}|${e.prev_hash}`;
      const expectedHash = computeHmacSync(message);
      assert.equal(e.hash, expectedHash, `Event ${e.id} hash mismatch`);
      if (i > 0) {
        assert.equal(e.prev_hash, events[i - 1].hash, `Event ${e.id} prev_hash mismatch`);
      }
    }
  });

  it('Replay erzeugt identische Vorlagen', () => {
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const sourceTemplates = sourceDb.prepare('SELECT id, name, description, category, interval_days, active FROM templates ORDER BY id').all();
    const replayTemplates = replayDb.prepare('SELECT id, name, description, category, interval_days, active FROM templates ORDER BY id').all();

    assert.equal(replayTemplates.length, sourceTemplates.length, 'Template count mismatch');
    for (let i = 0; i < sourceTemplates.length; i++) {
      assert.equal(replayTemplates[i].name, sourceTemplates[i].name);
      assert.equal(replayTemplates[i].category, sourceTemplates[i].category);
      assert.equal(replayTemplates[i].interval_days, sourceTemplates[i].interval_days);
    }

    replayDb.close();
  });

  it('Replay erzeugt identische Objekte', () => {
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const sourceObjects = sourceDb.prepare('SELECT id, name, location, category, identifier FROM objects ORDER BY id').all();
    const replayObjects = replayDb.prepare('SELECT id, name, location, category, identifier FROM objects ORDER BY id').all();

    assert.equal(replayObjects.length, sourceObjects.length, 'Object count mismatch');
    assert.equal(replayObjects[0].name, sourceObjects[0].name);
    assert.equal(replayObjects[0].location, sourceObjects[0].location);
    assert.equal(replayObjects[0].identifier, sourceObjects[0].identifier);

    replayDb.close();
  });

  it('Replay erzeugt identische Pruefungen', () => {
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const sourceInsp = sourceDb.prepare('SELECT id, template_id, object_id, title, inspector, status FROM inspections ORDER BY id').all();
    const replayInsp = replayDb.prepare('SELECT id, template_id, object_id, title, inspector, status FROM inspections ORDER BY id').all();

    assert.equal(replayInsp.length, sourceInsp.length, 'Inspection count mismatch');
    assert.equal(replayInsp[0].title, sourceInsp[0].title);
    assert.equal(replayInsp[0].status, sourceInsp[0].status);
    assert.equal(replayInsp[0].object_id, sourceInsp[0].object_id);

    replayDb.close();
  });

  it('Replay erzeugt identisches Organisationsprofil', () => {
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const sourceProfile = sourceDb.prepare('SELECT * FROM org_profile WHERE id = 1').get();
    const replayProfile = replayDb.prepare('SELECT * FROM org_profile WHERE id = 1').get();

    assert.equal(replayProfile.name, sourceProfile.name);
    assert.equal(replayProfile.city, sourceProfile.city);

    replayDb.close();
  });

  it('Replay mit Deaktivierung + Loeschung', () => {
    // Add deactivation and deletion events
    sourceDb.prepare("UPDATE templates SET active = 0 WHERE id = 2").run();
    appendEventSync(sourceDb, 'VorlageDeaktiviert', { id: 2, name: 'Spielplatz' });

    sourceDb.prepare('DELETE FROM inspections WHERE id = 1').run();
    appendEventSync(sourceDb, 'PruefungGeloescht', { id: 1, title: 'Brandschutz Q1' });

    const allEvents = sourceDb.prepare('SELECT * FROM events ORDER BY id').all();
    const replayDb = createEmptyDb();
    for (const event of allEvents) {
      replayEvent(replayDb, event);
    }

    // Template 2 should be deactivated
    const t2 = replayDb.prepare('SELECT * FROM templates WHERE id = 2').get();
    assert.equal(t2.active, 0);

    // Inspection 1 should be deleted
    const inspCount = replayDb.prepare('SELECT COUNT(*) as c FROM inspections').get().c;
    assert.equal(inspCount, 0);

    replayDb.close();
  });
});

// --- Fixture-basierte Replay-Tests ---

function loadFixtureEvents() {
  const eventsPath = join(__dirname, 'fixtures', 'events_v0.1.0.json');
  return JSON.parse(readFileSync(eventsPath, 'utf-8'));
}

describe('Replay-Tests v0.1 (Fixture)', () => {
  it('Events JSON kann geladen werden', () => {
    const events = loadFixtureEvents();
    assert.ok(Array.isArray(events));
    assert.ok(events.length > 0);
  });

  it('Hash-Kette der Fixture-Events ist gueltig', () => {
    const events = loadFixtureEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const message = `${e.type}|${e.timestamp}|${e.data}|${e.prev_hash}`;
      const expectedHash = computeHmacSync(message);
      assert.equal(e.hash, expectedHash, `Event ${e.id} hash mismatch`);
      if (i > 0) {
        assert.equal(e.prev_hash, events[i - 1].hash, `Event ${e.id} prev_hash mismatch`);
      }
    }
  });

  it('Replay erzeugt identische Vorlagen wie Fixture-DB', () => {
    const events = loadFixtureEvents();
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const fixtureDb = new Database(join(__dirname, 'fixtures', 'db_v0.1.0.sqlite'), { readonly: true });

    const replayTemplates = replayDb.prepare('SELECT id, name, description, category, interval_days, active FROM templates ORDER BY id').all();
    const fixtureTemplates = fixtureDb.prepare('SELECT id, name, description, category, interval_days, active FROM templates ORDER BY id').all();

    assert.equal(replayTemplates.length, fixtureTemplates.length, 'Template count mismatch');
    for (let i = 0; i < fixtureTemplates.length; i++) {
      assert.equal(replayTemplates[i].name, fixtureTemplates[i].name, `Template ${fixtureTemplates[i].id} name mismatch`);
      assert.equal(replayTemplates[i].category, fixtureTemplates[i].category);
      assert.equal(replayTemplates[i].interval_days, fixtureTemplates[i].interval_days);
    }

    fixtureDb.close();
    replayDb.close();
  });

  it('Replay erzeugt identische Objekte wie Fixture-DB', () => {
    const events = loadFixtureEvents();
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const fixtureDb = new Database(join(__dirname, 'fixtures', 'db_v0.1.0.sqlite'), { readonly: true });

    const replayObjects = replayDb.prepare('SELECT id, name, location, category, identifier FROM objects ORDER BY id').all();
    const fixtureObjects = fixtureDb.prepare('SELECT id, name, location, category, identifier FROM objects ORDER BY id').all();

    assert.equal(replayObjects.length, fixtureObjects.length, 'Object count mismatch');
    for (let i = 0; i < fixtureObjects.length; i++) {
      assert.equal(replayObjects[i].name, fixtureObjects[i].name, `Object ${fixtureObjects[i].id} name mismatch`);
      assert.equal(replayObjects[i].identifier, fixtureObjects[i].identifier);
    }

    fixtureDb.close();
    replayDb.close();
  });

  it('Replay erzeugt identisches Organisationsprofil wie Fixture-DB', () => {
    const events = loadFixtureEvents();
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const fixtureDb = new Database(join(__dirname, 'fixtures', 'db_v0.1.0.sqlite'), { readonly: true });

    const replayProfile = replayDb.prepare('SELECT * FROM org_profile WHERE id = 1').get();
    const fixtureProfile = fixtureDb.prepare('SELECT * FROM org_profile WHERE id = 1').get();

    assert.equal(replayProfile.name, fixtureProfile.name);
    assert.equal(replayProfile.city, fixtureProfile.city);
    assert.equal(replayProfile.responsible, fixtureProfile.responsible);

    fixtureDb.close();
    replayDb.close();
  });

  it('Replay erzeugt identische Pruefungen wie Fixture-DB', () => {
    const events = loadFixtureEvents();
    const replayDb = createEmptyDb();
    for (const event of events) {
      replayEvent(replayDb, event);
    }

    const fixtureDb = new Database(join(__dirname, 'fixtures', 'db_v0.1.0.sqlite'), { readonly: true });

    const replayInsp = replayDb.prepare('SELECT id, template_id, object_id, title, inspector, status FROM inspections ORDER BY id').all();
    const fixtureInsp = fixtureDb.prepare('SELECT id, template_id, object_id, title, inspector, status FROM inspections ORDER BY id').all();

    assert.equal(replayInsp.length, fixtureInsp.length, 'Inspection count mismatch');
    for (let i = 0; i < fixtureInsp.length; i++) {
      assert.equal(replayInsp[i].title, fixtureInsp[i].title, `Inspection ${fixtureInsp[i].id} title mismatch`);
      assert.equal(replayInsp[i].status, fixtureInsp[i].status);
    }

    fixtureDb.close();
    replayDb.close();
  });
});
