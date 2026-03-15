const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeBundle,
  scrubPath,
  extractLogSignatures,
  ALLOWED_FILES,
} = require('../lib/support-sanitizer.js');

describe('support-sanitizer', () => {
  describe('sanitizeBundle', () => {
    it('keeps only Klasse-C files', () => {
      const bundle = {
        files: [
          { name: 'system-info.json', content: '{"app":"Test"}' },
          { name: 'case-summary.json', content: '{"product":"Test"}' },
          { name: 'integrity-check.json', content: '{"ok":true}' },
          { name: 'schema-meta.json', content: '{"schema_version":5}' },
          { name: 'app.log', content: 'log line 1\nlog line 2' },
          { name: 'backups.json', content: '[{"name":"backup.db"}]' },
        ],
      };

      const result = sanitizeBundle(bundle);
      const names = result.files.map(f => f.name);

      assert.ok(names.includes('system-info.json'));
      assert.ok(names.includes('case-summary.json'));
      assert.ok(names.includes('integrity-check.json'));
      assert.ok(names.includes('schema-meta.json'));
      // backups.json is NOT in ALLOWED_FILES
      assert.ok(!names.includes('backups.json'));
    });

    it('does not include raw log files', () => {
      const bundle = {
        files: [
          { name: 'system-info.json', content: '{}' },
          { name: 'app.log', content: 'some log content' },
          { name: 'app-2026-03-07.log', content: 'another log' },
          { name: 'case-summary.json', content: '{}' },
        ],
      };

      const result = sanitizeBundle(bundle);
      const names = result.files.map(f => f.name);
      assert.ok(!names.includes('app.log'));
      assert.ok(!names.includes('app-2026-03-07.log'));
    });

    it('extracts log signatures from log files', () => {
      const logLine = JSON.stringify({
        ts: '2026-03-07T10:00:00Z',
        level: 'error',
        component: 'db',
        data: { errorCode: 'CF-DB-002' },
      });
      const bundle = {
        files: [
          { name: 'case-summary.json', content: '{}' },
          { name: 'app.log', content: logLine },
        ],
      };

      const result = sanitizeBundle(bundle);
      const sigFile = result.files.find(f => f.name === 'log-signatures.json');
      assert.ok(sigFile, 'Should include log-signatures.json');

      const sigs = JSON.parse(sigFile.content);
      assert.equal(sigs.length, 1);
      assert.equal(sigs[0].code, 'CF-DB-002');
      assert.equal(sigs[0].component, 'db');
    });

    it('scrubs userDataPath in system-info.json', () => {
      const sysInfo = {
        app: 'Test',
        userDataPath: '/home/ldetmers/.config/Test',
        dbPath: '/home/ldetmers/.config/Test/db.sqlite',
      };
      const bundle = {
        files: [
          { name: 'system-info.json', content: JSON.stringify(sysInfo) },
          { name: 'case-summary.json', content: '{}' },
        ],
      };

      const result = sanitizeBundle(bundle);
      const scrubbed = JSON.parse(result.files.find(f => f.name === 'system-info.json').content);
      assert.ok(!scrubbed.userDataPath.includes('ldetmers'));
      assert.ok(scrubbed.userDataPath.includes('[user]'));
    });

    it('returns empty files for empty bundle', () => {
      const result = sanitizeBundle({ files: [] });
      assert.equal(result.files.length, 0);
    });

    it('can suppress log signatures', () => {
      const logLine = JSON.stringify({
        ts: '2026-03-07T10:00:00Z',
        level: 'error',
        component: 'db',
        data: { errorCode: 'CF-DB-002' },
      });
      const bundle = {
        files: [
          { name: 'case-summary.json', content: '{}' },
          { name: 'app.log', content: logLine },
        ],
      };

      const result = sanitizeBundle(bundle, { includeLogSignatures: false });
      const names = result.files.map(f => f.name);
      assert.ok(!names.includes('log-signatures.json'));
    });
  });

  describe('scrubPath', () => {
    it('replaces Linux username', () => {
      assert.equal(scrubPath('/home/ldetmers/.config/app'), '/home/[user]/.config/app');
    });

    it('replaces macOS username', () => {
      assert.equal(scrubPath('/Users/jdoe/Library/app'), '/Users/[user]/Library/app');
    });

    it('replaces Windows username', () => {
      assert.equal(scrubPath('C:\\Users\\Admin\\AppData\\app'), 'C:\\Users\\[user]\\AppData\\app');
    });

    it('returns null for null input', () => {
      assert.equal(scrubPath(null), null);
    });
  });

  describe('extractLogSignatures', () => {
    it('extracts error codes from JSON log lines', () => {
      const lines = [
        JSON.stringify({ ts: 't1', level: 'info', component: 'app', data: {} }),
        JSON.stringify({ ts: 't2', level: 'error', component: 'db', data: { errorCode: 'CF-DB-001' } }),
        JSON.stringify({ ts: 't3', level: 'critical', component: 'crash', data: {} }),
      ].join('\n');

      const sigs = extractLogSignatures(lines);
      assert.equal(sigs.length, 2);
      assert.equal(sigs[0].code, 'CF-DB-001');
      assert.equal(sigs[1].code, 'UNKNOWN');
      assert.equal(sigs[1].level, 'critical');
    });

    it('limits to last 20 entries', () => {
      const lines = Array.from({ length: 30 }, (_, i) =>
        JSON.stringify({ ts: `t${i}`, level: 'error', component: 'x', data: { errorCode: `E-${i}` } })
      ).join('\n');

      const sigs = extractLogSignatures(lines);
      assert.equal(sigs.length, 20);
    });

    it('skips non-JSON lines', () => {
      const lines = 'plain text line\nnot json\n';
      const sigs = extractLogSignatures(lines);
      assert.equal(sigs.length, 0);
    });
  });
});
