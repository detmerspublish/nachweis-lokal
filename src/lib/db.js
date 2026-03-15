import { query, execute } from '@codefabrik/app-shared/db';

// --- Schema v1 ---

const SCHEMA_SQL = [
  // Organisationsprofil (Singleton fuer Briefkopf)
  `CREATE TABLE IF NOT EXISTS org_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    street TEXT DEFAULT '',
    zip TEXT DEFAULT '',
    city TEXT DEFAULT '',
    contact_email TEXT DEFAULT '',
    contact_phone TEXT DEFAULT '',
    responsible TEXT DEFAULT '',
    logo_path TEXT DEFAULT ''
  )`,
  `INSERT OR IGNORE INTO org_profile (id) VALUES (1)`,

  // Pruefvorlagen (Checklisten-Templates)
  `CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT '',
    interval_days INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Pruefpunkte je Vorlage
  `CREATE TABLE IF NOT EXISTS template_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL,
    hint TEXT,
    required INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE INDEX IF NOT EXISTS idx_template_items_template ON template_items(template_id, sort_order)`,

  // Objekte / Gegenstaende (was wird geprueft?)
  `CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT DEFAULT '',
    category TEXT DEFAULT '',
    identifier TEXT DEFAULT '',
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // Pruefungen (ausgefuellte Protokolle)
  `CREATE TABLE IF NOT EXISTS inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES templates(id),
    object_id INTEGER REFERENCES objects(id),
    title TEXT NOT NULL,
    inspector TEXT NOT NULL,
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

  // Pruefergebnisse je Punkt
  `CREATE TABLE IF NOT EXISTS inspection_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
    template_item_id INTEGER NOT NULL REFERENCES template_items(id),
    result TEXT NOT NULL DEFAULT 'offen'
      CHECK (result IN ('offen', 'ok', 'maengel', 'nicht_anwendbar')),
    remark TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_results_inspection ON inspection_results(inspection_id)`,

  // Event-Log (HMAC-SHA256 Hash-Kette)
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'app',
    version INTEGER NOT NULL DEFAULT 1,
    data TEXT NOT NULL,
    hash TEXT NOT NULL,
    prev_hash TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`,

  // Schema-Meta
  `CREATE TABLE IF NOT EXISTS _schema_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL DEFAULT 1,
    app_version TEXT NOT NULL,
    last_migration TEXT,
    event_replay_at TEXT
  )`,
];

// --- Schema v2 Migration (Attachments + Defects) ---

const MIGRATION_V2_SQL = [
  // Feature: Foto-Anhaenge
  `CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_result_id INTEGER NOT NULL
      REFERENCES inspection_results(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    size_bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_result ON attachments(inspection_result_id)`,

  // Feature: Maengeltracking
  `CREATE TABLE IF NOT EXISTS defects (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_defects_inspection ON defects(inspection_id)`,
  `CREATE INDEX IF NOT EXISTS idx_defects_status ON defects(status)`,
];

// --- Schema v3 Migration (Inspectors) ---

const MIGRATION_V3_SQL = [
  `CREATE TABLE IF NOT EXISTS inspectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT '',
    qualification TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_inspectors_name ON inspectors(name)`,
];

// --- Init ---

export async function initDb() {
  for (const sql of SCHEMA_SQL) {
    await execute(sql);
  }

  // Check current schema version
  const meta = await query('SELECT schema_version FROM _schema_meta WHERE id = 1');
  const currentVersion = meta[0]?.schema_version ?? 0;

  if (currentVersion < 2) {
    // Migrate v1 → v2
    for (const sql of MIGRATION_V2_SQL) {
      await execute(sql);
    }
    // Feature: Wiederkehrende Pruefungen (ALTER TABLE)
    try {
      await execute('ALTER TABLE inspections ADD COLUMN parent_inspection_id INTEGER REFERENCES inspections(id)');
    } catch {
      // Column already exists — ignore
    }
  }

  if (currentVersion < 3) {
    // Migrate v2 → v3
    for (const sql of MIGRATION_V3_SQL) {
      await execute(sql);
    }
    // Seed inspectors from existing inspection data
    try {
      await execute(`
        INSERT OR IGNORE INTO inspectors (name)
        SELECT DISTINCT inspector FROM inspections WHERE inspector != '' AND inspector IS NOT NULL
      `);
    } catch {
      // Table might be empty — ignore
    }
  }

  await execute(
    `INSERT OR REPLACE INTO _schema_meta (id, schema_version, app_version, last_migration) VALUES (1, 3, '0.3.0', datetime('now'))`
  );

  await appendEvent('AppGestartet', { version: '0.3.0', schema_version: 3 });
}

// --- Org Profile ---

export async function getOrgProfile() {
  const rows = await query('SELECT * FROM org_profile WHERE id = 1');
  return rows[0] ?? null;
}

export async function saveOrgProfile(profile) {
  await execute(`
    UPDATE org_profile SET
      name = ?, street = ?, zip = ?, city = ?,
      contact_email = ?, contact_phone = ?, responsible = ?, logo_path = ?
    WHERE id = 1
  `, [
    profile.name, profile.street, profile.zip, profile.city,
    profile.contact_email, profile.contact_phone, profile.responsible, profile.logo_path,
  ]);
  await appendEvent('ProfilGespeichert', { ...profile });
}

// --- Templates (Vorlagen) ---

export async function getTemplates() {
  return query('SELECT * FROM templates WHERE active = 1 ORDER BY name');
}

export async function getAllTemplates() {
  return query('SELECT * FROM templates ORDER BY name');
}

export async function getTemplate(id) {
  const rows = await query('SELECT * FROM templates WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function saveTemplate(template) {
  if (template.id) {
    await execute(`
      UPDATE templates SET
        name = ?, description = ?, category = ?, interval_days = ?, active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [template.name, template.description, template.category, template.interval_days, template.active ?? 1, template.id]);
    await appendEvent('VorlageGeaendert', { ...template });
    return template.id;
  } else {
    const result = await execute(`
      INSERT INTO templates (name, description, category, interval_days)
      VALUES (?, ?, ?, ?)
    `, [template.name, template.description, template.category, template.interval_days]);
    await appendEvent('VorlageAngelegt', { id: result.lastInsertId, ...template });
    return result.lastInsertId;
  }
}

export async function deleteTemplate(id) {
  const template = await getTemplate(id);
  await execute("UPDATE templates SET active = 0, updated_at = datetime('now') WHERE id = ?", [id]);
  await appendEvent('VorlageDeaktiviert', { id, name: template?.name });
}

export async function getActiveTemplateCount() {
  const rows = await query('SELECT COUNT(*) as count FROM templates WHERE active = 1');
  return rows[0]?.count ?? 0;
}

// --- Template Items (Pruefpunkte) ---

export async function getTemplateItems(templateId) {
  return query(
    'SELECT * FROM template_items WHERE template_id = ? ORDER BY sort_order',
    [templateId]
  );
}

export async function saveTemplateItems(templateId, items) {
  await execute('DELETE FROM template_items WHERE template_id = ?', [templateId]);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await execute(`
      INSERT INTO template_items (template_id, sort_order, label, hint, required)
      VALUES (?, ?, ?, ?, ?)
    `, [templateId, i, item.label, item.hint ?? null, item.required ? 1 : 0]);
  }
  await appendEvent('PruefpunkteGespeichert', { template_id: templateId, count: items.length });
}

// --- Objects (Gegenstaende / Pruefobjekte) ---

export async function getObjects() {
  return query('SELECT * FROM objects WHERE active = 1 ORDER BY name');
}

export async function getAllObjects() {
  return query('SELECT * FROM objects ORDER BY name');
}

export async function getObject(id) {
  const rows = await query('SELECT * FROM objects WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function saveObject(obj) {
  if (obj.id) {
    await execute(`
      UPDATE objects SET
        name = ?, location = ?, category = ?, identifier = ?, notes = ?,
        active = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [obj.name, obj.location, obj.category, obj.identifier, obj.notes, obj.active ?? 1, obj.id]);
    await appendEvent('ObjektGeaendert', { ...obj });
    return obj.id;
  } else {
    const result = await execute(`
      INSERT INTO objects (name, location, category, identifier, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [obj.name, obj.location, obj.category, obj.identifier, obj.notes]);
    await appendEvent('ObjektAngelegt', { id: result.lastInsertId, ...obj });
    return result.lastInsertId;
  }
}

export async function deleteObject(id) {
  const obj = await getObject(id);
  await execute("UPDATE objects SET active = 0, updated_at = datetime('now') WHERE id = ?", [id]);
  await appendEvent('ObjektDeaktiviert', { id, name: obj?.name });
}

// --- Inspections (Pruefungen) ---

export async function getInspections(filter = {}) {
  let sql = `
    SELECT i.*, t.name as template_name, o.name as object_name
    FROM inspections i
    LEFT JOIN templates t ON i.template_id = t.id
    LEFT JOIN objects o ON i.object_id = o.id
  `;
  const params = [];
  const conditions = [];

  if (filter.status) {
    conditions.push('i.status = ?');
    params.push(filter.status);
  }
  if (filter.template_id) {
    conditions.push('i.template_id = ?');
    params.push(filter.template_id);
  }
  if (filter.object_id) {
    conditions.push('i.object_id = ?');
    params.push(filter.object_id);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY i.inspection_date DESC, i.id DESC';
  return query(sql, params);
}

export async function getInspection(id) {
  const rows = await query(`
    SELECT i.*, t.name as template_name, o.name as object_name
    FROM inspections i
    LEFT JOIN templates t ON i.template_id = t.id
    LEFT JOIN objects o ON i.object_id = o.id
    WHERE i.id = ?
  `, [id]);
  return rows[0] ?? null;
}

export async function saveInspection(inspection) {
  if (inspection.id) {
    await execute(`
      UPDATE inspections SET
        template_id = ?, object_id = ?, title = ?, inspector = ?,
        inspection_date = ?, due_date = ?, status = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      inspection.template_id, inspection.object_id ?? null, inspection.title,
      inspection.inspector, inspection.inspection_date, inspection.due_date,
      inspection.status, inspection.notes, inspection.id,
    ]);
    await appendEvent('PruefungGeaendert', { ...inspection });
    return inspection.id;
  } else {
    const result = await execute(`
      INSERT INTO inspections (template_id, object_id, title, inspector, inspection_date, due_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      inspection.template_id, inspection.object_id ?? null, inspection.title,
      inspection.inspector, inspection.inspection_date, inspection.due_date,
      inspection.status ?? 'offen', inspection.notes,
    ]);
    const id = result.lastInsertId;
    await appendEvent('PruefungAngelegt', { id, ...inspection });
    return id;
  }
}

export async function deleteInspection(id) {
  const inspection = await getInspection(id);
  await execute('DELETE FROM inspection_results WHERE inspection_id = ?', [id]);
  await execute('DELETE FROM inspections WHERE id = ?', [id]);
  await appendEvent('PruefungGeloescht', { id, title: inspection?.title });
}

// --- Inspection Results (Pruefergebnisse) ---

export async function getInspectionResults(inspectionId) {
  return query(`
    SELECT ir.*, ti.label, ti.hint, ti.required, ti.sort_order
    FROM inspection_results ir
    JOIN template_items ti ON ir.template_item_id = ti.id
    WHERE ir.inspection_id = ?
    ORDER BY ti.sort_order
  `, [inspectionId]);
}

export async function saveInspectionResults(inspectionId, results) {
  for (const r of results) {
    if (r.id) {
      await execute(
        'UPDATE inspection_results SET result = ?, remark = ? WHERE id = ?',
        [r.result, r.remark, r.id]
      );
    } else {
      await execute(`
        INSERT INTO inspection_results (inspection_id, template_item_id, result, remark)
        VALUES (?, ?, ?, ?)
      `, [inspectionId, r.template_item_id, r.result, r.remark]);
    }
  }
  await appendEvent('ErgebnisseGespeichert', { inspection_id: inspectionId, count: results.length });
}

export async function initInspectionResults(inspectionId, templateId) {
  const items = await getTemplateItems(templateId);
  for (const item of items) {
    await execute(`
      INSERT INTO inspection_results (inspection_id, template_item_id, result, remark)
      VALUES (?, ?, 'offen', NULL)
    `, [inspectionId, item.id]);
  }
}

// --- Dashboard / Faelligkeiten ---

export async function getDueInspections() {
  const today = new Date().toISOString().split('T')[0];
  return query(`
    SELECT t.id as template_id, t.name as template_name, t.interval_days,
      o.id as object_id, o.name as object_name,
      MAX(i.inspection_date) as last_inspection,
      date(MAX(i.inspection_date), '+' || t.interval_days || ' days') as next_due,
      CASE
        WHEN date(MAX(i.inspection_date), '+' || t.interval_days || ' days') < ? THEN 'ueberfaellig'
        WHEN date(MAX(i.inspection_date), '+' || (t.interval_days - 14) || ' days') < ? THEN 'bald_faellig'
        ELSE 'ok'
      END as urgency
    FROM templates t
    LEFT JOIN inspections i ON t.id = i.template_id AND i.status IN ('bestanden', 'bemaengelt')
    LEFT JOIN objects o ON i.object_id = o.id
    WHERE t.active = 1 AND t.interval_days IS NOT NULL AND t.interval_days > 0
    GROUP BY t.id, o.id
    ORDER BY next_due ASC
  `, [today, today]);
}

export async function getRecentInspections(limit = 5) {
  return query(`
    SELECT i.id, i.title, i.status, i.inspection_date, i.updated_at,
      t.name as template_name, o.name as object_name
    FROM inspections i
    LEFT JOIN templates t ON i.template_id = t.id
    LEFT JOIN objects o ON i.object_id = o.id
    ORDER BY COALESCE(i.updated_at, i.created_at) DESC
    LIMIT ?
  `, [limit]);
}

export async function getOpenDefects(limit = 5) {
  return query(`
    SELECT d.id, d.description, d.status, d.created_at,
      i.title as inspection_title, i.object_id,
      o.name as object_name, ti.label as item_label
    FROM defects d
    JOIN inspections i ON d.inspection_id = i.id
    LEFT JOIN objects o ON i.object_id = o.id
    JOIN inspection_results ir ON d.inspection_result_id = ir.id
    JOIN template_items ti ON ir.template_item_id = ti.id
    WHERE d.status = 'offen'
    ORDER BY d.created_at DESC
    LIMIT ?
  `, [limit]);
}

export async function getInspectionStats() {
  const rows = await query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'offen' THEN 1 ELSE 0 END) as offen,
      SUM(CASE WHEN status = 'bestanden' THEN 1 ELSE 0 END) as bestanden,
      SUM(CASE WHEN status = 'bemaengelt' THEN 1 ELSE 0 END) as bemaengelt,
      SUM(CASE WHEN status = 'abgebrochen' THEN 1 ELSE 0 END) as abgebrochen
    FROM inspections
  `);
  return rows[0] ?? { total: 0, offen: 0, bestanden: 0, bemaengelt: 0, abgebrochen: 0 };
}

export async function getObjectHistory(objectId) {
  return query(`
    SELECT i.*, t.name as template_name
    FROM inspections i
    LEFT JOIN templates t ON i.template_id = t.id
    WHERE i.object_id = ?
    ORDER BY i.inspection_date DESC
  `, [objectId]);
}

// --- CSV Export ---

export async function exportInspectionsCSV() {
  const inspections = await getInspections();
  const header = 'Datum;Vorlage;Objekt;Titel;Pruefer;Status;Bemerkungen';
  const rows = inspections.map(i =>
    [i.inspection_date, i.template_name, i.object_name ?? '', i.title, i.inspector, i.status, i.notes ?? '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(';')
  );
  return '\uFEFF' + header + '\n' + rows.join('\n');
}

// --- Event-Log (via tamper-evident-log im Main-Prozess) ---

export async function appendEvent(type, data, actor = 'app') {
  return window.electronAPI.audit.append(type, data, actor);
}

export async function verifyChain(limit = 100) {
  return window.electronAPI.audit.verify({ limit });
}

export async function getEvents(limit = 50) {
  return window.electronAPI.audit.getEvents({ limit, order: 'desc' });
}

// --- Template Library (Vorlagen-Bibliothek) ---

export async function importLibraryTemplate(libraryTemplate) {
  const result = await execute(`
    INSERT INTO templates (name, description, category, interval_days)
    VALUES (?, ?, ?, ?)
  `, [libraryTemplate.name, libraryTemplate.description, libraryTemplate.category, libraryTemplate.interval_days]);
  const templateId = result.lastInsertId;

  for (let i = 0; i < libraryTemplate.items.length; i++) {
    const item = libraryTemplate.items[i];
    await execute(`
      INSERT INTO template_items (template_id, sort_order, label, hint, required)
      VALUES (?, ?, ?, ?, ?)
    `, [templateId, i, item.label, item.hint ?? null, item.required ? 1 : 0]);
  }

  await appendEvent('BibliothekVorlageImportiert', {
    id: templateId, name: libraryTemplate.name, category: libraryTemplate.category,
    items_count: libraryTemplate.items.length,
  });
  return templateId;
}

// --- Wiederkehrende Pruefungen ---

export async function createRecurringInspection(sourceInspectionId) {
  const source = await getInspection(sourceInspectionId);
  if (!source) return null;

  const template = await getTemplate(source.template_id);
  if (!template || !template.interval_days || template.interval_days <= 0) return null;

  const inspDate = source.inspection_date || new Date().toISOString().split('T')[0];
  const dueDate = addDays(inspDate, template.interval_days);

  const result = await execute(`
    INSERT INTO inspections (template_id, object_id, title, inspector, due_date, status, parent_inspection_id)
    VALUES (?, ?, ?, ?, ?, 'offen', ?)
  `, [source.template_id, source.object_id ?? null, source.title, source.inspector, dueDate, sourceInspectionId]);

  const newId = result.lastInsertId;
  await initInspectionResults(newId, source.template_id);
  await appendEvent('PruefungAutomatischErstellt', {
    id: newId, parent_id: sourceInspectionId, template_id: source.template_id,
    due_date: dueDate, interval_days: template.interval_days,
  });
  return newId;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().split('T')[0];
}

// --- Attachments (Foto-Anhaenge) ---

export async function saveAttachment(inspectionResultId, fileName, filePath, mimeType, sizeBytes) {
  const result = await execute(`
    INSERT INTO attachments (inspection_result_id, file_name, file_path, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?)
  `, [inspectionResultId, fileName, filePath, mimeType, sizeBytes]);
  await appendEvent('AnhangHinzugefuegt', {
    id: result.lastInsertId, inspection_result_id: inspectionResultId,
    file_name: fileName, mime_type: mimeType,
  });
  return result.lastInsertId;
}

export async function getAttachments(inspectionResultId) {
  return query('SELECT * FROM attachments WHERE inspection_result_id = ? ORDER BY created_at', [inspectionResultId]);
}

export async function getAttachmentsByInspection(inspectionId) {
  return query(`
    SELECT a.*, ir.template_item_id
    FROM attachments a
    JOIN inspection_results ir ON a.inspection_result_id = ir.id
    WHERE ir.inspection_id = ?
    ORDER BY a.created_at
  `, [inspectionId]);
}

export async function deleteAttachment(id) {
  const rows = await query('SELECT * FROM attachments WHERE id = ?', [id]);
  const attachment = rows[0];
  await execute('DELETE FROM attachments WHERE id = ?', [id]);
  await appendEvent('AnhangGeloescht', { id, file_name: attachment?.file_name });
  return attachment;
}

// --- Inspectors (Prueferverwaltung) ---

export async function getInspectors() {
  return query('SELECT * FROM inspectors WHERE active = 1 ORDER BY name');
}

export async function saveInspector(inspector) {
  if (inspector.id) {
    await execute(`
      UPDATE inspectors SET name = ?, role = ?, qualification = ?, active = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [inspector.name, inspector.role ?? '', inspector.qualification ?? '', inspector.active ?? 1, inspector.id]);
    await appendEvent('PrueferGeaendert', { ...inspector });
    return inspector.id;
  } else {
    const result = await execute(`
      INSERT INTO inspectors (name, role, qualification) VALUES (?, ?, ?)
    `, [inspector.name, inspector.role ?? '', inspector.qualification ?? '']);
    await appendEvent('PrueferAngelegt', { id: result.lastInsertId, ...inspector });
    return result.lastInsertId;
  }
}

export async function deleteInspector(id) {
  const rows = await query('SELECT name FROM inspectors WHERE id = ?', [id]);
  await execute("UPDATE inspectors SET active = 0, updated_at = datetime('now') WHERE id = ?", [id]);
  await appendEvent('PrueferDeaktiviert', { id, name: rows[0]?.name });
}

// --- Template Duplication ---

export async function duplicateTemplate(id) {
  const template = await getTemplate(id);
  if (!template) return null;
  const items = await getTemplateItems(id);
  const newId = await saveTemplate({
    name: `${template.name} (Kopie)`,
    description: template.description,
    category: template.category,
    interval_days: template.interval_days,
  });
  if (items.length > 0) {
    await saveTemplateItems(newId, items.map(item => ({
      label: item.label,
      hint: item.hint,
      required: item.required,
    })));
  }
  await appendEvent('VorlageDupliziert', { source_id: id, new_id: newId, name: template.name });
  return newId;
}

// --- Defects (Maengeltracking) ---

export async function createDefectsFromInspection(inspectionId) {
  const results = await getInspectionResults(inspectionId);
  const defects = results.filter(r => r.result === 'maengel');
  const created = [];

  for (const r of defects) {
    const result = await execute(`
      INSERT INTO defects (inspection_id, inspection_result_id, description, status)
      VALUES (?, ?, ?, 'offen')
    `, [inspectionId, r.id, r.remark ?? '']);
    created.push({ id: result.lastInsertId, inspection_result_id: r.id, description: r.remark ?? '' });
    await appendEvent('DefektErstellt', {
      id: result.lastInsertId, inspection_id: inspectionId,
      inspection_result_id: r.id, label: r.label,
    });
  }
  return created;
}

export async function getDefects(filter = {}) {
  let sql = `
    SELECT d.*, i.title as inspection_title, i.object_id,
      o.name as object_name, ti.label as item_label
    FROM defects d
    JOIN inspections i ON d.inspection_id = i.id
    LEFT JOIN objects o ON i.object_id = o.id
    JOIN inspection_results ir ON d.inspection_result_id = ir.id
    JOIN template_items ti ON ir.template_item_id = ti.id
  `;
  const params = [];
  const conditions = [];

  if (filter.status) {
    conditions.push('d.status = ?');
    params.push(filter.status);
  }
  if (filter.inspection_id) {
    conditions.push('d.inspection_id = ?');
    params.push(filter.inspection_id);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY d.created_at DESC';
  return query(sql, params);
}

export async function getDefect(id) {
  const rows = await query(`
    SELECT d.*, i.title as inspection_title, i.object_id,
      o.name as object_name, ti.label as item_label
    FROM defects d
    JOIN inspections i ON d.inspection_id = i.id
    LEFT JOIN objects o ON i.object_id = o.id
    JOIN inspection_results ir ON d.inspection_result_id = ir.id
    JOIN template_items ti ON ir.template_item_id = ti.id
    WHERE d.id = ?
  `, [id]);
  return rows[0] ?? null;
}

export async function updateDefectStatus(id, status) {
  const resolvedAt = status === 'behoben' || status === 'verifiziert' ? "datetime('now')" : 'NULL';
  await execute(`
    UPDATE defects SET status = ?, resolved_at = ${resolvedAt}, updated_at = datetime('now')
    WHERE id = ?
  `, [status, id]);

  const eventType = status === 'behoben' ? 'DefektBehoben' : status === 'verifiziert' ? 'DefektVerifiziert' : 'DefektStatusGeaendert';
  await appendEvent(eventType, { id, status });
}

export async function getOpenDefectCount() {
  const rows = await query("SELECT COUNT(*) as count FROM defects WHERE status = 'offen'");
  return rows[0]?.count ?? 0;
}

export async function createReinspection(inspectionId, defectIds) {
  const source = await getInspection(inspectionId);
  if (!source) return null;

  // Get defect items to include
  const defects = [];
  for (const defectId of defectIds) {
    const d = await getDefect(defectId);
    if (d) defects.push(d);
  }
  if (defects.length === 0) return null;

  const result = await execute(`
    INSERT INTO inspections (template_id, object_id, title, inspector, status, parent_inspection_id)
    VALUES (?, ?, ?, ?, 'offen', ?)
  `, [source.template_id, source.object_id ?? null, `Nachpruefung: ${source.title}`, source.inspector, inspectionId]);

  const newId = result.lastInsertId;

  // Only create results for defect items
  for (const d of defects) {
    const irRows = await query('SELECT template_item_id FROM inspection_results WHERE id = ?', [d.inspection_result_id]);
    if (irRows[0]) {
      await execute(`
        INSERT INTO inspection_results (inspection_id, template_item_id, result, remark)
        VALUES (?, ?, 'offen', ?)
      `, [newId, irRows[0].template_item_id, d.description]);
    }
  }

  await appendEvent('NachpruefungErstellt', {
    id: newId, parent_id: inspectionId, defect_count: defects.length,
  });
  return newId;
}
