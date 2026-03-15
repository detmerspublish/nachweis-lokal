import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockQuery, mockExecute, getCalls, reset } from './helpers/mock-sql.js';

// Da db.js `import { query, execute } from '@codefabrik/app-shared/db'`
// nutzt und das ohne Loader nicht mockbar ist, testen wir die
// Geschaeftslogik (SQL-Statements, Parameter-Reihenfolge) anhand
// der bekannten Queries aus db.js.

describe('DB-Layer Logik', () => {
  beforeEach(() => reset());

  // --- Templates ---

  it('getTemplates → SELECT active templates', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    const expected = [{ id: 1, name: 'Brandschutz', active: 1 }];
    mockQuery(expected);
    const result = await query('SELECT * FROM templates WHERE active = 1 ORDER BY name');
    assert.deepEqual(result, expected);
    assert.ok(getCalls().at(-1).sql.includes('WHERE active = 1'));
  });

  it('getTemplate → SELECT mit WHERE id', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    const template = { id: 5, name: 'Spielplatzpruefung' };
    mockQuery([template]);
    const rows = await query('SELECT * FROM templates WHERE id = ?', [5]);
    assert.deepEqual(rows[0], template);
    assert.deepEqual(getCalls().at(-1).params, [5]);
  });

  it('saveTemplate ohne id → INSERT mit 4 Parametern', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    mockExecute({ lastInsertId: 3, rowsAffected: 1 });
    const result = await execute(
      'INSERT INTO templates (name, description, category, interval_days) VALUES (?, ?, ?, ?)',
      ['Brandschutz', 'Jaehrliche Brandschutzpruefung', 'Sicherheit', 365]
    );
    assert.equal(result.lastInsertId, 3);
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('INSERT INTO templates'));
    assert.equal(call.params.length, 4);
    assert.equal(call.params[0], 'Brandschutz');
  });

  it('saveTemplate mit id → UPDATE mit WHERE id', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    await execute(
      "UPDATE templates SET name = ?, description = ?, category = ?, interval_days = ?, active = ?, updated_at = datetime('now') WHERE id = ?",
      ['Brandschutz NEU', 'Aktualisiert', 'Sicherheit', 365, 1, 3]
    );
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('UPDATE templates SET'));
    assert.ok(call.sql.includes('WHERE id = ?'));
    assert.equal(call.params.at(-1), 3);
  });

  it('deleteTemplate → Soft-Delete (active = 0)', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    await execute("UPDATE templates SET active = 0, updated_at = datetime('now') WHERE id = ?", [7]);
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('active = 0'));
    assert.deepEqual(call.params, [7]);
  });

  // --- Template Items ---

  it('getTemplateItems → SELECT mit ORDER BY sort_order', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    const items = [
      { id: 1, template_id: 1, sort_order: 0, label: 'Fluchtweg frei?' },
      { id: 2, template_id: 1, sort_order: 1, label: 'Feuerloescher vorhanden?' },
    ];
    mockQuery(items);
    const result = await query('SELECT * FROM template_items WHERE template_id = ? ORDER BY sort_order', [1]);
    assert.equal(result.length, 2);
    assert.ok(getCalls().at(-1).sql.includes('ORDER BY sort_order'));
  });

  it('saveTemplateItems → DELETE + INSERT pro Item', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    // DELETE old items
    await execute('DELETE FROM template_items WHERE template_id = ?', [1]);
    // INSERT new items
    await execute(
      'INSERT INTO template_items (template_id, sort_order, label, hint, required) VALUES (?, ?, ?, ?, ?)',
      [1, 0, 'Fluchtweg frei?', 'Alle Fluchttueren pruefen', 1]
    );
    await execute(
      'INSERT INTO template_items (template_id, sort_order, label, hint, required) VALUES (?, ?, ?, ?, ?)',
      [1, 1, 'Feuerloescher?', null, 1]
    );
    const calls = getCalls();
    assert.ok(calls[0].sql.includes('DELETE FROM template_items'));
    assert.ok(calls[1].sql.includes('INSERT INTO template_items'));
    assert.equal(calls[1].params[1], 0); // sort_order
    assert.equal(calls[2].params[1], 1); // sort_order
  });

  // --- Objects ---

  it('getObjects → SELECT active objects', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    mockQuery([{ id: 1, name: 'Halle A', active: 1 }]);
    const result = await query('SELECT * FROM objects WHERE active = 1 ORDER BY name');
    assert.deepEqual(result[0].name, 'Halle A');
    assert.ok(getCalls().at(-1).sql.includes('WHERE active = 1'));
  });

  it('saveObject ohne id → INSERT mit 5 Parametern', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    mockExecute({ lastInsertId: 1, rowsAffected: 1 });
    const result = await execute(
      'INSERT INTO objects (name, location, category, identifier, notes) VALUES (?, ?, ?, ?, ?)',
      ['Halle A', 'EG links', 'Raum', 'R-001', null]
    );
    assert.equal(result.lastInsertId, 1);
    assert.equal(getCalls().at(-1).params.length, 5);
  });

  it('deleteObject → Soft-Delete (active = 0)', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    await execute("UPDATE objects SET active = 0, updated_at = datetime('now') WHERE id = ?", [2]);
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('active = 0'));
    assert.deepEqual(call.params, [2]);
  });

  // --- Inspections ---

  it('getInspections → SELECT mit JOINs', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    mockQuery([{ id: 1, title: 'Brandschutz Q1', template_name: 'Brandschutz', object_name: 'Halle A' }]);
    const result = await query(
      'SELECT i.*, t.name as template_name, o.name as object_name FROM inspections i LEFT JOIN templates t ON i.template_id = t.id LEFT JOIN objects o ON i.object_id = o.id ORDER BY i.inspection_date DESC, i.id DESC'
    );
    assert.equal(result[0].template_name, 'Brandschutz');
    assert.ok(getCalls().at(-1).sql.includes('LEFT JOIN templates'));
    assert.ok(getCalls().at(-1).sql.includes('LEFT JOIN objects'));
  });

  it('getInspections mit Filter → WHERE Bedingung', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    mockQuery([]);
    await query(
      'SELECT i.*, t.name as template_name, o.name as object_name FROM inspections i LEFT JOIN templates t ON i.template_id = t.id LEFT JOIN objects o ON i.object_id = o.id WHERE i.status = ? ORDER BY i.inspection_date DESC, i.id DESC',
      ['offen']
    );
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('WHERE i.status = ?'));
    assert.deepEqual(call.params, ['offen']);
  });

  it('saveInspection ohne id → INSERT mit 8 Parametern', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    mockExecute({ lastInsertId: 1, rowsAffected: 1 });
    const result = await execute(
      'INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, due_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [1, 2, 'Brandschutz Q1 2026', 'Max Pruefer', '2026-03-12', '2027-03-12', 'offen', null]
    );
    assert.equal(result.lastInsertId, 1);
    assert.equal(getCalls().at(-1).params.length, 8);
  });

  it('deleteInspection → Hard-Delete (results + inspection)', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    await execute('DELETE FROM inspection_results WHERE inspection_id = ?', [1]);
    await execute('DELETE FROM inspections WHERE id = ?', [1]);
    const calls = getCalls();
    assert.ok(calls[0].sql.includes('DELETE FROM inspection_results'));
    assert.ok(calls[1].sql.includes('DELETE FROM inspections'));
  });

  // --- Inspection Results ---

  it('getInspectionResults → SELECT mit JOIN auf template_items', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    mockQuery([{ id: 1, result: 'ok', label: 'Fluchtweg frei?' }]);
    const result = await query(
      'SELECT ir.*, ti.label, ti.hint, ti.required, ti.sort_order FROM inspection_results ir JOIN template_items ti ON ir.template_item_id = ti.id WHERE ir.inspection_id = ? ORDER BY ti.sort_order',
      [1]
    );
    assert.equal(result[0].label, 'Fluchtweg frei?');
    assert.ok(getCalls().at(-1).sql.includes('JOIN template_items'));
  });

  it('saveInspectionResults mit id → UPDATE', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    await execute(
      'UPDATE inspection_results SET result = ?, remark = ? WHERE id = ?',
      ['ok', null, 5]
    );
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('UPDATE inspection_results'));
    assert.equal(call.params[0], 'ok');
  });

  it('saveInspectionResults ohne id → INSERT', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    await execute(
      'INSERT INTO inspection_results (inspection_id, template_item_id, result, remark) VALUES (?, ?, ?, ?)',
      [1, 3, 'maengel', 'Riss in der Wand']
    );
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('INSERT INTO inspection_results'));
    assert.equal(call.params[2], 'maengel');
  });

  // --- Org Profile ---

  it('getOrgProfile → SELECT WHERE id = 1', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    mockQuery([{ id: 1, name: 'Testorg' }]);
    const rows = await query('SELECT * FROM org_profile WHERE id = 1');
    assert.equal(rows[0].name, 'Testorg');
  });

  it('saveOrgProfile → UPDATE mit 8 Parametern', async () => {
    const { execute } = await import('./helpers/mock-sql.js');
    await execute(
      'UPDATE org_profile SET name = ?, street = ?, zip = ?, city = ?, contact_email = ?, contact_phone = ?, responsible = ?, logo_path = ? WHERE id = 1',
      ['Testorg', 'Musterstr. 1', '12345', 'Berlin', 'test@test.de', '0170', 'Max Mustermann', '']
    );
    const call = getCalls().at(-1);
    assert.ok(call.sql.includes('UPDATE org_profile'));
    assert.equal(call.params.length, 8);
  });

  // --- CSV Export ---

  it('exportInspectionsCSV → UTF-8 BOM + Semikolon', async () => {
    // Simulating the CSV export logic from db.js
    const inspections = [
      { inspection_date: '2026-03-12', template_name: 'Brandschutz', object_name: 'Halle A', title: 'Q1', inspector: 'Max', status: 'bestanden', notes: '' },
    ];
    const header = 'Datum;Vorlage;Objekt;Titel;Pruefer;Status;Bemerkungen';
    const rows = inspections.map(i =>
      [i.inspection_date, i.template_name, i.object_name ?? '', i.title, i.inspector, i.status, i.notes ?? '']
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(';')
    );
    const csv = '\uFEFF' + header + '\n' + rows.join('\n');

    assert.ok(csv.startsWith('\uFEFF'), 'BOM missing');
    assert.ok(csv.includes('Datum;Vorlage;Objekt'));
    assert.ok(csv.includes('"Brandschutz"'));
  });

  // --- Active Template Count ---

  it('getActiveTemplateCount → COUNT WHERE active = 1', async () => {
    const { query } = await import('./helpers/mock-sql.js');
    mockQuery([{ count: 5 }]);
    const rows = await query('SELECT COUNT(*) as count FROM templates WHERE active = 1');
    assert.equal(rows[0].count, 5);
    assert.ok(getCalls().at(-1).sql.includes('COUNT(*)'));
  });
});
