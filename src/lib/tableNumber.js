/**
 * Return the table's stored name without a redundant leading "Table" label.
 * Accepts existing legacy values such as "Table 1", "TABLE-2", "Table: 3"
 * and newer values such as "1" or custom names such as "Patio A".
 */
export function normalizeTableNumber(value) {
  if (value === null || value === undefined) return "";

  const normalized = String(value).trim();
  if (!normalized) return "";

  // Require a separator or a digit after "table" so custom names such as
  // "Tabletop" are not accidentally changed.
  return normalized.replace(/^table(?:\s+|[-:#]\s*|(?=\d))/i, "").trim();
}
