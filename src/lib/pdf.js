import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts.vfs;

/**
 * Load a local image file as a base64 data URL (for embedding in PDFs).
 * Uses HTML Image + Canvas to convert, works in Electron renderer.
 * @param {string} filePath - Absolute path to image file
 * @returns {Promise<string|null>} Data URL or null on error
 */
export function loadImageAsDataUrl(filePath) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Limit to 400px width for PDF embedding
      const maxWidth = 400;
      const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(null);
    img.src = `file://${filePath}`;
  });
}

/**
 * Generate and open a PDF list document.
 * @param {string} title - Document title
 * @param {Array<{text: string, width: number|string}>} columns - Column definitions
 * @param {Array<Array<string>>} rows - Table row data
 * @param {Object} orgProfile - Organization profile for letterhead
 * @param {boolean} isProbe - Whether to show trial watermark
 */
export function generateListPdf(title, columns, rows, orgProfile, isProbe) {
  const today = new Date().toLocaleDateString('de-DE');

  const headerContent = [];
  if (orgProfile?.name) {
    headerContent.push({ text: orgProfile.name, fontSize: 14, bold: true, margin: [0, 0, 0, 2] });
    const addressParts = [orgProfile.street, [orgProfile.zip, orgProfile.city].filter(Boolean).join(' ')].filter(Boolean);
    if (addressParts.length) {
      headerContent.push({ text: addressParts.join(', '), fontSize: 9, color: '#666', margin: [0, 0, 0, 8] });
    }
  }
  headerContent.push({ text: title, fontSize: 12, bold: true, margin: [0, 4, 0, 8] });

  const colWidths = columns.map(c => c.width ?? '*');
  const tableHeader = columns.map(c => ({ text: c.text, bold: true, fontSize: 8, fillColor: '#f0f0f0' }));
  const tableBody = [tableHeader, ...rows.map(row =>
    row.map(cell => ({ text: cell ?? '', fontSize: 8 }))
  )];

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    content: [
      ...headerContent,
      {
        table: {
          headerRows: 1,
          widths: colWidths,
          body: tableBody,
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
          vLineWidth: () => 0,
          hLineColor: () => '#cccccc',
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },
    ],
    footer: (currentPage, pageCount) => {
      const footerColumns = [
        { text: `Stand: ${today}`, fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
        { text: `Seite ${currentPage} / ${pageCount}`, fontSize: 7, color: '#999', alignment: 'right', margin: [0, 0, 40, 0] },
      ];
      if (isProbe) {
        return {
          stack: [
            { text: 'Erstellt mit Probe-Version — codefabrik.de', fontSize: 7, color: '#999', alignment: 'center', margin: [0, 0, 0, 4] },
            { columns: footerColumns },
          ],
          margin: [0, 10, 0, 0],
        };
      }
      return { columns: footerColumns, margin: [0, 20, 0, 0] };
    },
  };

  pdfMake.createPdf(docDefinition).open();
}

/**
 * Generate a blank checklist form for printing.
 * Users can take this on-site, check items with a pen, and enter results digitally later.
 * @param {Object} template - Template data (name, description, category)
 * @param {Array<Object>} items - Template items with label, hint, required
 * @param {Object} orgProfile - Organization profile for letterhead
 */
export function generateBlankFormPdf(template, items, orgProfile) {
  const today = new Date().toLocaleDateString('de-DE');
  const content = [];

  // Letterhead
  if (orgProfile?.name) {
    content.push({ text: orgProfile.name, fontSize: 14, bold: true, margin: [0, 0, 0, 2] });
    const addressParts = [orgProfile.street, [orgProfile.zip, orgProfile.city].filter(Boolean).join(' ')].filter(Boolean);
    if (addressParts.length) {
      content.push({ text: addressParts.join(', '), fontSize: 9, color: '#666', margin: [0, 0, 0, 8] });
    }
  }

  content.push({ text: 'Prüfprotokoll (Leerformular)', fontSize: 14, bold: true, margin: [0, 8, 0, 4] });
  content.push({ text: template.name, fontSize: 12, margin: [0, 0, 0, 4] });
  if (template.description) {
    content.push({ text: template.description, fontSize: 9, color: '#666', margin: [0, 0, 0, 8] });
  }

  // Handwritten fields
  content.push({
    table: {
      widths: [80, '*', 80, '*'],
      body: [
        [
          { text: 'Gerät / Raum:', fontSize: 9, bold: true },
          { text: '', fontSize: 9 },
          { text: 'Datum:', fontSize: 9, bold: true },
          { text: '', fontSize: 9 },
        ],
        [
          { text: 'Prüfer:', fontSize: 9, bold: true },
          { text: '', fontSize: 9 },
          { text: 'Unterschrift:', fontSize: 9, bold: true },
          { text: '', fontSize: 9 },
        ],
      ],
    },
    layout: {
      hLineWidth: (i, node) => (i === node.table.body.length) ? 0.5 : 0,
      vLineWidth: () => 0,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 12],
  });

  // Checklist table with checkboxes
  const headerRow = [
    { text: 'Nr.', bold: true, fontSize: 8, fillColor: '#f0f0f0' },
    { text: 'Prüfpunkt', bold: true, fontSize: 8, fillColor: '#f0f0f0' },
    { text: 'OK', bold: true, fontSize: 8, fillColor: '#f0f0f0', alignment: 'center' },
    { text: 'Mangel', bold: true, fontSize: 8, fillColor: '#f0f0f0', alignment: 'center' },
    { text: 'N/A', bold: true, fontSize: 8, fillColor: '#f0f0f0', alignment: 'center' },
    { text: 'Bemerkung', bold: true, fontSize: 8, fillColor: '#f0f0f0' },
  ];

  const itemRows = items.map((item, i) => {
    const labelStack = [{ text: item.label, fontSize: 8 }];
    if (item.hint) {
      labelStack.push({ text: item.hint, fontSize: 7, color: '#888', italics: true });
    }
    return [
      { text: String(i + 1), fontSize: 8 },
      { stack: labelStack },
      { text: '\u25A1', fontSize: 12, alignment: 'center' },
      { text: '\u25A1', fontSize: 12, alignment: 'center' },
      { text: '\u25A1', fontSize: 12, alignment: 'center' },
      { text: '', fontSize: 8 },
    ];
  });

  content.push({ text: 'Prüfpunkte', fontSize: 11, bold: true, margin: [0, 4, 0, 6] });
  content.push({
    table: {
      headerRows: 1,
      widths: [25, '*', 30, 35, 25, 100],
      body: [headerRow, ...itemRows],
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
      vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length) ? 0.5 : 0.25,
      hLineColor: () => '#cccccc',
      vLineColor: () => '#cccccc',
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  });

  // Notes area
  content.push({ text: 'Bemerkungen:', fontSize: 9, bold: true, margin: [0, 16, 0, 4] });
  content.push({
    table: {
      widths: ['*'],
      body: [[{ text: '\n\n\n\n', fontSize: 9 }]],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#cccccc',
      vLineColor: () => '#cccccc',
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    },
  });

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    content,
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `Leerformular, erstellt: ${today}`, fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
        { text: `Seite ${currentPage} / ${pageCount}`, fontSize: 7, color: '#999', alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 20, 0, 0],
    }),
  };

  pdfMake.createPdf(docDefinition).open();
}

/**
 * Build the content blocks for a single inspection protocol.
 * Used by both single and batch PDF generation.
 * @param {Object} inspection - Inspection data
 * @param {Array<Object>} results - Inspection results with labels
 * @param {Object} orgProfile - Organization profile for letterhead
 * @param {Object} [options] - Optional: attachments (Map), qrText (string)
 * @returns {Array} pdfMake content array
 */
function buildProtocolContent(inspection, results, orgProfile, options = {}) {
  const content = [];

  // Letterhead
  if (orgProfile?.name) {
    content.push({ text: orgProfile.name, fontSize: 14, bold: true, margin: [0, 0, 0, 2] });
    const addressParts = [orgProfile.street, [orgProfile.zip, orgProfile.city].filter(Boolean).join(' ')].filter(Boolean);
    if (addressParts.length) {
      content.push({ text: addressParts.join(', '), fontSize: 9, color: '#666', margin: [0, 0, 0, 8] });
    }
  }

  // Protocol header
  content.push({ text: 'Prüfprotokoll', fontSize: 14, bold: true, margin: [0, 8, 0, 4] });
  content.push({ text: inspection.title, fontSize: 12, margin: [0, 0, 0, 8] });

  // Meta table
  const metaRows = [
    ['Checkliste:', inspection.template_name ?? '-'],
    ['Gerät / Raum:', inspection.object_name ?? '-'],
    ['Prüfer:', inspection.inspector],
    ['Datum:', formatDate(inspection.inspection_date)],
    ['Status:', statusLabel(inspection.status)],
  ];
  if (inspection.due_date) {
    metaRows.push(['Nächste Prüfung:', formatDate(inspection.due_date)]);
  }

  content.push({
    table: {
      widths: [80, '*'],
      body: metaRows.map(([label, value]) => [
        { text: label, fontSize: 9, bold: true },
        { text: value, fontSize: 9 },
      ]),
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 12],
  });

  // Results table
  const resultHeader = [
    { text: 'Nr.', bold: true, fontSize: 8, fillColor: '#f0f0f0', width: 30 },
    { text: 'Prüfpunkt', bold: true, fontSize: 8, fillColor: '#f0f0f0' },
    { text: 'Ergebnis', bold: true, fontSize: 8, fillColor: '#f0f0f0', width: 70 },
    { text: 'Bemerkung', bold: true, fontSize: 8, fillColor: '#f0f0f0' },
  ];
  const resultRows = results.map((r, i) => [
    { text: String(i + 1), fontSize: 8 },
    { text: r.label, fontSize: 8 },
    { text: resultLabel(r.result), fontSize: 8, color: resultColor(r.result) },
    { text: r.remark ?? '', fontSize: 8, color: '#666' },
  ]);

  content.push({ text: 'Prüfergebnisse', fontSize: 11, bold: true, margin: [0, 8, 0, 6] });
  content.push({
    table: {
      headerRows: 1,
      widths: [30, '*', 70, '*'],
      body: [resultHeader, ...resultRows],
    },
    layout: {
      hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
      vLineWidth: () => 0,
      hLineColor: () => '#cccccc',
      paddingLeft: () => 4,
      paddingRight: () => 4,
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
  });

  // Notes
  if (inspection.notes) {
    content.push({ text: 'Hinweise', fontSize: 11, bold: true, margin: [0, 12, 0, 4] });
    content.push({ text: inspection.notes, fontSize: 9, color: '#333' });
  }

  // Photo attachments
  const attachments = options.attachments;
  if (attachments && attachments.size > 0) {
    const photoItems = [];
    for (const [resultId, photos] of attachments) {
      const result = results.find(r => r.id === resultId);
      if (!result || photos.length === 0) continue;
      for (const photo of photos) {
        if (photo.dataUrl) {
          photoItems.push({
            stack: [
              { text: result.label, fontSize: 7, color: '#666', margin: [0, 0, 0, 2] },
              { image: photo.dataUrl, width: 180, margin: [0, 0, 0, 4] },
              { text: photo.fileName, fontSize: 6, color: '#999', margin: [0, 0, 0, 8] },
            ],
          });
        }
      }
    }
    if (photoItems.length > 0) {
      content.push({ text: 'Fotos', fontSize: 11, bold: true, margin: [0, 16, 0, 8] });
      // 2-column layout for photos
      const photoColumns = [];
      for (let i = 0; i < photoItems.length; i += 2) {
        const row = [photoItems[i]];
        if (photoItems[i + 1]) row.push(photoItems[i + 1]);
        else row.push({ text: '' });
        photoColumns.push({ columns: row, columnGap: 12, margin: [0, 0, 0, 4] });
      }
      content.push(...photoColumns);
    }
  }

  // QR code
  const qrText = options.qrText;
  if (qrText) {
    content.push({
      columns: [
        { text: '', width: '*' },
        {
          stack: [
            { qr: qrText, fit: 80, margin: [0, 16, 0, 4] },
            { text: 'Prüfprotokoll-Referenz', fontSize: 6, color: '#999' },
          ],
          width: 'auto',
          alignment: 'right',
        },
      ],
    });
  }

  return content;
}

/**
 * Generate a single inspection protocol PDF.
 * @param {Object} inspection - Inspection data
 * @param {Array<Object>} results - Inspection results with labels
 * @param {Object} orgProfile - Organization profile for letterhead
 * @param {boolean} isProbe - Whether to show trial watermark
 * @param {Object} [options] - Optional: attachments (Map<resultId, [{dataUrl, fileName}]>), qrText (string)
 */
export function generateProtocolPdf(inspection, results, orgProfile, isProbe, options = {}) {
  const today = new Date().toLocaleDateString('de-DE');

  const content = buildProtocolContent(inspection, results, orgProfile, options);

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    content,
    footer: (currentPage, pageCount) => {
      const footerColumns = [
        { text: `Erstellt: ${today}`, fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
        { text: `Seite ${currentPage} / ${pageCount}`, fontSize: 7, color: '#999', alignment: 'right', margin: [0, 0, 40, 0] },
      ];
      if (isProbe) {
        return {
          stack: [
            { text: 'Erstellt mit Probe-Version — codefabrik.de', fontSize: 7, color: '#999', alignment: 'center', margin: [0, 0, 0, 4] },
            { columns: footerColumns },
          ],
          margin: [0, 10, 0, 0],
        };
      }
      return { columns: footerColumns, margin: [0, 20, 0, 0] };
    },
  };

  pdfMake.createPdf(docDefinition).open();
}

/**
 * Generate a batch protocol PDF for multiple inspections.
 * Each inspection starts on a new page.
 * @param {Array<{inspection: Object, results: Array<Object>}>} entries - Inspection+results pairs
 * @param {Object} orgProfile - Organization profile for letterhead
 * @param {boolean} isProbe - Whether to show trial watermark
 */
export function generateBatchProtocolPdf(entries, orgProfile, isProbe) {
  const today = new Date().toLocaleDateString('de-DE');
  const content = [];

  for (let i = 0; i < entries.length; i++) {
    const { inspection, results } = entries[i];
    if (i > 0) {
      content.push({ text: '', pageBreak: 'before' });
    }
    const qrText = `Nachweis Lokal | #${inspection.id} | ${inspection.inspection_date} | ${inspection.status}`;
    const sectionContent = buildProtocolContent(inspection, results, orgProfile, { qrText });
    content.push(...sectionContent);
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    content,
    footer: (currentPage, pageCount) => {
      const footerColumns = [
        { text: `Sammel-Protokoll, erstellt: ${today}`, fontSize: 7, color: '#999', margin: [40, 0, 0, 0] },
        { text: `Seite ${currentPage} / ${pageCount}`, fontSize: 7, color: '#999', alignment: 'right', margin: [0, 0, 40, 0] },
      ];
      if (isProbe) {
        return {
          stack: [
            { text: 'Erstellt mit Probe-Version — codefabrik.de', fontSize: 7, color: '#999', alignment: 'center', margin: [0, 0, 0, 4] },
            { columns: footerColumns },
          ],
          margin: [0, 10, 0, 0],
        };
      }
      return { columns: footerColumns, margin: [0, 20, 0, 0] };
    },
  };

  pdfMake.createPdf(docDefinition).open();
}

/**
 * Generate a deficiency report PDF (only items with maengel).
 */
export function generateDeficiencyPdf(inspection, results, orgProfile, isProbe) {
  const deficiencies = results.filter(r => r.result === 'maengel');
  if (deficiencies.length === 0) return;

  const columns = [
    { text: 'Nr.', width: 30 },
    { text: 'Prüfpunkt', width: '*' },
    { text: 'Bemerkung', width: '*' },
  ];
  const rows = deficiencies.map((r, i) => [
    String(i + 1),
    r.label,
    r.remark ?? '-',
  ]);

  const title = `Mängelbericht — ${inspection.title} (${formatDate(inspection.inspection_date)})`;
  generateListPdf(title, columns, rows, orgProfile, isProbe);
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function statusLabel(status) {
  const labels = { offen: 'Offen', bestanden: 'Bestanden', bemaengelt: 'Bemaengelt', abgebrochen: 'Abgebrochen' };
  return labels[status] ?? status;
}

function resultLabel(result) {
  const labels = { offen: 'Offen', ok: 'OK', maengel: 'Mängel', nicht_anwendbar: 'N/A' };
  return labels[result] ?? result;
}

function resultColor(result) {
  const colors = { ok: '#38a169', maengel: '#e53e3e', offen: '#718096', nicht_anwendbar: '#a0aec0' };
  return colors[result] ?? '#1a202c';
}
