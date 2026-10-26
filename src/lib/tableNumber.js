/**
 * Convert the stored table number into a safe, display-ready label.
 * Accepts numeric values and strings, including values already prefixed with
 * "Table", so the kitchen display never renders "Table Table 4".
 */
export function normalizeTableNumber(value) {
  if (value === null || value === undefined) return "";

  const normalized = String(value).trim();
  if (!normalized) return "";

  return normalized.replace(/^table\s*/i, "").trim();
}
