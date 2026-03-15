/**
 * CSV-Export utilities.
 * Semicolon-separated (German convention), UTF-8 BOM for Excel compatibility.
 */

const BOM = '\uFEFF';

function escapeValue(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * @param {Array<Object>} rows
 * @param {Array<{key: string, label: string}>} columns
 * @returns {string} CSV string with BOM
 */
export function generateCsv(rows, columns) {
  const header = columns.map(c => escapeValue(c.label)).join(';');
  const lines = rows.map(row =>
    columns.map(c => escapeValue(row[c.key])).join(';')
  );
  return BOM + [header, ...lines].join('\r\n');
}

/**
 * Triggers a browser download for the CSV string.
 * @param {string} csvString
 * @param {string} filename
 */
export function downloadCsv(csvString, filename) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
