import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadLibrary() {
  const libPath = join(__dirname, '..', 'src', 'assets', 'template-library.json');
  return JSON.parse(readFileSync(libPath, 'utf-8'));
}

function initSchemaV2(db) {
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
}

describe('Vorlagen-Bibliothek', () => {
  it('template-library.json ist valides JSON mit 5 Vorlagen', () => {
    const lib = loadLibrary();
    assert.ok(Array.isArray(lib));
    assert.equal(lib.length, 5);
  });

  it('jede Vorlage hat Pflichtfelder (name, category, items)', () => {
    const lib = loadLibrary();
    for (const t of lib) {
      assert.ok(t.name, `Vorlage ${t.id} hat keinen Namen`);
      assert.ok(t.category, `Vorlage ${t.id} hat keine Kategorie`);
      assert.ok(Array.isArray(t.items) && t.items.length > 0, `Vorlage ${t.id} hat keine Pruefpunkte`);
      assert.ok(t.interval_days > 0, `Vorlage ${t.id} hat kein Intervall`);
    }
  });

  it('alle Pruefpunkte haben label und required', () => {
    const lib = loadLibrary();
    for (const t of lib) {
      for (let i = 0; i < t.items.length; i++) {
        const item = t.items[i];
        assert.ok(item.label, `Vorlage ${t.id} Punkt ${i} hat kein Label`);
        assert.ok(typeof item.required === 'boolean', `Vorlage ${t.id} Punkt ${i}: required ist kein Boolean`);
      }
    }
  });

  it('importLibraryTemplate erstellt Vorlage mit Items in DB', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchemaV2(db);

    const lib = loadLibrary();
    const template = lib[0]; // Brandschutz

    // Simulate importLibraryTemplate
    const result = db.prepare(`
      INSERT INTO templates (name, description, category, interval_days)
      VALUES (?, ?, ?, ?)
    `).run(template.name, template.description, template.category, template.interval_days);

    const templateId = result.lastInsertRowid;

    for (let i = 0; i < template.items.length; i++) {
      const item = template.items[i];
      db.prepare(`
        INSERT INTO template_items (template_id, sort_order, label, hint, required)
        VALUES (?, ?, ?, ?, ?)
      `).run(templateId, i, item.label, item.hint ?? null, item.required ? 1 : 0);
    }

    // Verify
    const saved = db.prepare('SELECT * FROM templates WHERE id = ?').get(templateId);
    assert.equal(saved.name, 'Brandschutz-Begehung');
    assert.equal(saved.interval_days, 365);

    const items = db.prepare('SELECT * FROM template_items WHERE template_id = ? ORDER BY sort_order').all(templateId);
    assert.equal(items.length, template.items.length);
    assert.equal(items[0].label, template.items[0].label);

    db.close();
  });
});
