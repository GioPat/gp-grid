// packages/core/src/indexed-data-store/distinct-values.ts

import type { CellValue } from "../types";

/**
 * Per-field refcounts of the distinct values currently held by the rows of
 * an IndexedDataStore, so the filter popup can list a field's values and
 * evict one the moment its last holder is removed or updated.
 *
 * Array cells are counted element-wise so tag-style columns expose
 * element-level distinct values. null/undefined never enter the index.
 * Per-mutation cost is O(fields) with constant-time Map operations.
 */
export class DistinctValueIndex {
  private readonly countsByField: Map<string, Map<CellValue, number>> = new Map();

  clear(): void {
    this.countsByField.clear();
  }

  /** Distinct values currently held for a field (insertion order). */
  get(field: string): CellValue[] {
    const counts = this.countsByField.get(field);
    return counts ? Array.from(counts.keys()) : [];
  }

  rebuild(rows: readonly unknown[]): void {
    this.clear();
    for (const row of rows) {
      this.addRow(row);
    }
  }

  addRow(row: unknown): void {
    forEachNonNullField(row, (field, value) => this.add(field, value));
  }

  removeRow(row: unknown): void {
    forEachNonNullField(row, (field, value) => this.remove(field, value));
  }

  /** Move one reference from `oldValue` to `newValue` for a field. */
  replace(field: string, oldValue: CellValue, newValue: CellValue): void {
    if (oldValue != null) {
      this.remove(field, oldValue);
    }
    if (newValue != null) {
      this.add(field, newValue);
    }
  }

  private add(field: string, value: unknown): void {
    let counts = this.countsByField.get(field);
    if (!counts) {
      counts = new Map();
      this.countsByField.set(field, counts);
    }
    forEachItem(value, (item) => incrementCount(counts, item));
  }

  private remove(field: string, value: unknown): void {
    const counts = this.countsByField.get(field);
    if (counts === undefined) return;
    forEachItem(value, (item) => decrementCount(counts, item));
  }
}

const forEachNonNullField = (
  row: unknown,
  visit: (field: string, value: unknown) => void,
): void => {
  if (typeof row !== "object" || row === null) return;
  for (const [field, value] of Object.entries(row as Record<string, unknown>)) {
    if (value == null) continue;
    visit(field, value);
  }
};

/** Visit a scalar once, or each non-null element of an array cell. */
const forEachItem = (value: unknown, visit: (item: CellValue) => void): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item != null) visit(item as CellValue);
    }
    return;
  }
  visit(value as CellValue);
};

const incrementCount = (counts: Map<CellValue, number>, value: CellValue): void => {
  counts.set(value, (counts.get(value) ?? 0) + 1);
};

const decrementCount = (counts: Map<CellValue, number>, value: CellValue): void => {
  const current = counts.get(value);
  if (current === undefined) return;
  if (current <= 1) {
    counts.delete(value);
    return;
  }
  counts.set(value, current - 1);
};
