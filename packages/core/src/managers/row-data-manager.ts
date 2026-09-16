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
} from "../types";
import type { InstructionBatcher } from "./instruction-batcher";
import {
  buildDataSourceRequest,
  getFieldValue as readRowFieldValue,
  readCell,
  writeCell,
} from "../utils";
import {
  RowWindowLoader,
  type RowWindowRange,
} from "./row-window-loader";
import { refreshTransactionData } from "../grid-core-operations";

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
  private access: RowAccess | null = null;
  private totalRows = 0;
  private isDataLoading = false;
  /** Guards against an obsolete load applying after a newer one. */
  private loadGeneration = 0;

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
    if (this.access) return rowIndex >= 0 && rowIndex < this.access.rowCount;
    return this.cachedRows.get(rowIndex) !== undefined;
  }

  /** Scalar access for the current response, when the source provides one. */
  getAccess(): RowAccess | null {
    return this.access;
  }

  /** Stable identity for a view row, when the source exposes one. */
  getRowId(viewRow: number): RowId | undefined {
    if (this.access) {
      if (viewRow < 0 || viewRow >= this.access.rowCount) return undefined;
      return this.access.getRowId?.(viewRow);
    }
    const row = this.cachedRows.get(viewRow);
    if (row === undefined) return undefined;
    return this.options.getRowId?.(row);
  }

  /** False when the bound source declares itself read-only. */
  isWritable(): boolean {
    return this.dataSource.writable !== false;
  }

  isLoading(): boolean {
    return this.isDataLoading;
  }

  getCellValue(row: number, col: number): CellValue {
    if (this.access) {
      const column = this.options.getColumns()[col];
      if (column === undefined) return null;
      if (row < 0 || row >= this.access.rowCount) return null;
      return this.access.getValue(row, column.field);
    }
    return readCell(this.cachedRows, this.options.getColumns(), row, col);
  }

  /**
   * Read any source field at a view row, independent of the displayed
   * columns. Columnar rows read scalar access; object rows read the record.
   */
  getFieldValue(viewIndex: number, field: string): CellValue {
    if (this.access) {
      if (viewIndex < 0 || viewIndex >= this.access.rowCount) return null;
      return this.access.getValue(viewIndex, field);
    }
    const row = this.cachedRows.get(viewIndex);
    if (row === undefined) return null;
    return readRowFieldValue(row, field);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    if (this.isWritable() === false) {
      const column = this.options.getColumns()[col];
      this.options.onWriteRejected?.({
        row,
        col,
        field: column?.field ?? "",
        reason: "read-only-source",
      });
      return;
    }
    writeCell(this.cachedRows, this.options.getColumns(), row, col, value, {
      onCellValueChanged: this.options.onCellValueChanged,
      getRowId: this.options.getRowId,
    });
  }

  /**
   * Bind a response's scalar access, releasing any projection owned by the
   * previous one. The row cache is left empty: no record is materialized.
   */
  private setAccess(next: RowAccess | null): void {
    if (this.access === next) return;
    this.access?.release?.();
    this.access = next;
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
    this.setAccess(null);
    this.loadGeneration += 1;
    this.totalRows = 0;
  }

  destroy(): void {
    this.rowWindowLoader.reset();
    this.setAccess(null);
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
      this.setAccess(response.access);
      this.totalRows = response.totalRows;
      return;
    }
    this.setAccess(null);
    this.cachedRows.clear();
    response.rows.forEach((row, index) => {
      this.cachedRows.set(index, row);
    });
    this.totalRows = response.totalRows;
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
