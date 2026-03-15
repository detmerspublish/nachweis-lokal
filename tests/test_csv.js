import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BOM = '\uFEFF';

// Reimplementation of exportInspectionsCSV logic for testing
function generateInspectionCsv(inspections) {
  const header = 'Datum;Vorlage;Objekt;Titel;Pruefer;Status;Bemerkungen';
  const rows = inspections.map(i =>
    [i.inspection_date, i.template_name, i.object_name ?? '', i.title, i.inspector, i.status, i.notes ?? '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(';')
  );
  return BOM + header + '\n' + rows.join('\n');
}

describe('CSV-Export Pruefungen', () => {
  it('leere Liste ergibt nur Header-Zeile', () => {
    const csv = generateInspectionCsv([]);
    const lines = csv.replace(BOM, '').split('\n').filter(l => l.length > 0);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'Datum;Vorlage;Objekt;Titel;Pruefer;Status;Bemerkungen');
  });

  it('UTF-8 BOM ist vorhanden', () => {
    const csv = generateInspectionCsv([]);
    assert.ok(csv.startsWith(BOM), 'CSV muss mit UTF-8 BOM beginnen');
  });

  it('einzelne Pruefung ergibt korrekte Spalten', () => {
    const csv = generateInspectionCsv([{
      inspection_date: '2026-03-12', template_name: 'Brandschutz', object_name: 'Halle A',
      title: 'Q1 2026', inspector: 'Max Pruefer', status: 'bestanden', notes: '',
    }]);
    const lines = csv.replace(BOM, '').split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes('"Brandschutz"'));
    assert.ok(lines[1].includes('"bestanden"'));
  });

  it('mehrere Pruefungen erzeugen korrekte Zeilenanzahl', () => {
    const data = [
      { inspection_date: '2026-01-01', template_name: 'T1', object_name: null, title: 'I1', inspector: 'Max', status: 'offen', notes: null },
      { inspection_date: '2026-02-01', template_name: 'T2', object_name: 'O1', title: 'I2', inspector: 'Anna', status: 'bestanden', notes: 'OK' },
      { inspection_date: '2026-03-01', template_name: 'T3', object_name: 'O2', title: 'I3', inspector: 'Hans', status: 'bemaengelt', notes: 'Mangel' },
    ];
    const csv = generateInspectionCsv(data);
    const lines = csv.replace(BOM, '').split('\n');
    assert.equal(lines.length, 4); // Header + 3 rows
  });

  it('null object_name wird als leerer String exportiert', () => {
    const csv = generateInspectionCsv([{
      inspection_date: '2026-03-12', template_name: 'T1', object_name: null,
      title: 'Test', inspector: 'Max', status: 'offen', notes: null,
    }]);
    const lines = csv.replace(BOM, '').split('\n');
    // object_name should be empty string in quotes
    assert.ok(lines[1].includes('"";"Test"'));
  });

  it('Anfuehrungszeichen im Wert werden verdoppelt', () => {
    const csv = generateInspectionCsv([{
      inspection_date: '2026-03-12', template_name: 'Test', object_name: 'Raum "A"',
      title: 'I1', inspector: 'Max', status: 'offen', notes: null,
    }]);
    const lines = csv.replace(BOM, '').split('\n');
    assert.ok(lines[1].includes('"Raum ""A"""'), `Erwartet escaped Quotes, bekam: ${lines[1]}`);
  });

  it('Semikolon in Werten ist sicher (innerhalb Quotes)', () => {
    const csv = generateInspectionCsv([{
      inspection_date: '2026-03-12', template_name: 'Test', object_name: 'A; B',
      title: 'I1', inspector: 'Max', status: 'offen', notes: null,
    }]);
    // All values are quoted, so semicolons within values are safe
    const lines = csv.replace(BOM, '').split('\n');
    assert.ok(lines[1].includes('"A; B"'));
  });

  it('alle Status-Werte werden korrekt exportiert', () => {
    const statuses = ['offen', 'bestanden', 'bemaengelt', 'abgebrochen'];
    const data = statuses.map(s => ({
      inspection_date: '2026-01-01', template_name: 'T', object_name: null,
      title: 'I', inspector: 'X', status: s, notes: null,
    }));
    const csv = generateInspectionCsv(data);
    for (const s of statuses) {
      assert.ok(csv.includes(`"${s}"`), `Status "${s}" fehlt im CSV`);
    }
  });
});
