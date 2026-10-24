// packages/core/src/filtering/distinct-values.ts
// Collection of raw distinct values for the filter popup: deduplication by raw
// identity, the cap, and display ordering. Pure, so every scan source shares it.

import type { CellValue } from "../types/basic";
import type { RowAccess } from "../types/data-source";
import { getFieldValue } from "../indexed-data-store/field-helpers";
import { formatCellValue } from "../utils/format-helpers";
import { rawValueKey } from "./distinct-entries";

/** Reads the value at a position; `undefined` means there is nothing there. */
export type DistinctValueReader = (index: number) => CellValue | undefined;

export interface DistinctValueScan {
  values: CellValue[];
  /** True when the cap stopped the scan before every position was read. */
  truncated: boolean;
}

const compareAsStrings = (a: unknown, b: unknown): number => {
  const left = String(a);
  const right = String(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

/**
 * Dedup key and value to store. The key is the raw identity, never the display
 * label; arrays are sorted so different orderings share one key.
 */
export const normalizeDistinctValue = (value: CellValue): [string, CellValue] => {
  if (Array.isArray(value)) {
    const sorted = [...value].sort(compareAsStrings);
    return [rawValueKey(sorted), sorted];
  }
  return [rawValueKey(value), value];
};

/** Collect up to `maxValues` distinct raw values from `count` positions. */
export const collectDistinctValues = (
  count: number,
  readAt: DistinctValueReader,
  maxValues: number,
): DistinctValueScan => {
  const byKey = new Map<string, CellValue>();
  for (let index = 0; index < count; index++) {
    const value = readAt(index);
    if (value === undefined) continue;
    if (byKey.size >= maxValues) {
      return { values: [...byKey.values()], truncated: true };
    }
    const [key, normalized] = normalizeDistinctValue(value);
    if (byKey.has(key) === false) byKey.set(key, normalized);
  }
  return { values: [...byKey.values()], truncated: false };
};

export const cachedRowReader = <TData>(
  rows: Map<number, TData>,
  field: string,
): DistinctValueReader => (index) => {
  const row = rows.get(index);
  return row === undefined ? undefined : getFieldValue(row, field);
};

export const accessReader = (access: RowAccess, field: string): DistinctValueReader =>
  (index) => access.getValue(index, field);

/** Order values by display string, numerically aware and case-insensitive. */
export const sortDistinctValues = (
  values: CellValue[],
  formatter: ((value: CellValue) => string) | undefined,
): CellValue[] =>
  [...values].sort((a, b) =>
    formatCellValue(a, formatter).localeCompare(formatCellValue(b, formatter), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
