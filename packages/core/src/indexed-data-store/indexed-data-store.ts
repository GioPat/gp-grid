// packages/core/src/indexed-data-store/indexed-data-store.ts

import type { CellValue, RowId } from "../types";
import { getFieldValue, setFieldValue } from "./field-helpers";
import { DistinctValueIndex } from "./distinct-values";

// Re-export RowId for convenience
export type { RowId } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface IndexedDataStoreOptions<TData> {
  /** Function to extract unique ID from row. Required for mutations. */
  getRowId: (row: TData) => RowId;
  /** Custom field accessor for nested properties */
  getFieldValue?: (row: TData, field: string) => CellValue;
}

// =============================================================================
// IndexedDataStore
// =============================================================================

/**
 * Row registry backing the mutable client data source.
 *
 * Holds rows in insertion order with an id → index map for O(1) lookup and a
 * refcounted distinct-value index per field (for filter UIs). Sorting and
 * filtering are applied by the data source on top of `getAllRows()`.
 */
export class IndexedDataStore<TData = unknown> {
  private rows: TData[] = [];
  private readonly rowById: Map<RowId, number> = new Map();
  private readonly distinctValues = new DistinctValueIndex();
  private readonly options: Required<IndexedDataStoreOptions<TData>>;

  constructor(options: IndexedDataStoreOptions<TData>, initialData: TData[] = []) {
    this.options = {
      getRowId: options.getRowId,
      getFieldValue: options.getFieldValue ?? getFieldValue,
    };
    this.setData(initialData);
  }

  // ===========================================================================
  // Data Initialization
  // ===========================================================================

  /** Clear all data and internal indexes. */
  clear(): void {
    this.rows = [];
    this.rowById.clear();
    this.distinctValues.clear();
  }

  /** Replace all data (used for initial load or full refresh). */
  setData(data: TData[]): void {
    this.rows = [...data];
    this.rebuildIdIndex();
    this.distinctValues.rebuild(this.rows);
  }

  // ===========================================================================
  // Query API
  // ===========================================================================

  getRowById(id: RowId): TData | undefined {
    const index = this.rowById.get(id);
    return index === undefined ? undefined : this.rows[index];
  }

  getTotalRowCount(): number {
    return this.rows.length;
  }

  /** All rows, in storage order, as a new array. */
  getAllRows(): TData[] {
    return [...this.rows];
  }

  /** Distinct values for a field (for filter UI). */
  getDistinctValues(field: string): CellValue[] {
    return this.distinctValues.get(field);
  }

  // ===========================================================================
  // Mutation API
  // ===========================================================================

  /** Append rows. Rows whose id already exists are skipped with a warning. */
  addRows(rows: TData[]): void {
    for (const row of rows) {
      this.addRow(row);
    }
  }

  private addRow(row: TData): void {
    const id = this.options.getRowId(row);
    if (this.rowById.has(id)) {
      console.warn(`Row with ID ${id} already exists. Skipping.`);
      return;
    }
    this.rowById.set(id, this.rows.length);
    this.rows.push(row);
    this.distinctValues.addRow(row);
  }

  /**
   * Remove rows by ID in a single pass. Returns the number of rows actually
   * removed (unknown ids are ignored).
   */
  removeRows(ids: RowId[]): number {
    const indicesToRemove = new Set<number>();
    for (const id of ids) {
      const index = this.rowById.get(id);
      if (index !== undefined) indicesToRemove.add(index);
    }
    if (indicesToRemove.size === 0) return 0;

    const kept: TData[] = [];
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]!;
      if (indicesToRemove.has(i)) {
        this.distinctValues.removeRow(row);
        continue;
      }
      kept.push(row);
    }
    this.rows = kept;
    this.rebuildIdIndex();
    return indicesToRemove.size;
  }

  /** Update a single field on a row, keeping the distinct-value index in sync. */
  updateCell(id: RowId, field: string, value: CellValue): void {
    const row = this.getRowById(id);
    if (row === undefined) {
      console.warn(`Row with ID ${id} not found.`);
      return;
    }
    const oldValue = this.options.getFieldValue(row, field);
    setFieldValue(row, field, value);
    this.distinctValues.replace(field, oldValue, value);
  }

  /** Update multiple fields on a row. */
  updateRow(id: RowId, data: Partial<TData>): void {
    for (const [field, value] of Object.entries(data)) {
      this.updateCell(id, field, value as CellValue);
    }
  }

  /**
   * Move a row from one position to another in storage order. When no sort
   * is active the new order is reflected on the next fetch.
   */
  moveRow(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.rows.length) return;
    if (toIndex < 0 || toIndex >= this.rows.length) return;

    const [row] = this.rows.splice(fromIndex, 1);
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
    this.rows.splice(adjustedTo, 0, row!);
    this.rebuildIdIndex();
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private rebuildIdIndex(): void {
    this.rowById.clear();
    for (let i = 0; i < this.rows.length; i++) {
      this.rowById.set(this.options.getRowId(this.rows[i]!), i);
    }
  }
}
