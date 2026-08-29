// packages/core/src/indexed-data-store/sorting.ts

import type { CellValue, SortModel } from "../types";
import { formatCellValue } from "../utils/format-helpers";

/** Characters consumed by a single base-36 hash chunk. */
const CHUNK_LENGTH = 10;

/** Number of 10-character chunks for string hashing (30 chars total) */
export const HASH_CHUNK_COUNT = 3;

/**
 * Map a character code to its base-36 sort weight: a-z to 0-25, 0-9 to 26-35,
 * anything else to 0.
 */
const toBase36Weight = (code: number): number => {
  if (code >= 97 && code <= 122) return code - 97;
  if (code >= 48 && code <= 57) return code - 48 + 26;
  return 0;
};

/**
 * Base-36 hash of the CHUNK_LENGTH characters starting at `start`.
 * Positions past the end of the string contribute 0, which keeps shorter
 * strings ordered before longer ones sharing the same prefix.
 */
const hashChunkAt = (s: string, start: number): number => {
  let hash = 0;
  for (let i = 0; i < CHUNK_LENGTH; i++) {
    const charIndex = start + i;
    const code = charIndex < s.length ? (s.codePointAt(charIndex) ?? 200) : 0;
    hash = hash * 36 + toBase36Weight(code);
  }
  return hash;
};

/** Sortable number from the first 10 characters of a string (base-36). */
const stringToSortableNumber = (str: string): number =>
  hashChunkAt(str.toLowerCase(), 0);

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
    const strA = Array.isArray(a) ? a.join(", ") : formatCellValue(a);
    const strB = Array.isArray(b) ? b.join(", ") : formatCellValue(b);
    return strA.localeCompare(strB);
  }

  // Try numeric comparison
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
    return aNum - bNum;
  }

  // Try date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }

  // Fall back to string comparison (handles plain objects via JSON.stringify)
  return formatCellValue(a).localeCompare(formatCellValue(b));
}

/**
 * Convert any cell value to a sortable number (worker sort pre-pass).
 * Strings are hashed from their first 10 characters; nulls sort last.
 */
export function toSortableNumber(value: CellValue): number {
  if (value == null) return Number.MAX_VALUE; // nulls sort last

  if (typeof value === "number") return value;

  if (value instanceof Date) return value.getTime();

  if (typeof value === "string") {
    return stringToSortableNumber(value);
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? Number.MAX_VALUE : stringToSortableNumber(value.join(", "));
  }

  if (typeof value === "object") {
    return stringToSortableNumber(JSON.stringify(value));
  }

  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
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
    hashes.push(hashChunkAt(s, chunk * CHUNK_LENGTH));
  }

  return hashes;
}

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
