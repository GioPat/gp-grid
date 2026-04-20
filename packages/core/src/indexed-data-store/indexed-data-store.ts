// packages/core/src/indexed-data-store/indexed-data-store.ts

import type {
  CellValue,
  RowId,
  SortModel,
  FilterModel,
  DataSourceRequest,
  DataSourceResponse,
} from "../types";
import { getFieldValue, setFieldValue } from "./field-helpers";
import {
  computeRowSortHashes,
  compareRowsByHashes,
  compareRowsDirect,
} from "./sorting";
import { rowPassesFilter } from "../filtering";

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

/** Hash cache for a single row */
export interface RowSortCache {
  /** Map: sortModelHash -> computed hashes for that sort configuration */
  hashes: Map<string, number[]>;
}

// =============================================================================
// IndexedDataStore
// =============================================================================

/**
 * Efficient data structure for incremental operations on grid data.
 * Supports:
 * - O(1) lookup by row ID
 * - O(log n) binary insertion to maintain sort order
 * - Filter state caching with distinct values
 * - Hash caching for fast sorted comparisons
 */
export class IndexedDataStore<TData = unknown> {
  // Core storage
  private rows: TData[] = [];
  private readonly rowById: Map<RowId, number> = new Map(); // ID -> index in rows[]

  // Sort state
  private sortedIndices: number[] = []; // Indices into rows[] in sorted order
  private sortModel: SortModel[] = [];
  private sortModelHash: string = "";

  // Filter state
  private filterModel: FilterModel = {};
  private filteredIndices: Set<number> = new Set(); // Indices that pass filter
  // field -> (value -> count of rows currently holding that value). Counts
  // let us correctly evict a value from the filter popup when the last
  // row holding it is removed or updated. Per-mutation cost is O(fields)
  // with constant-time Map ops (see addToDistinctValues / decrementDistinctValues).
  private readonly distinctValues: Map<string, Map<CellValue, number>> = new Map();

  // Hash cache for sorted comparisons
  private rowSortCache: Map<number, RowSortCache> = new Map();

  // Options
  private readonly options: Required<IndexedDataStoreOptions<TData>>;

  constructor(
    options: IndexedDataStoreOptions<TData>,
    initialData: TData[] = [],
  ) {
    this.options = {
      getRowId: options.getRowId,
      getFieldValue: options.getFieldValue ?? getFieldValue,
    };

    // Initialize with data
    this.setData(initialData);
  }

  // ===========================================================================
  // Data Initialization
  // ===========================================================================

  /**
   * Clear all data and internal caches.
   * Used for proper memory cleanup when the store is no longer needed.
   */
  clear(): void {
    this.rows = [];
    this.rowById.clear();
    this.sortedIndices = [];
    this.filterModel = {};
    this.filteredIndices.clear();
    this.rowSortCache.clear();
    this.distinctValues.clear();
    this.sortModel = [];
    this.sortModelHash = "";
  }

  /**
   * Replace all data (used for initial load or full refresh).
   */
  setData(data: TData[]): void {
    this.rows = [...data];
    this.rowById.clear();
    this.rowSortCache.clear();
    this.distinctValues.clear();

    // Build ID index
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]!;
      const id = this.options.getRowId(row);
      this.rowById.set(id, i);
    }

    // Build sorted indices
    this.rebuildSortedIndices();

    // Apply filters
    this.rebuildFilteredIndices();

    // Build distinct values cache
    this.rebuildDistinctValues();
  }

  // ===========================================================================
  // Query API
  // ===========================================================================

  /**
   * Query data with sorting, filtering, and pagination.
   * Compatible with DataSource.fetch() interface.
   */
  query(request: DataSourceRequest): DataSourceResponse<TData> {
    // Update sort model (clear if undefined)
    this.setSortModel(request.sort ?? []);

    // Update filter model (clear if undefined)
    this.setFilterModel(request.filter ?? {});

    // Get visible rows (filtered + sorted)
    const visibleIndices = this.getVisibleIndices();
    const totalRows = visibleIndices.length;

    // Apply pagination
    const { pageIndex, pageSize } = request.pagination;
    const startIndex = pageIndex * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRows);

    const rows: TData[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      const rowIndex = visibleIndices[i];
      if (rowIndex !== undefined) {
        rows.push(this.rows[rowIndex]!);
      }
    }

    return { rows, totalRows };
  }

  /**
   * Get row by ID.
   */
  getRowById(id: RowId): TData | undefined {
    const index = this.rowById.get(id);
    return index === undefined ? undefined : this.rows[index];
  }

  /**
   * Get row by index.
   */
  getRowByIndex(index: number): TData | undefined {
    return this.rows[index];
  }

  /**
   * Get total row count (unfiltered).
   */
  getTotalRowCount(): number {
    return this.rows.length;
  }

  /**
   * Get all rows as a new array.
   * Used for direct data access when bypassing store's query system.
   */
  getAllRows(): TData[] {
    return [...this.rows];
  }

  /**
   * Move a row from one position to another in the raw data array.
   * This reorders the underlying data; when no sort is active, the new order
   * is reflected immediately on the next fetch.
   */
  moveRow(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= this.rows.length) return;
    if (toIndex < 0 || toIndex >= this.rows.length) return;

    const [row] = this.rows.splice(fromIndex, 1);
    const adjustedTo = toIndex > fromIndex ? toIndex - 1 : toIndex;
    this.rows.splice(adjustedTo, 0, row!);

    // Rebuild index map since positions changed
    this.rowById.clear();
    for (let i = 0; i < this.rows.length; i++) {
      this.rowById.set(this.options.getRowId(this.rows[i]!), i);
    }

    // Reset sorted indices to identity order and clear sort cache
    this.sortedIndices = Array.from({ length: this.rows.length }, (_, i) => i);
    this.rowSortCache.clear();
  }

  /**
   * Get visible row count (after filtering).
   */
  getVisibleRowCount(): number {
    if (Object.keys(this.filterModel).length === 0) {
      return this.rows.length;
    }
    return this.filteredIndices.size;
  }

  /**
   * Get distinct values for a field (for filter UI).
   */
  getDistinctValues(field: string): CellValue[] {
    const counts = this.distinctValues.get(field);
    return counts ? Array.from(counts.keys()) : [];
  }

  // ===========================================================================
  // Mutation API
  // ===========================================================================

  /**
   * Add rows to the store.
   * Rows are inserted at their correct sorted position.
   */
  addRows(rows: TData[]): void {
    for (const row of rows) {
      this.addRow(row);
    }
  }

  /**
   * Add a single row.
   */
  private addRow(row: TData): void {
    const id = this.options.getRowId(row);

    // Check for duplicate
    if (this.rowById.has(id)) {
      console.warn(`Row with ID ${id} already exists. Skipping.`);
      return;
    }

    // Add to rows array
    const index = this.rows.length;
    this.rows.push(row);
    this.rowById.set(id, index);

    // Update distinct values
    this.updateDistinctValuesForRow(row, "add");

    // Compute and cache sort hashes
    if (this.sortModel.length > 0) {
      this.computeRowHashes(index, row);
    }

    // Insert into sorted indices at correct position
    if (this.sortModel.length > 0) {
      const insertPos = this.binarySearchInsertPosition(index);
      this.sortedIndices.splice(insertPos, 0, index);
    } else {
      this.sortedIndices.push(index);
    }

    // Update filter state
    if (this.rowPassesFilter(row)) {
      this.filteredIndices.add(index);
    }
  }

  /**
   * Remove rows by ID. Returns the number of rows actually removed (unknown
   * ids are ignored).
   */
  removeRows(ids: RowId[]): number {
    const indicesToRemove: number[] = [];

    for (const id of ids) {
      const index = this.rowById.get(id);
      if (index !== undefined) {
        indicesToRemove.push(index);
      }
    }

    if (indicesToRemove.length === 0) return 0;

    // Sort indices in descending order to remove from end first
    indicesToRemove.sort((a, b) => b - a);

    for (const index of indicesToRemove) {
      this.removeRowByIndex(index);
    }
    return indicesToRemove.length;
  }

  /**
   * Remove a single row by index.
   */
  private removeRowByIndex(index: number): void {
    const row = this.rows[index];
    if (!row) return;

    const id = this.options.getRowId(row);

    // Update distinct values
    this.updateDistinctValuesForRow(row, "remove");

    // Remove from sorted indices
    const sortedPos = this.sortedIndices.indexOf(index);
    if (sortedPos !== -1) {
      this.sortedIndices.splice(sortedPos, 1);
    }

    // Remove from filtered indices
    this.filteredIndices.delete(index);

    // Remove from hash cache
    this.rowSortCache.delete(index);

    // Remove from ID map
    this.rowById.delete(id);

    // Remove from rows array
    this.rows.splice(index, 1);

    // Update indices in maps (all indices after removed one shift down)
    this.reindexAfterRemoval(index);
  }

  /**
   * Update indices after a row removal.
   */
  private reindexAfterRemoval(removedIndex: number): void {
    // Update rowById map
    for (const [id, idx] of this.rowById.entries()) {
      if (idx > removedIndex) {
        this.rowById.set(id, idx - 1);
      }
    }

    // Update sortedIndices
    for (let i = 0; i < this.sortedIndices.length; i++) {
      if (this.sortedIndices[i]! > removedIndex) {
        this.sortedIndices[i]!--;
      }
    }

    // Update filteredIndices
    const newFiltered = new Set<number>();
    for (const idx of this.filteredIndices) {
      if (idx > removedIndex) {
        newFiltered.add(idx - 1);
      } else {
        newFiltered.add(idx);
      }
    }
    this.filteredIndices = newFiltered;

    // Update hash cache keys
    const newCache = new Map<number, RowSortCache>();
    for (const [idx, cache] of this.rowSortCache) {
      if (idx > removedIndex) {
        newCache.set(idx - 1, cache);
      } else {
        newCache.set(idx, cache);
      }
    }
    this.rowSortCache = newCache;
  }

  /**
   * Update a cell value.
   */
  updateCell(id: RowId, field: string, value: CellValue): void {
    const index = this.rowById.get(id);
    if (index === undefined) {
      console.warn(`Row with ID ${id} not found.`);
      return;
    }

    const row = this.rows[index]!;
    const oldValue = this.options.getFieldValue(row, field);

    // Update the value
    setFieldValue(row, field, value);

    // Update distinct values
    this.updateDistinctValueForField(field, oldValue, value);

    // Check if this field affects current sort
    const affectsSort = this.sortModel.some((s) => s.colId === field);

    if (affectsSort && this.sortModel.length > 0) {
      // Recompute hash for this row
      this.computeRowHashes(index, row);

      // Find current position and remove
      const currentPos = this.sortedIndices.indexOf(index);
      if (currentPos !== -1) {
        this.sortedIndices.splice(currentPos, 1);
      }

      // Binary insert at new position
      const newPos = this.binarySearchInsertPosition(index);
      this.sortedIndices.splice(newPos, 0, index);
    }

    // Check if this field affects current filter
    const affectsFilter = field in this.filterModel;

    if (affectsFilter) {
      const passesFilter = this.rowPassesFilter(row);
      if (passesFilter) {
        this.filteredIndices.add(index);
      } else {
        this.filteredIndices.delete(index);
      }
    }
  }

  /**
   * Update multiple fields on a row.
   */
  updateRow(id: RowId, data: Partial<TData>): void {
    for (const [field, value] of Object.entries(data)) {
      this.updateCell(id, field, value as CellValue);
    }
  }

  // ===========================================================================
  // Sort Management
  // ===========================================================================

  /**
   * Set the sort model. Triggers full re-sort if model changed.
   */
  setSortModel(model: SortModel[]): void {
    const newHash = JSON.stringify(model);
    if (newHash === this.sortModelHash) {
      return; // No change
    }

    this.sortModelHash = newHash;
    this.sortModel = [...model];

    // Full re-sort required
    this.rebuildHashCache();
    this.rebuildSortedIndices();
  }

  /**
   * Get current sort model.
   */
  getSortModel(): SortModel[] {
    return [...this.sortModel];
  }

  // ===========================================================================
  // Filter Management
  // ===========================================================================

  /**
   * Set the filter model.
   */
  setFilterModel(model: FilterModel): void {
    const newHash = JSON.stringify(model);
    const oldHash = JSON.stringify(this.filterModel);

    if (newHash === oldHash) {
      return; // No change
    }

    this.filterModel = { ...model };
    this.rebuildFilteredIndices();
  }

  /**
   * Get current filter model.
   */
  getFilterModel(): FilterModel {
    return { ...this.filterModel };
  }

  // ===========================================================================
  // Private: Sorting
  // ===========================================================================

  /**
   * Rebuild sorted indices (full re-sort).
   */
  private rebuildSortedIndices(): void {
    // Create array of all indices
    this.sortedIndices = Array.from({ length: this.rows.length }, (_, i) => i);

    if (this.sortModel.length === 0) {
      return; // No sort, keep original order
    }

    // Sort using cached hashes or direct comparison
    this.sortedIndices.sort((a, b) => this.compareRows(a, b));
  }

  /**
   * Rebuild hash cache for all rows.
   */
  private rebuildHashCache(): void {
    this.rowSortCache.clear();

    if (this.sortModel.length === 0) {
      return;
    }

    for (let i = 0; i < this.rows.length; i++) {
      this.computeRowHashes(i, this.rows[i]!);
    }
  }

  /**
   * Compute and cache sort hashes for a row.
   */
  private computeRowHashes(rowIndex: number, row: TData): void {
    if (this.sortModel.length === 0) return;

    const hashes = computeRowSortHashes(row, {
      sortModel: this.sortModel,
      sortModelHash: this.sortModelHash,
      getFieldValue: this.options.getFieldValue,
    });

    let cache = this.rowSortCache.get(rowIndex);
    if (!cache) {
      cache = { hashes: new Map() };
      this.rowSortCache.set(rowIndex, cache);
    }
    cache.hashes.set(this.sortModelHash, hashes);
  }

  /**
   * Compare two rows using cached hashes.
   */
  private compareRows(indexA: number, indexB: number): number {
    const cacheA = this.rowSortCache.get(indexA);
    const cacheB = this.rowSortCache.get(indexB);

    const hashesA = cacheA?.hashes.get(this.sortModelHash);
    const hashesB = cacheB?.hashes.get(this.sortModelHash);

    const hashResult = compareRowsByHashes(hashesA, hashesB, this.sortModel);
    if (hashResult !== null) {
      return hashResult;
    }

    // Fallback to direct comparison
    return compareRowsDirect(
      this.rows[indexA]!,
      this.rows[indexB]!,
      this.sortModel,
      this.options.getFieldValue,
    );
  }

  /**
   * Binary search for insertion position in sortedIndices.
   */
  private binarySearchInsertPosition(rowIndex: number): number {
    let low = 0;
    let high = this.sortedIndices.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const midIndex = this.sortedIndices[mid]!;

      if (this.compareRows(rowIndex, midIndex) > 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  // ===========================================================================
  // Private: Filtering
  // ===========================================================================

  /**
   * Rebuild filtered indices.
   */
  private rebuildFilteredIndices(): void {
    this.filteredIndices.clear();

    const hasFilters = Object.entries(this.filterModel).some(
      ([, value]) => value != null,
    );

    if (!hasFilters) {
      // No filters, all rows visible
      return;
    }

    for (let i = 0; i < this.rows.length; i++) {
      if (this.rowPassesFilter(this.rows[i]!)) {
        this.filteredIndices.add(i);
      }
    }
  }

  /**
   * Check if a row passes the current filter.
   */
  private rowPassesFilter(row: TData): boolean {
    return rowPassesFilter(row, this.filterModel, this.options.getFieldValue);
  }

  /**
   * Get visible indices (filtered + sorted).
   */
  private getVisibleIndices(): number[] {
    const hasFilters =
      Object.entries(this.filterModel).some(([, v]) => v != null);

    if (!hasFilters) {
      return this.sortedIndices;
    }

    // Filter the sorted indices
    return this.sortedIndices.filter((idx) => this.filteredIndices.has(idx));
  }

  // ===========================================================================
  // Private: Distinct Values
  // ===========================================================================

  /**
   * Rebuild distinct values cache for all fields.
   */
  private rebuildDistinctValues(): void {
    this.distinctValues.clear();

    for (const row of this.rows) {
      this.updateDistinctValuesForRow(row, "add");
    }
  }

  /**
   * Update distinct-value refcounts when a row is added or removed.
   * Skips null/undefined cell values — they never enter the filter popup.
   */
  private updateDistinctValuesForRow(
    row: TData,
    operation: "add" | "remove",
  ): void {
    if (typeof row !== "object" || row === null) return;

    for (const [field, value] of Object.entries(
      row as Record<string, unknown>,
    )) {
      if (value == null) continue;
      if (operation === "add") {
        this.addToDistinctValues(field, value);
      } else {
        this.decrementDistinctValues(field, value);
      }
    }
  }

  /**
   * Update distinct-value refcounts when a cell value changes: decrement
   * the old value's count (evicting it if this was the last reference)
   * and increment the new value's count.
   */
  private updateDistinctValueForField(
    field: string,
    oldValue: CellValue,
    newValue: CellValue,
  ): void {
    if (oldValue != null) {
      this.decrementDistinctValues(field, oldValue);
    }
    if (newValue != null) {
      this.addToDistinctValues(field, newValue);
    }
  }

  /**
   * Add a value (scalar or array) to the distinct-value refcount map.
   * Creates the field's count map lazily. For arrays, each non-null item
   * is counted individually so tag-column filters see element-level
   * distinct values.
   */
  private addToDistinctValues(field: string, value: unknown): void {
    let counts = this.distinctValues.get(field);
    if (!counts) {
      counts = new Map();
      this.distinctValues.set(field, counts);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) incrementCount(counts, item as CellValue);
      }
      return;
    }
    incrementCount(counts, value as CellValue);
  }

  /**
   * Decrement refcount(s) for a value (scalar or array). When a count
   * reaches zero the key is deleted so getDistinctValues() no longer
   * returns stale values after the last holder is removed.
   */
  private decrementDistinctValues(field: string, value: unknown): void {
    const counts = this.distinctValues.get(field);
    if (counts === undefined) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) decrementCount(counts, item as CellValue);
      }
      return;
    }
    decrementCount(counts, value as CellValue);
  }
}

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
