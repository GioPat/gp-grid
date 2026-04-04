// packages/core/src/utils/format-helpers.ts

import type { CellValue } from "../types/basic";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

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
  if (isPlainObject(value)) return JSON.stringify(value);
  return String(value);
};
