import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { computeHmac } from '@codefabrik/shared/crypto';

let db;

function createEventsTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT 'app',
      version INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL,
      hash TEXT NOT NULL,
      prev_hash TEXT NOT NULL
    )
  `);
}

// Insert an event using the same logic as appendEvent() in db.js
async function insertEvent(database, type, data) {
  const prev = database.prepare('SELECT id, hash FROM events ORDER BY id DESC LIMIT 1').get();
  const prevHash = prev?.hash ?? '0';
  const timestamp = new Date().toISOString();
  const dataJson = JSON.stringify(data);
  const message = `${type}|${timestamp}|${dataJson}|${prevHash}`;
  const hash = await computeHmac(message);

  database.prepare(
    'INSERT INTO events (type, timestamp, actor, version, data, hash, prev_hash) VALUES (?, ?, ?, 1, ?, ?, ?)'
  ).run(type, timestamp, 'app', dataJson, hash, prevHash);
}

// Reimplementation of verifyChain using better-sqlite3 (sync reads, async HMAC)
async function verifyChain(database, limit = 100) {
  const events = database.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);
  events.reverse();
  const errors = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const expectedPrev = i === 0 ? e.prev_hash : events[i - 1].hash;
    if (i > 0 && e.prev_hash !== expectedPrev) {
      errors.push({ event_id: e.id, error: 'prev_hash mismatch' });
    }
    const message = `${e.type}|${e.timestamp}|${e.data}|${e.prev_hash}`;
    const expectedHash = await computeHmac(message);
    if (e.hash !== expectedHash) {
      errors.push({ event_id: e.id, error: 'hash mismatch' });
    }
  }
  return { valid: errors.length === 0, errors, checked: events.length };
}

describe('verifyChain (Integritaet)', () => {
  beforeEach(() => {
    db = new Database(':memory:');
    createEventsTable(db);
  });

  it('erkennt unveraenderte Kette als gueltig', async () => {
    await insertEvent(db, 'VorlageAngelegt', { id: 1, name: 'Brandschutz' });
    await insertEvent(db, 'PruefungAngelegt', { id: 1, title: 'Q1' });
    await insertEvent(db, 'ErgebnisseGespeichert', { inspection_id: 1, count: 3 });

    const result = await verifyChain(db);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.checked, 3);
  });

  it('erkennt geaendertes data-Feld', async () => {
    await insertEvent(db, 'VorlageAngelegt', { id: 1, name: 'Brandschutz' });
    await insertEvent(db, 'PruefungAngelegt', { id: 1, title: 'Q1' });

    // Tamper with data of event 2
    db.prepare("UPDATE events SET data = '{\"id\":1,\"title\":\"MANIPULIERT\"}' WHERE id = 2").run();

    const result = await verifyChain(db);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.event_id === 2 && e.error === 'hash mismatch'));
  });

  it('erkennt geloeschtes Event (Luecke in prev_hash)', async () => {
    await insertEvent(db, 'Event1', { a: 1 });
    await insertEvent(db, 'Event2', { b: 2 });
    await insertEvent(db, 'Event3', { c: 3 });

    // Delete middle event
    db.prepare('DELETE FROM events WHERE id = 2').run();

    const result = await verifyChain(db);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.error === 'prev_hash mismatch'));
  });

  it('erkennt geaenderten hash-Wert', async () => {
    await insertEvent(db, 'VorlageAngelegt', { id: 1, name: 'Test' });
    await insertEvent(db, 'ObjektAngelegt', { id: 1, name: 'Halle A' });

    // Tamper with hash of event 1
    db.prepare("UPDATE events SET hash = 'deadbeef' WHERE id = 1").run();

    const result = await verifyChain(db);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 1);
    assert.ok(result.errors.some(e => e.event_id === 1 && e.error === 'hash mismatch'));
  });

  it('leere Kette ist gueltig', async () => {
    const result = await verifyChain(db);
    assert.equal(result.valid, true);
    assert.equal(result.checked, 0);
  });
});
