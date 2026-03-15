/**
 * Offline license key validation.
 * Format: XXXX-XXXX-XXXX-XXXX (16 alphanumeric chars in groups of 4)
 */

const LICENSE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function validateLicenseFormat(key) {
  return LICENSE_PATTERN.test(key?.toUpperCase());
}

export function normalizeLicenseKey(key) {
  return key?.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})/g, '$1-').slice(0, 19) ?? '';
}
