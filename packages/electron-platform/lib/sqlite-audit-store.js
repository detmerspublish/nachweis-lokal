/**
 * SQLite Storage Adapter for tamper-evident-log.
 * Implements the AuditStore interface against the existing `events` table.
 *
 * @license GPL-3.0-only
 */

/**
 * @param {import('better-sqlite3').Database} db - better-sqlite3 connection
 */
function createSqliteAuditStore(db) {
  return {
    async getLastEvent() {
      const row = db.prepare('SELECT id, type, timestamp, actor, data, hash, prev_hash FROM events ORDER BY id DESC LIMIT 1').get();
      return row || null;
    },

    async appendEvent(event) {
      db.prepare(
        'INSERT INTO events (type, timestamp, actor, version, data, hash, prev_hash) VALUES (?, ?, ?, 1, ?, ?, ?)'
      ).run(event.type, event.timestamp, event.actor || 'app', event.data, event.hash, event.prev_hash);
    },

    async getEvents({ limit = 50, offset = 0, order = 'desc' } = {}) {
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      return db.prepare(
        `SELECT id, type, timestamp, actor, data, hash, prev_hash FROM events ORDER BY id ${direction} LIMIT ? OFFSET ?`
      ).all(limit, offset);
    },

    async getAllEvents({ order = 'asc' } = {}) {
      const direction = order === 'asc' ? 'ASC' : 'DESC';
      return db.prepare(`SELECT id, type, timestamp, actor, data, hash, prev_hash FROM events ORDER BY id ${direction}`).all();
    },
  };
}

module.exports = { createSqliteAuditStore };
