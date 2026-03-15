/**
 * Support-Bundle Sanitizer — strips to Klasse-C data only.
 *
 * Datenklassen (see ki-support-architektur-dsgvo.md):
 *   Klasse A: Kundendaten (Name, Adresse) — NEVER sent
 *   Klasse B: Nutzungsstatistiken, DB-Inhalte — NEVER sent
 *   Klasse C: Technische Diagnose (system-info, logs, errors) — SAFE to send
 *
 * The sanitizer takes a full support bundle (from collectDiagnostics)
 * and returns only Klasse-C files, with additional scrubbing.
 */

// Files that are safe to send (Klasse C)
const ALLOWED_FILES = [
  'system-info.json',
  'case-summary.json',
  'integrity-check.json',
  'schema-meta.json',
  'storage-risks.json',
  'resource-warnings.json',
  'update-state.json',
];

// Patterns to scrub from log content
const SCRUB_PATTERNS = [
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // File paths with usernames (Windows + Linux)
  /(?:\/home\/|\/Users\/|C:\\Users\\)[^\s/\\]+/gi,
  // IP addresses (keep localhost/loopback)
  /(?<!127\.0\.0\.)(?<!0\.0\.0\.)\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
];

/**
 * Sanitizes a support bundle to Klasse-C only.
 *
 * @param {{ files: Array<{ name: string, content: string }> }} bundle
 * @param {{ includeLogSignatures?: boolean }} [options]
 * @returns {{ files: Array<{ name: string, content: string }> }}
 */
function sanitizeBundle(bundle, options = {}) {
  const sanitized = [];

  for (const file of bundle.files) {
    // Only allow Klasse-C files
    if (ALLOWED_FILES.includes(file.name)) {
      sanitized.push({
        name: file.name,
        content: scrubContent(file.name, file.content),
      });
      continue;
    }

    // Log files: extract only error signatures (codes + timestamps)
    if (file.name.endsWith('.log') && options.includeLogSignatures !== false) {
      const signatures = extractLogSignatures(file.content);
      if (signatures.length > 0) {
        sanitized.push({
          name: 'log-signatures.json',
          content: JSON.stringify(signatures, null, 2),
        });
      }
    }
  }

  return { files: sanitized };
}

/**
 * Scrubs sensitive data from file content.
 */
function scrubContent(fileName, content) {
  if (fileName === 'system-info.json') {
    try {
      const data = JSON.parse(content);
      // Remove exact path (may contain username)
      if (data.userDataPath) data.userDataPath = scrubPath(data.userDataPath);
      if (data.dbPath) data.dbPath = scrubPath(data.dbPath);
      return JSON.stringify(data, null, 2);
    } catch (_) {}
  }

  if (fileName === 'case-summary.json') {
    try {
      const data = JSON.parse(content);
      // Already safe — no customer data in case-summary
      return JSON.stringify(data, null, 2);
    } catch (_) {}
  }

  return content;
}

/**
 * Replaces username in path with [user].
 */
function scrubPath(filePath) {
  if (!filePath) return filePath;
  return filePath
    .replace(/\/home\/[^/]+/, '/home/[user]')
    .replace(/\/Users\/[^/]+/, '/Users/[user]')
    .replace(/C:\\Users\\[^\\]+/i, 'C:\\Users\\[user]');
}

/**
 * Extracts error signatures from log content.
 * Returns only error codes, timestamps, and components — no message text.
 */
function extractLogSignatures(logContent) {
  const lines = logContent.trim().split('\n').slice(-200);
  const signatures = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry?.data?.errorCode || entry?.level === 'error' || entry?.level === 'critical') {
        signatures.push({
          code: entry.data?.errorCode || 'UNKNOWN',
          level: entry.level,
          component: entry.component,
          timestamp: entry.ts,
        });
      }
    } catch (_) {
      // Non-JSON log line — skip
    }
  }

  return signatures.slice(-20);
}

module.exports = { sanitizeBundle, scrubPath, extractLogSignatures, ALLOWED_FILES };
