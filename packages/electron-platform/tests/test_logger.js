const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { initLogger, logInfo, logError, logWarn, logDebug, logCritical } = require('../lib/logger.js');

describe('logger', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-log-'));
    initLogger(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates log file and writes JSON entries', () => {
    logInfo('test', 'Hello world');
    const logFile = path.join(tmpDir, 'app.log');
    assert.ok(fs.existsSync(logFile));
    const content = fs.readFileSync(logFile, 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.equal(entry.level, 'info');
    assert.equal(entry.component, 'test');
    assert.equal(entry.message, 'Hello world');
    assert.ok(entry.ts);
  });

  it('includes data field when provided', () => {
    logError('db', 'Failed', { code: 42 });
    const content = fs.readFileSync(path.join(tmpDir, 'app.log'), 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.equal(entry.data.code, 42);
  });

  it('writes multiple levels', () => {
    logCritical('a', 'crit');
    logError('b', 'err');
    logWarn('c', 'warn');
    logInfo('d', 'info');
    const lines = fs.readFileSync(path.join(tmpDir, 'app.log'), 'utf-8').trim().split('\n');
    assert.equal(lines.length, 4);
    assert.equal(JSON.parse(lines[0]).level, 'critical');
    assert.equal(JSON.parse(lines[3]).level, 'info');
  });
});
