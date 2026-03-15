/**
 * DB abstraction for Electron IPC.
 * Renderer calls window.electronAPI.db which routes to main process via IPC.
 */

export async function query(sql, params = []) {
  return window.electronAPI.db.query(sql, params);
}

export async function execute(sql, params = []) {
  return window.electronAPI.db.execute(sql, params);
}

export async function migrate(sqlStatements) {
  for (const stmt of sqlStatements) {
    await execute(stmt);
  }
}
