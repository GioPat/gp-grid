// packages/core/src/data-source/sorting.ts

import type { CellValue, SortModel } from "../types";

// =============================================================================
// Configuration
// =============================================================================

/** Number of 10-character chunks for string hashing (30 chars total) */
export const HASH_CHUNK_COUNT = 3;

// =============================================================================
// String Hashing
// =============================================================================

/**
 * Convert a string to a sortable number using first 10 characters.
 * Uses base 36 (alphanumeric) to fit more characters within float64 safe precision.
 * (36^10 ≈ 3.6×10¹⁵, within MAX_SAFE_INTEGER ~9×10¹⁵)
 */
export function stringToSortableNumber(str: string): number {
  const s = str.toLowerCase();
  const len = Math.min(s.length, 10);
  let hash = 0;

  // Pack characters into a number using base 36 encoding
  for (let i = 0; i < len; i++) {
    const code = s.charCodeAt(i);
    let mapped: number;
    if (code >= 97 && code <= 122) {
      // a-z -> 0-25
      mapped = code - 97;
    } else if (code >= 48 && code <= 57) {
      // 0-9 -> 26-35
      mapped = code - 48 + 26;
    } else {
      // space and other chars -> 0 (sorts first)
      mapped = 0;
    }
    hash = hash * 36 + mapped;
  }

  // Pad shorter strings to ensure "a" < "ab"
  for (let i = len; i < 10; i++) {
    hash = hash * 36;
  }

  return hash;
}

/**
 * Convert a string to multiple sortable hash values (one per 10-char chunk).
 * This allows correct sorting of strings longer than 10 characters.
 * Returns HASH_CHUNK_COUNT hashes, each covering 10 characters.
 */
export function stringToSortableHashes(str: string): number[] {
  const s = str.toLowerCase();
  const hashes: number[] = [];

  for (let chunk = 0; chunk < HASH_CHUNK_COUNT; chunk++) {
    const start = chunk * 10;
    let hash = 0;

    for (let i = 0; i < 10; i++) {
      const charIndex = start + i;
      const code = charIndex < s.length ? s.charCodeAt(charIndex) : 0;
      let mapped: number;
      if (code >= 97 && code <= 122) {
        // a-z -> 0-25
        mapped = code - 97;
      } else if (code >= 48 && code <= 57) {
        // 0-9 -> 26-35
        mapped = code - 48 + 26;
      } else {
        // space and other chars -> 0 (sorts first)
        mapped = 0;
      }
      hash = hash * 36 + mapped;
    }
    hashes.push(hash);
  }

  return hashes;
}

// =============================================================================
// Value Conversion
// =============================================================================

/**
 * Convert any cell value to a sortable number.
 * Strings are converted using a lexicographic hash of the first 8 characters.
 */
export function toSortableNumber(val: CellValue): number {
  if (val == null) return Number.MAX_VALUE; // nulls sort last

  // Arrays: join and hash as string (no internal sorting for performance)
  if (Array.isArray(val)) {
    if (val.length === 0) return Number.MAX_VALUE;
    return stringToSortableNumber(val.join(', '));
  }

  // Numbers pass through directly
  if (typeof val === "number") return val;

  // Dates convert to timestamp
  if (val instanceof Date) return val.getTime();

  // Strings: convert to lexicographic hash
  if (typeof val === "string") {
    return stringToSortableNumber(val);
  }

  // Fallback: try to convert to number
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

// =============================================================================
// Value Comparison
// =============================================================================

/**
 * Compare two cell values for sorting
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
    const strA = Array.isArray(a) ? a.join(', ') : String(a ?? '');
    const strB = Array.isArray(b) ? b.join(', ') : String(b ?? '');
    return strA.localeCompare(strB);
  }

  // Numeric comparison
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) {
    return aNum - bNum;
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // String comparison
  return String(a).localeCompare(String(b));
}

// =============================================================================
// Sort Application
// =============================================================================

/**
 * Apply sort model to data array
 */
export function applySort<TData>(
  data: TData[],
  sortModel: SortModel[],
  getFieldValue: (row: TData, field: string) => CellValue,
): TData[] {
  return [...data].sort((a, b) => {
    for (const { colId, direction } of sortModel) {
      const aVal = getFieldValue(a, colId);
      const bVal = getFieldValue(b, colId);
      const comparison = compareValues(aVal, bVal);

      if (comparison !== 0) {
        return direction === "asc" ? comparison : -comparison;
      }
    }
    return 0;
  });
}
