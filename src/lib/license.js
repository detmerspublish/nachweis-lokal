import { getActiveTemplateCount } from './db.js';

const PROBE_LIMIT = 10;

/**
 * Check whether the template limit for the trial version is reached.
 * @returns {Promise<{allowed: boolean, count: number, limit: number}>}
 */
export async function checkTemplateLimit() {
  const count = await getActiveTemplateCount();
  return { allowed: count < PROBE_LIMIT, count, limit: PROBE_LIMIT };
}

/**
 * @returns {boolean} true if a valid license key is present (always false in v0.1)
 */
export function hasLicenseKey() {
  return false;
}
