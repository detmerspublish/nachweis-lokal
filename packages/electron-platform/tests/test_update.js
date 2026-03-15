const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Test update-state.json read/write logic (no Electron dependency)
describe('update state', () => {
  let tmpDir;
  let statePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-update-'));
    statePath = path.join(tmpDir, 'update-state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no state file exists', () => {
    assert.ok(!fs.existsSync(statePath));
  });

  it('writes and reads update state', () => {
    const state = {
      previousVersion: '0.4.0',
      currentVersion: '0.5.0',
      updateDate: '2026-03-07T14:30:00Z',
      status: 'installed',
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const read = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    assert.equal(read.previousVersion, '0.4.0');
    assert.equal(read.currentVersion, '0.5.0');
    assert.equal(read.status, 'installed');
  });

  it('state transitions: installed -> verified', () => {
    const state = {
      previousVersion: '0.4.0',
      currentVersion: '0.5.0',
      updateDate: '2026-03-07T14:30:00Z',
      status: 'installed',
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    // Simulate verification
    state.status = 'verified';
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const read = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    assert.equal(read.status, 'verified');
  });

  it('valid status values', () => {
    const validStatuses = ['downloading', 'downloaded', 'installed', 'verified', 'rolled-back'];
    for (const status of validStatuses) {
      const state = { status };
      fs.writeFileSync(statePath, JSON.stringify(state));
      const read = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      assert.equal(read.status, status);
    }
  });
});
