// packages/core/src/utils/format-helpers.ts

import type { CellValue } from "../types/basic";

/**
 * Convert a CellValue to a display string.
 *
 * - null/undefined → ""
 * - arrays         → items joined with ", "
 * - Date           → String(value)
 * - plain object   → JSON.stringify(value)
 * - primitives     → String(value)
 *
 * An optional `formatter` (from `ColumnDefinition.valueFormatter`) overrides
 * the default logic for non-null values.
 */
export const formatCellValue = (
  value: CellValue,
  formatter?: (v: CellValue) => string,
): string => {
  if (value == null) return "";
  if (formatter) return formatter(value);
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return value instanceof Date ? String(value) : JSON.stringify(value);
  return String(value);
};
