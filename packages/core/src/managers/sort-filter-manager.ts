import type {
  ColumnDefinition,
  CellValue,
  SortModel,
  SortDirection,
  FilterModel,
  ColumnFilterInput,
  ColumnFilterModel,
} from "./../types";
import { createInstructionEmitter, getFieldValue, formatCellValue } from "./../utils";
import { rawValueKey } from "../filtering/distinct-entries";
import { normalizeColumnFilterModel } from "../filtering/normalize";

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
  private readonly truncationWarnedCols = new Set<string>();
  private readonly typeMismatchWarnedCols = new Set<string>();

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
    filter: ColumnFilterInput | string | null,
  ): Promise<void> {
    const columns = this.options.getColumns();
    const column = columns.find((c) => (c.colId ?? c.field) === colId);
    if (column?.filterable === false) return;

    // Handle null or an empty legacy string before canonical normalization.
    const isEmpty =
      filter === null ||
      (typeof filter === "string" && filter.trim() === "");

    if (isEmpty) {
      delete this.filterModel[colId];
    } else if (typeof filter === "string") {
      // Convert old string format to new ColumnFilterModel format
      this.filterModel[colId] = {
        groups: [{
          conditions: [{ type: "text", operator: "contains", value: filter }],
          combination: "and",
        }],
        combination: "and",
      };
    } else {
      const normalizedFilter = normalizeColumnFilterModel(filter);
      const hasConditions = normalizedFilter.groups.some(
        (group) => group.conditions.length > 0,
      );
      if (hasConditions === false) {
        delete this.filterModel[colId];
      } else {
        this.warnTypeMismatchedSelectedValues(colId, column, normalizedFilter);
        this.filterModel[colId] = normalizedFilter;
      }
    }

    await this.options.onSortFilterChange();
    this.options.onDataRefreshed();
  }

  /**
   * Lint for hand-constructed filter models: values-mode `selectedValues`
   * match by strict raw identity (`"5"` never matches `5`, an ISO string
   * never matches a `Date`), so an all-string selection on a column whose
   * raw type is not a string will match nothing. This typically comes from
   * a lossy round-trip — filter state restored via `JSON.parse` or built
   * from URL params, where numbers and Dates arrive as strings. The mistake
   * is otherwise silent because `Set<string>` typechecks against
   * `Set<CellValue>`; warn once per column.
   */
  private warnTypeMismatchedSelectedValues(
    colId: string,
    column: ColumnDefinition | undefined,
    filter: ColumnFilterModel,
  ): void {
    const dataType = column?.cellDataType;
    const rawTypeIsString =
      dataType !== "number" &&
      dataType !== "boolean" &&
      dataType !== "date" &&
      dataType !== "dateTime";
    if (rawTypeIsString) return;
    if (this.typeMismatchWarnedCols.has(colId)) return;

    const hasStringOnlySelection = filter.groups.some((group) =>
      group.conditions.some(
        (condition) =>
          condition.type === "text" &&
          condition.selectedValues !== undefined &&
          condition.selectedValues.size > 0 &&
          [...condition.selectedValues].every((v) => typeof v === "string"),
      ),
    );
    if (hasStringOnlySelection === false) return;

    this.typeMismatchWarnedCols.add(colId);
    console.warn(
      `[gp-grid] Filter on column "${colId}" (cellDataType "${dataType}") has `
      + `selectedValues containing only strings. Values-mode filters match raw `
      + `values by strict identity, so this selection will likely match nothing. `
      + `If this model was restored from JSON or URL params, revive the values `
      + `to their raw types (e.g. Number(v), new Date(v)) before applying it.`,
    );
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
    return filter.groups.some((group) => group.conditions.length > 0);
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
   *
   * Values are deduplicated by RAW identity ({@link rawValueKey}), not by
   * display label: when a `valueFormatter` collapses several raw values into
   * one label, every raw value survives so the popup can select them all.
   * Consequently `maxValues` caps raw values, not labels. If the cap
   * truncates the domain of a formatted column, a one-time warning is
   * emitted because ticking a label can no longer cover unscanned raws.
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
      if (valuesMap.size >= maxValues) {
        this.warnTruncatedFormattedDomain(colId, formatter);
        break;
      }
      const [key, normalized] = this.normalizeDistinctValue(value);
      if (!valuesMap.has(key)) {
        valuesMap.set(key, normalized);
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

    const valuesMap = new Map<string, CellValue>();
    for (let i = 0; i < total; i++) {
      const row = cachedRows.get(i);
      if (row === undefined) continue;
      if (valuesMap.size >= maxValues) {
        this.warnTruncatedFormattedDomain(colId, column.valueFormatter);
        break;
      }
      const value = getFieldValue(row, column.field);
      const [key, normalized] = this.normalizeDistinctValue(value);
      if (!valuesMap.has(key)) {
        valuesMap.set(key, normalized);
      }
    }
    return Array.from(valuesMap.values());
  }

  /**
   * Normalize a cell value into a dedup key and the value to store.
   * Arrays are sorted lexicographically so different orderings produce the
   * same key. The key is the RAW identity ({@link rawValueKey}) — display
   * formatting is intentionally not part of it, so raw values that share a
   * label all survive deduplication and the values-mode filter can select
   * every one of them.
   */
  private normalizeDistinctValue(value: CellValue): [string, CellValue] {
    if (Array.isArray(value)) {
      const sorted = [...value].sort((a, b) => {
        const sa = String(a);
        const sb = String(b);
        if (sa === sb) return 0;
        return sa < sb ? -1 : 1;
      });
      return [rawValueKey(sorted), sorted];
    }
    return [rawValueKey(value), value];
  }

  /**
   * Values-mode filtering matches raw values, so when the distinct scan of a
   * formatted column is cut off at the cap, ticking a label cannot cover the
   * raw values that were never scanned — rows rendering that label would be
   * silently hidden. Warn once per column and advise supplying the full raw
   * domain via `ColumnDefinition.distinctValues`.
   */
  private warnTruncatedFormattedDomain(
    colId: string,
    formatter: ((v: CellValue) => string) | undefined,
  ): void {
    if (formatter === undefined) return;
    if (this.truncationWarnedCols.has(colId)) return;
    this.truncationWarnedCols.add(colId);
    console.warn(
      `[gp-grid] Distinct values for column "${colId}" were truncated at the cap, `
      + `and the column has a valueFormatter. Values-mode filters match raw values, `
      + `so selecting a label may miss rows whose raw values were not scanned. `
      + `Pre-supply ColumnDefinition.distinctValues with the full raw domain.`,
    );
  }

  // ===========================================================================
  // Filter Popup
  // ===========================================================================

  /**
   * Open filter popup for a column (toggles if already open for same column)
   *
   * @param computeDistinctValues Whether the adapter's popup needs a values list.
   */
  openFilterPopup(
    colIndex: number,
    anchorRect: { top: number; left: number; width: number; height: number },
    computeDistinctValues: boolean = true,
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
    let distinctValues: CellValue[] = [];
    if (computeDistinctValues) {
      distinctValues = this.getDistinctValuesForColumn(colId);
    }

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
