import type {
  ColumnDefinition,
  CellValue,
  SortModel,
  SortDirection,
  FilterModel,
  ColumnFilterModel,
} from "./../types";
import { createInstructionEmitter, getFieldValue, formatCellValue } from "./../utils";

const DISTINCT_SCAN_WARN_THRESHOLD = 10_000;

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
  private readonly options: SortFilterManagerOptions<TData>;
  private readonly emitter = createInstructionEmitter();

  // Sort & Filter state
  private sortModel: SortModel[] = [];
  private filterModel: FilterModel = {};
  private openFilterColIndex: number | null = null;
  private readonly scanWarnedCols = new Set<string>();

  // Public API delegates to emitter
  onInstruction = this.emitter.onInstruction;
  private readonly emit = this.emitter.emit;

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

    if (addToExisting) {
      if (direction === null && existingIndex >= 0) {
        this.sortModel.splice(existingIndex, 1);
      } else if (existingIndex >= 0) {
        this.sortModel[existingIndex]!.direction = direction;
      } else {
        this.sortModel.push({ colId, direction });
      }
    } else {
      this.sortModel = direction === null ? [] : [{ colId, direction }];
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
        filter.conditions?.length === 0);

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
   * Get distinct values for a column (for filter dropdowns).
   *
   * When the column defines `distinctValues`, that list is used directly
   * (deduplicated + sorted by display string). Otherwise the manager scans
   * every cached row to compute the set. The previous stride-sampling
   * fallback was removed because the stride could share a factor with a
   * repeating value pool, causing some values to be unreachable (the
   * `bio` field in the demo dataset was a real example: stride 15 with a
   * pool size of 6 yielded only 2 of 6 values).
   *
   * For datasets above {@link DISTINCT_SCAN_WARN_THRESHOLD}, a one-time
   * console warning advises the consumer to pre-supply `distinctValues`
   * on the column to skip the full scan.
   */
  getDistinctValuesForColumn(
    colId: string,
    maxValues: number = 500,
  ): CellValue[] {
    const columns = this.options.getColumns();
    const column = columns.find((c) => (c.colId ?? c.field) === colId);
    if (!column) return [];

    const formatter = column.valueFormatter;

    const sourceValues = column.distinctValues
      ?? this.scanDistinctValues(column, maxValues);

    const valuesMap = new Map<string, CellValue>();
    for (const value of sourceValues) {
      const [key, normalized] = this.normalizeDistinctValue(value, formatter);
      if (!valuesMap.has(key)) {
        valuesMap.set(key, normalized);
        if (valuesMap.size >= maxValues) break;
      }
    }

    const results = Array.from(valuesMap.values());
    results.sort((a, b) => {
      const strA = formatCellValue(a, formatter);
      const strB = formatCellValue(b, formatter);
      return strA.localeCompare(strB, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    return results;
  }

  private scanDistinctValues(
    column: ColumnDefinition,
    maxValues: number,
  ): CellValue[] {
    const cachedRows = this.options.getCachedRows();
    const total = cachedRows.size;
    const colId = column.colId ?? column.field;

    if (total > DISTINCT_SCAN_WARN_THRESHOLD && !this.scanWarnedCols.has(colId)) {
      this.scanWarnedCols.add(colId);
      console.warn(
        `[gp-grid] Scanning ${total} rows to compute distinct values for column "${colId}". `
        + `Pre-supply ColumnDefinition.distinctValues to skip this scan.`,
      );
    }

    const formatter = column.valueFormatter;
    const valuesMap = new Map<string, CellValue>();
    for (let i = 0; i < total; i++) {
      const row = cachedRows.get(i);
      if (row === undefined) continue;
      const value = getFieldValue(row, column.field);
      const [key, normalized] = this.normalizeDistinctValue(value, formatter);
      if (!valuesMap.has(key)) {
        valuesMap.set(key, normalized);
        if (valuesMap.size >= maxValues) break;
      }
    }
    return Array.from(valuesMap.values());
  }

  /**
   * Normalize a cell value into a dedup key and the value to store.
   * Arrays are sorted lexicographically so different orderings produce the same key.
   * When a formatter is provided it is applied to the key so that two raw values
   * that render identically are treated as the same distinct entry.
   */
  private normalizeDistinctValue(
    value: CellValue,
    formatter?: (v: CellValue) => string,
  ): [string, CellValue] {
    if (Array.isArray(value)) {
      const sorted = [...value].sort((a, b) => {
        const sa = String(a);
        const sb = String(b);
        if (sa === sb) return 0;
        return sa < sb ? -1 : 1;
      });
      const key = formatter ? formatter(sorted) : JSON.stringify(sorted);
      return [key, sorted];
    }
    const key = formatter ? formatter(value) : JSON.stringify(value);
    return [key, value];
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
