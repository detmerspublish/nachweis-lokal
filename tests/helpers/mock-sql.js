// Mock fuer @codefabrik/app-shared/db (ESM)
// Simuliert query() und execute() ohne echte SQLite-Verbindung.

const calls = [];
const queryQueue = [];
const executeQueue = [];

export async function openDb() {
  calls.push({ fn: 'openDb' });
}

export async function query(sql, params = []) {
  const call = { fn: 'query', sql: sql.replace(/\s+/g, ' ').trim(), params };
  calls.push(call);
  if (queryQueue.length > 0) return queryQueue.shift();
  return [];
}

export async function execute(sql, params = []) {
  const call = { fn: 'execute', sql: sql.replace(/\s+/g, ' ').trim(), params };
  calls.push(call);
  if (executeQueue.length > 0) return executeQueue.shift();
  return { lastInsertId: 1, rowsAffected: 1 };
}

export function mockQuery(result) {
  queryQueue.push(result);
}

export function mockExecute(result) {
  executeQueue.push(result);
}

export function getCalls() {
  return calls;
}

export function reset() {
  calls.length = 0;
  queryQueue.length = 0;
  executeQueue.length = 0;
}
