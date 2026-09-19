import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  DataSource,
  DataSourceResponse,
  FilterModel,
  RowAccess,
  RowId,
  RowLoadingOptions,
  SortModel,
  WriteRejectionOperation,
} from "../types";
import type { InstructionBatcher } from "./instruction-batcher";
import {
  buildDataSourceRequest,
  createWriteRejection,
  getFieldValue as readRowFieldValue,
  readCell,
  writeCell,
} from "../utils";
import {
  RowWindowLoader,
  type RowWindowRange,
} from "./row-window-loader";
import { refreshTransactionData } from "../grid-core-operations";

/** Cap on the resident rows inspected for the duplicate-RowId diagnostic. */
const DUPLICATE_ID_SCAN_LIMIT = 10_000;

export interface RowDataManagerOptions<TData> {
  dataSource: DataSource<TData>;
  rowLoading: RowLoadingOptions | undefined;
  batcher: InstructionBatcher;
  getColumns: () => ColumnDefinition[];
  getSortModel: () => SortModel[];
  getFilterModel: () => FilterModel;
  getRowHeight: () => number;
  getOverscan: () => number;
  getScrollTop: () => number;
  getViewportHeight: () => number;
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  getRowId?: (row: TData) => RowId;
  /** Called when a write is refused because the source is read-only. */
  onWriteRejected?: (event: CellWriteRejectedEvent) => void;
  /**
   * A row window arrived from a fire-and-forget load (scroll-triggered), so
   * nobody is awaiting it: the view must be synced from here.
   */
  onRowsLoaded: (totalRowsChanged: boolean) => void;
}

interface PaginatedFetchOptions {
  range: RowWindowRange;
  resetCache: boolean;
  showLoading: boolean;
  /** false when the caller awaits the load and reconciles the view itself. */
  notifyRowsLoaded: boolean;
}

export class RowDataManager<TData = unknown> {
  private dataSource: DataSource<TData>;
  private readonly options: RowDataManagerOptions<TData>;
  private readonly rowLoading: RowLoadingOptions;
  private readonly rowWindowLoader: RowWindowLoader<TData>;
  private cachedRows: Map<number, TData> = new Map();
  /**
   * Scalar access for a response that returns no materialized rows. When set,
   * it is the authoritative read path: the row cache stays empty and cells are
   * read on demand instead of being copied into row objects.
   */
  private rowAccess: RowAccess | null = null;
  private totalRows = 0;
  private isDataLoading = false;
  /** Guards against an obsolete load applying after a newer one. */
  private loadGeneration = 0;
  private hasWarnedDuplicateRowId = false;
  /** Bounded id -> view index sightings from visited windows. */
  private readonly seenRowIds = new Map<RowId, number>();

  constructor(options: RowDataManagerOptions<TData>) {
    this.options = options;
    this.dataSource = options.dataSource;
    this.rowLoading = options.rowLoading ?? {};
    this.rowWindowLoader = new RowWindowLoader<TData>(
      {
        getDataSource: () => this.dataSource,
        getCachedRows: () => this.cachedRows,
        getTotalRows: () => this.totalRows,
        setTotalRows: (count) => {
          this.totalRows = count;
        },
        getSortModel: options.getSortModel,
        getFilterModel: options.getFilterModel,
        getColumns: options.getColumns,
      },
      this.rowLoading.cache,
    );
  }

  getCachedRows(): Map<number, TData> {
    return this.cachedRows;
  }

  setCachedRows(rows: Map<number, TData>): void {
    this.cachedRows = rows;
  }

  getTotalRows(): number {
    return this.totalRows;
  }

  setTotalRows(count: number): void {
    this.totalRows = count;
  }

  getDataSource(): DataSource<TData> {
    return this.dataSource;
  }

  getRowData(rowIndex: number): TData | undefined {
    return this.cachedRows.get(rowIndex);
  }

  /**
   * Whether a view row exists and can be rendered. Independent of whether a
   * source record is available: a columnar row renders with no record.
   */
  hasRow(rowIndex: number): boolean {
    if (this.rowAccess) {
      return rowIndex >= 0 && rowIndex < this.rowAccess.rowCount;
    }
    return this.cachedRows.get(rowIndex) !== undefined;
  }

  /** Scalar access for the current response, when the source provides one. */
  getRowAccess(): RowAccess | null {
    return this.rowAccess;
  }

  /** Stable identity for a view row, when the source exposes one. */
  getRowId(viewRow: number): RowId | undefined {
    if (this.rowAccess) {
      if (viewRow < 0 || viewRow >= this.rowAccess.rowCount) return undefined;
      return this.rowAccess.getRowId?.(viewRow);
    }
    const row = this.cachedRows.get(viewRow);
    if (row === undefined) return undefined;
    return this.options.getRowId?.(row);
  }

  /**
   * Record lookup by stable identity. Uses the source's direct lookup when
   * present; otherwise scans the resident rows, which is O(resident).
   */
  getRecordById(rowId: RowId): TData | undefined {
    if (this.dataSource.getRecordById) return this.dataSource.getRecordById(rowId);
    for (const [viewIndex, row] of this.cachedRows) {
      if (this.getRowId(viewIndex) === rowId) return row;
    }
    return undefined;
  }

  /** View index of a resident record by identity, or -1. O(resident). */
  findViewIndexById(rowId: RowId): number {
    for (const viewIndex of this.cachedRows.keys()) {
      if (this.getRowId(viewIndex) === rowId) return viewIndex;
    }
    return -1;
  }

  /** False when the bound source declares itself read-only. */
  isWritable(): boolean {
    return this.dataSource.writable !== false;
  }

  isLoading(): boolean {
    return this.isDataLoading;
  }

  getCellValue(row: number, col: number): CellValue {
    if (this.rowAccess) {
      const column = this.options.getColumns()[col];
      if (column === undefined) return null;
      if (row < 0 || row >= this.rowAccess.rowCount) return null;
      return this.rowAccess.getValue(row, column.field);
    }
    return readCell(this.cachedRows, this.options.getColumns(), row, col);
  }

  /**
   * Read any source field at a view row, independent of the displayed
   * columns. Columnar rows read scalar access; object rows read the record.
   */
  getFieldValue(viewIndex: number, field: string): CellValue {
    if (this.rowAccess) {
      if (viewIndex < 0 || viewIndex >= this.rowAccess.rowCount) return null;
      return this.rowAccess.getValue(viewIndex, field);
    }
    const row = this.cachedRows.get(viewIndex);
    if (row === undefined) return null;
    return readRowFieldValue(row, field);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    if (this.isWritable() === false) {
      this.rejectWrite(row, col, "setCellValue");
      return;
    }
    writeCell(this.cachedRows, this.options.getColumns(), row, col, value, {
      onCellValueChanged: this.options.onCellValueChanged,
      getRowId: this.options.getRowId,
    });
  }

  /**
   * Report a refused write through the single diagnostic contract. Every write
   * entry point routes here so a read-only source is observable consistently.
   */
  rejectWrite(
    row: number,
    col: number,
    operation: WriteRejectionOperation,
  ): void {
    const column = this.options.getColumns()[col];
    this.options.onWriteRejected?.(
      createWriteRejection(row, col, column?.field ?? "", operation),
    );
  }

  /**
   * Bind a response's scalar access, releasing any projection owned by the
   * previous one. The row cache is left empty: no record is materialized.
   */
  private setRowAccess(next: RowAccess | null): void {
    if (this.rowAccess === next) return;
    this.rowAccess?.release?.();
    this.rowAccess = next;
  }

  async loadInitial(): Promise<void> {
    if (this.isPaginatedLoading()) {
      await this.fetchPaginatedData({
        range: this.getInitialPaginatedRange(),
        resetCache: true,
        showLoading: true,
        notifyRowsLoaded: false,
      });
      return;
    }

    await this.fetchAllData();
  }

  requestVisibleRows(): void {
    this.diagnoseWindowRowIds();
    if (this.isPaginatedLoading() === false) return;

    const range = this.getPaginatedLoadRange(true);
    if (range.endRow <= range.startRow) return;

    const visibleRange = this.getPaginatedLoadRange(false);
    const showLoading = this.rowWindowLoader.hasMissingRows(visibleRange);
    void this.fetchPaginatedData({
      range,
      resetCache: false,
      showLoading,
      notifyRowsLoaded: true,
    });
  }

  async refreshFromTransaction(): Promise<void> {
    if (this.dataSource.writable === false) {
      await this.fetchAllData();
      return;
    }
    if (this.isPaginatedLoading()) {
      await this.fetchPaginatedData({
        range: this.getPaginatedLoadRange(true),
        resetCache: true,
        showLoading: false,
        notifyRowsLoaded: false,
      });
      return;
    }

    await refreshTransactionData({
      dataSource: this.dataSource,
      sortModel: this.options.getSortModel(),
      filterModel: this.options.getFilterModel(),
      cachedRows: this.cachedRows,
      setTotalRows: (count) => {
        this.totalRows = count;
      },
      getColumns: this.options.getColumns,
    });

    // Keep wrapper row counts in sync without showing a loading indicator.
    this.options.batcher.emit({
      type: "DATA_LOADED",
      totalRows: this.totalRows,
    });
  }

  setDataSource(dataSource: DataSource<TData>): void {
    this.dataSource = dataSource;
    this.rowWindowLoader.reset();
    this.setRowAccess(null);
    this.loadGeneration += 1;
    this.totalRows = 0;
  }

  destroy(): void {
    this.rowWindowLoader.reset();
    this.setRowAccess(null);
    this.loadGeneration += 1;
    this.cachedRows.clear();
    this.totalRows = 0;
    this.isDataLoading = false;
  }

  private async fetchAllData(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.isDataLoading = true;
    this.options.batcher.emit({ type: "DATA_LOADING" });

    try {
      const request = buildDataSourceRequest({
        range: { startRow: 0, endRow: Number.MAX_SAFE_INTEGER },
        sortModel: this.options.getSortModel(),
        filterModel: this.options.getFilterModel(),
        columns: this.options.getColumns(),
      });

      const response = await this.dataSource.query(request);
      if (generation !== this.loadGeneration) return;
      this.applyResponse(response);

      this.options.batcher.emit({
        type: "DATA_LOADED",
        totalRows: this.totalRows,
      });
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      this.emitDataError(error);
    } finally {
      if (generation === this.loadGeneration) {
        this.isDataLoading = false;
      }
    }
  }

  /**
   * Adopt a query response. A response with scalar access binds that access
   * and leaves the row cache empty; otherwise the materialized rows replace it.
   */
  private applyResponse(response: DataSourceResponse<TData>): void {
    if (response.access) {
      this.cachedRows.clear();
      this.setRowAccess(response.access);
      this.totalRows = response.totalRows;
      return;
    }
    this.setRowAccess(null);
    this.cachedRows.clear();
    response.rows.forEach((row, index) => {
      this.cachedRows.set(index, row);
    });
    this.totalRows = response.totalRows;
    this.diagnoseDuplicateRowIds();
  }

  /**
   * Once-only diagnostic for duplicate IDs among the rows currently resident
   * in the cache. Bounded by the resident set and by a scan cap, so a huge
   * client dataset never turns binding into a full-dataset validation.
   */
  private diagnoseDuplicateRowIds(): void {
    if (this.hasWarnedDuplicateRowId) return;
    const getRowId = this.options.getRowId;
    if (getRowId === undefined) return;
    const seen = new Set<RowId>();
    let scanned = 0;
    for (const row of this.cachedRows.values()) {
      if (scanned >= DUPLICATE_ID_SCAN_LIMIT) return;
      scanned += 1;
      const rowId = getRowId(row);
      if (seen.has(rowId)) {
        this.hasWarnedDuplicateRowId = true;
        console.warn(`[gp-grid] Duplicate row id ${JSON.stringify(rowId)}`);
        return;
      }
      seen.add(rowId);
    }
  }

  /**
   * Duplicate check for rows entering the window, beyond the load-time scan
   * cap. A sighting only counts while its earlier row still holds that id.
   */
  private diagnoseWindowRowIds(): void {
    const getRowId = this.options.getRowId;
    if (this.hasWarnedDuplicateRowId || getRowId === undefined) return;
    const { startRow, endRow } = this.getPaginatedLoadRange(true);
    for (let viewIndex = startRow; viewIndex < endRow; viewIndex++) {
      const row = this.cachedRows.get(viewIndex);
      if (row === undefined) continue;
      const rowId = getRowId(row);
      if (this.isHeldByAnotherRow(rowId, viewIndex, getRowId)) {
        this.hasWarnedDuplicateRowId = true;
        console.warn(`[gp-grid] Duplicate row id ${JSON.stringify(rowId)}`);
        return;
      }
      if (this.seenRowIds.size >= DUPLICATE_ID_SCAN_LIMIT) this.seenRowIds.clear();
      this.seenRowIds.set(rowId, viewIndex);
    }
  }

  private isHeldByAnotherRow(
    rowId: RowId,
    viewIndex: number,
    getRowId: (row: TData) => RowId,
  ): boolean {
    const seenAt = this.seenRowIds.get(rowId);
    if (seenAt === undefined || seenAt === viewIndex) return false;
    const other = this.cachedRows.get(seenAt);
    return other !== undefined && getRowId(other) === rowId;
  }

  private async fetchPaginatedData(
    options: PaginatedFetchOptions,
  ): Promise<void> {
    if (options.showLoading) {
      this.isDataLoading = true;
      this.options.batcher.emit({ type: "DATA_LOADING" });
    }

    try {
      const result = await this.rowWindowLoader.loadRange(
        options.range,
        options.resetCache,
      );
      if (result.applied === false) return;
      if (result.loadedBlockCount > 0) {
        this.diagnoseDuplicateRowIds();
        this.diagnoseWindowRowIds();
      }

      if (options.showLoading || result.totalRowsChanged) {
        this.options.batcher.emit({
          type: "DATA_LOADED",
          totalRows: this.totalRows,
        });
      }

      if (options.notifyRowsLoaded) {
        this.options.onRowsLoaded(result.totalRowsChanged);
      }
    } catch (error) {
      this.emitDataError(error);
    } finally {
      if (options.showLoading) {
        this.isDataLoading = false;
      }
    }
  }

  private emitDataError(error: unknown): void {
    this.options.batcher.emit({
      type: "DATA_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private isPaginatedLoading(): boolean {
    const mode = this.rowLoading.mode ?? "auto";
    if (mode === "paginated") return true;
    if (mode === "all") return false;
    return this.dataSource.loadMode === "paginated";
  }

  private getInitialPaginatedRange(): RowWindowRange {
    const visibleRange = this.getPaginatedLoadRange(true);
    return {
      startRow: 0,
      endRow: Math.max(
        this.rowWindowLoader.getPageSize(),
        visibleRange.endRow,
      ),
    };
  }

  private getPaginatedLoadRange(includeOverscan: boolean): RowWindowRange {
    const rowHeight = this.options.getRowHeight();
    const viewportHeight = this.options.getViewportHeight();
    const scrollTop = this.options.getScrollTop();
    const extraRows = includeOverscan ? this.options.getOverscan() : 0;
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - extraRows);
    const estimatedEndRow =
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + extraRows + 1;
    const endRow = this.totalRows > 0
      ? Math.min(this.totalRows, estimatedEndRow)
      : estimatedEndRow;
    return { startRow, endRow: Math.max(startRow, endRow) };
  }
}
