// packages/core/src/indexed-data-store/sorting.ts

import type { CellValue, SortModel, Row } from "../types";

/**
 * Convert a string to a sortable number using first 10 characters.
 * Uses base-36 encoding (a-z = 0-25, 0-9 = 26-35).
 */
export function stringToSortableNumber(str: string): number {
  const s = str.toLowerCase();
  const len = Math.min(s.length, 10);
  let hash = 0;

  for (let i = 0; i < len; i++) {
    const code = s.charCodeAt(i);
    let mapped: number;
    if (code >= 97 && code <= 122) {
      // a-z
      mapped = code - 97;
    } else if (code >= 48 && code <= 57) {
      // 0-9
      mapped = code - 48 + 26;
    } else {
      mapped = 0;
    }
    hash = hash * 36 + mapped;
  }

  // Pad to 10 characters
  for (let i = len; i < 10; i++) {
    hash = hash * 36;
  }

  return hash;
}

/**
 * Compare two cell values for sorting.
 * Handles null/undefined, arrays, numbers, dates, and strings.
 */
export function compareValues(a: CellValue, b: CellValue): number {
  // Handle nulls and empty arrays
  const aIsEmpty = a == null || (Array.isArray(a) && a.length === 0);
  const bIsEmpty = b == null || (Array.isArray(b) && b.length === 0);

  if (aIsEmpty && bIsEmpty) return 0;
  if (aIsEmpty) return 1;
  if (bIsEmpty) return -1;

  // Handle arrays - join as comma-separated string
  if (Array.isArray(a) || Array.isArray(b)) {
    const strA = Array.isArray(a) ? a.join(", ") : String(a ?? "");
    const strB = Array.isArray(b) ? b.join(", ") : String(b ?? "");
    return strA.localeCompare(strB);
  }

  // Try numeric comparison
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }

  // Try date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Fall back to string comparison
  return String(a).localeCompare(String(b));
}

/**
 * Compute a sortable hash for a cell value.
 * Used for fast comparisons in sorted indices.
 */
export function computeValueHash(value: CellValue): number {
  if (value == null) return Number.MAX_VALUE; // nulls sort last

  if (typeof value === "number") return value;

  if (value instanceof Date) return value.getTime();

  if (typeof value === "string") {
    return stringToSortableNumber(value);
  }

  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Configuration for sort hash computation
 */
export interface SortHashConfig<TData extends Row> {
  sortModel: SortModel[];
  sortModelHash: string;
  getFieldValue: (row: TData, field: string) => CellValue;
}

/**
 * Compute sort hashes for a row based on sort model.
 * Returns array of hashes, one for each sort column.
 */
export function computeRowSortHashes<TData extends Row>(
  row: TData,
  config: SortHashConfig<TData>
): number[] {
  const hashes: number[] = [];

  for (const sort of config.sortModel) {
    const value = config.getFieldValue(row, sort.colId);
    const hash = computeValueHash(value);
    hashes.push(hash);
  }

  return hashes;
}

/**
 * Compare two rows using precomputed hash arrays.
 * Falls back to direct comparison if hashes unavailable.
 */
export function compareRowsByHashes(
  hashesA: number[] | undefined,
  hashesB: number[] | undefined,
  sortModel: SortModel[]
): number | null {
  if (!hashesA || !hashesB) {
    return null; // Signal to use direct comparison
  }

  for (let i = 0; i < sortModel.length; i++) {
    const diff = hashesA[i]! - hashesB[i]!;
    if (diff !== 0) {
      return sortModel[i]!.direction === "asc" ? diff : -diff;
    }
  }

  return 0;
}

/**
 * Compare two rows directly without hash cache.
 */
export function compareRowsDirect<TData extends Row>(
  rowA: TData,
  rowB: TData,
  sortModel: SortModel[],
  getFieldValue: (row: TData, field: string) => CellValue
): number {
  for (const { colId, direction } of sortModel) {
    const valA = getFieldValue(rowA, colId);
    const valB = getFieldValue(rowB, colId);
    const comparison = compareValues(valA, valB);

    if (comparison !== 0) {
      return direction === "asc" ? comparison : -comparison;
    }
  }

  return 0;
}
