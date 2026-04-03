import type {
  ColumnDefinition,
  CellValue,
  SortModel,
  SortDirection,
  FilterModel,
  ColumnFilterModel,
} from "./../types";
import { createInstructionEmitter, getFieldValue, formatCellValue } from "./../utils";

// =============================================================================
// Types
// =============================================================================

export interface SortFilterManagerOptions<TData> {
  /** Get all columns */
  getColumns: () => ColumnDefinition[];
  /** Check if sorting is enabled globally */
  isSortingEnabled: () => boolean;
  /** Get cached rows for distinct value computation */
  getCachedRows: () => Map<number, TData>;
  /** Called when sort/filter changes to trigger data refresh */
  onSortFilterChange: () => Promise<void>;
  /** Called after data refresh to update UI */
  onDataRefreshed: () => void;
}

// =============================================================================
// SortFilterManager
// =============================================================================

/**
 * Manages sorting and filtering state and operations.
 */
export class SortFilterManager<TData = Record<string, unknown>> {
  private options: SortFilterManagerOptions<TData>;
  private emitter = createInstructionEmitter();

  // Sort & Filter state
  private sortModel: SortModel[] = [];
  private filterModel: FilterModel = {};
  private openFilterColIndex: number | null = null;

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  private emit = this.emitter.emit;

  constructor(options: SortFilterManagerOptions<TData>) {
    this.options = options;
  }

  // ===========================================================================
  // Sort Operations
  // ===========================================================================

  async setSort(
    colId: string,
    direction: SortDirection | null,
    addToExisting: boolean = false,
  ): Promise<void> {
    // Check if sorting is enabled globally
    if (!this.options.isSortingEnabled()) return;

    // Check if sorting is enabled for this column
    const columns = this.options.getColumns();
    const column = columns.find((c) => (c.colId ?? c.field) === colId);
    if (column?.sortable === false) return;

    const existingIndex = this.sortModel.findIndex((s) => s.colId === colId);

    if (!addToExisting) {
      this.sortModel = direction === null ? [] : [{ colId, direction }];
    } else {
      if (direction === null) {
        if (existingIndex >= 0) {
          this.sortModel.splice(existingIndex, 1);
        }
      } else if (existingIndex >= 0) {
        this.sortModel[existingIndex]!.direction = direction;
      } else {
        this.sortModel.push({ colId, direction });
      }
    }

    await this.options.onSortFilterChange();
    this.options.onDataRefreshed();
  }

  getSortModel(): SortModel[] {
    return [...this.sortModel];
  }

  // ===========================================================================
  // Filter Operations
  // ===========================================================================

  async setFilter(
    colId: string,
    filter: ColumnFilterModel | string | null,
  ): Promise<void> {
    const columns = this.options.getColumns();
    const column = columns.find((c) => (c.colId ?? c.field) === colId);
    if (column?.filterable === false) return;

    // Handle null, empty string, or empty conditions
    const isEmpty =
      filter === null ||
      (typeof filter === "string" && filter.trim() === "") ||
      (typeof filter === "object" &&
        filter.conditions &&
        filter.conditions.length === 0);

    if (isEmpty) {
      delete this.filterModel[colId];
    } else if (typeof filter === "string") {
      // Convert old string format to new ColumnFilterModel format
      this.filterModel[colId] = {
        conditions: [{ type: "text", operator: "contains", value: filter }],
        combination: "and",
      };
    } else {
      this.filterModel[colId] = filter;
    }

    await this.options.onSortFilterChange();
    this.options.onDataRefreshed();
  }

  getFilterModel(): FilterModel {
    return { ...this.filterModel };
  }

  /**
   * Check if a column has an active filter
   */
  hasActiveFilter(colId: string): boolean {
    const filter = this.filterModel[colId];
    if (!filter) return false;
    return filter.conditions.length > 0;
  }

  // ===========================================================================
  // Column Checks
  // ===========================================================================

  /**
   * Check if a column is sortable
   */
  isColumnSortable(colIndex: number): boolean {
    if (!this.options.isSortingEnabled()) return false;
    const columns = this.options.getColumns();
    const column = columns[colIndex];
    return column?.sortable !== false;
  }

  /**
   * Check if a column is filterable
   */
  isColumnFilterable(colIndex: number): boolean {
    const columns = this.options.getColumns();
    const column = columns[colIndex];
    return column?.filterable !== false;
  }

  // ===========================================================================
  // Distinct Values
  // ===========================================================================

  /**
   * Get distinct values for a column (for filter dropdowns)
   * For array-type columns (like tags), each unique array combination is returned.
   * Arrays are sorted internally for consistent comparison.
   * Limited to maxValues distinct results and maxScanRows rows scanned.
   * The row scan cap prevents hangs on low-cardinality columns (e.g. a tags column
   * with only ~100 distinct combinations in 1.5M rows would otherwise scan every row).
   */
  getDistinctValuesForColumn(
    colId: string,
    maxValues: number = 500,
    maxScanRows: number = 100000,
  ): CellValue[] {
    const columns = this.options.getColumns();
    const column = columns.find((c) => (c.colId ?? c.field) === colId);
    if (!column) return [];

    const cachedRows = this.options.getCachedRows();
    const valuesMap = new Map<string, CellValue>();
    let rowsScanned = 0;

    for (const row of cachedRows.values()) {
      if (++rowsScanned > maxScanRows) break;
      const value = getFieldValue(row, column.field);

      if (Array.isArray(value)) {
        // Sort array items with a simple lexicographic comparison for consistent
        // key generation. Locale-aware sort here would call localeCompare for
        // every row in potentially-large datasets (O(n) rows × O(k) comparisons)
        // which is ~100x slower than basic string comparison.
        const sortedArray = [...value].sort((a, b) => {
          const sa = String(a);
          const sb = String(b);
          return sa < sb ? -1 : sa > sb ? 1 : 0;
        });
        const key = JSON.stringify(sortedArray);
        if (!valuesMap.has(key)) {
          valuesMap.set(key, sortedArray);
          if (valuesMap.size >= maxValues) break;
        }
      } else {
        const key = JSON.stringify(value);
        if (!valuesMap.has(key)) {
          valuesMap.set(key, value);
          if (valuesMap.size >= maxValues) break;
        }
      }
    }

    // Sort the results
    const results = Array.from(valuesMap.values());
    results.sort((a, b) => {
      const strA = formatCellValue(a);
      const strB = formatCellValue(b);
      return strA.localeCompare(strB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    return results;
  }

  // ===========================================================================
  // Filter Popup
  // ===========================================================================

  /**
   * Open filter popup for a column (toggles if already open for same column)
   */
  openFilterPopup(
    colIndex: number,
    anchorRect: { top: number; left: number; width: number; height: number },
  ): void {
    // If clicking on the same column's filter icon, close the popup
    if (this.openFilterColIndex === colIndex) {
      this.closeFilterPopup();
      return;
    }

    const columns = this.options.getColumns();
    const column = columns[colIndex];
    if (!column || !this.isColumnFilterable(colIndex)) return;

    const colId = column.colId ?? column.field;
    const distinctValues = this.getDistinctValuesForColumn(colId);

    this.openFilterColIndex = colIndex;
    this.emit({
      type: "OPEN_FILTER_POPUP",
      colIndex,
      column,
      anchorRect,
      distinctValues,
      currentFilter: this.filterModel[colId],
    });
  }

  /**
   * Close filter popup
   */
  closeFilterPopup(): void {
    this.openFilterColIndex = null;
    this.emit({ type: "CLOSE_FILTER_POPUP" });
  }

  // ===========================================================================
  // Header Info
  // ===========================================================================

  /**
   * Get sort info map for header rendering
   */
  getSortInfoMap(): Map<string, { direction: SortDirection; index: number }> {
    const sortInfoMap = new Map<
      string,
      { direction: SortDirection; index: number }
    >();
    this.sortModel.forEach((sort, index) => {
      sortInfoMap.set(sort.colId, {
        direction: sort.direction,
        index: index + 1,
      });
    });
    return sortInfoMap;
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  destroy(): void {
    this.emitter.clearListeners();
    this.sortModel = [];
    this.filterModel = {};
    this.openFilterColIndex = null;
  }
}
