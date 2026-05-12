import type {
  CellValue,
  CellValueChangedEvent,
  ColumnDefinition,
  DataSource,
  FilterModel,
  RowId,
  RowLoadingOptions,
  SortModel,
} from "../types";
import type { InstructionBatcher } from "./instruction-batcher";
import { buildDataSourceRequest, readCell, writeCell } from "../utils";
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
  syncSlots: () => void;
  emitVisibleRange: () => void;
  emitContentSize: () => void;
}

interface PaginatedFetchOptions {
  range: RowWindowRange;
  resetCache: boolean;
  showLoading: boolean;
  refreshSlots: boolean;
}

export class RowDataManager<TData = unknown> {
  private dataSource: DataSource<TData>;
  private readonly options: RowDataManagerOptions<TData>;
  private readonly rowLoading: RowLoadingOptions;
  private readonly rowWindowLoader: RowWindowLoader<TData>;
  private cachedRows: Map<number, TData> = new Map();
  private totalRows = 0;
  private isDataLoading = false;

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

  isLoading(): boolean {
    return this.isDataLoading;
  }

  getCellValue(row: number, col: number): CellValue {
    return readCell(this.cachedRows, this.options.getColumns(), row, col);
  }

  setCellValue(row: number, col: number, value: CellValue): void {
    writeCell(this.cachedRows, this.options.getColumns(), row, col, value, {
      onCellValueChanged: this.options.onCellValueChanged,
      getRowId: this.options.getRowId,
    });
  }

  async loadInitial(): Promise<void> {
    if (this.isPaginatedLoading()) {
      await this.fetchPaginatedData({
        range: this.getInitialPaginatedRange(),
        resetCache: true,
        showLoading: true,
        refreshSlots: false,
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
      refreshSlots: true,
    });
  }

  async refreshFromTransaction(): Promise<void> {
    if (this.isPaginatedLoading()) {
      await this.fetchPaginatedData({
        range: this.getPaginatedLoadRange(true),
        resetCache: true,
        showLoading: false,
        refreshSlots: false,
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
  }

  setDataSource(dataSource: DataSource<TData>): void {
    this.dataSource = dataSource;
    this.rowWindowLoader.reset();
    this.totalRows = 0;
  }

  destroy(): void {
    this.rowWindowLoader.reset();
    this.cachedRows.clear();
    this.totalRows = 0;
    this.isDataLoading = false;
  }

  private async fetchAllData(): Promise<void> {
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
      this.cachedRows.clear();
      response.rows.forEach((row, index) => {
        this.cachedRows.set(index, row);
      });
      this.totalRows = response.totalRows;

      this.options.batcher.emit({
        type: "DATA_LOADED",
        totalRows: this.totalRows,
      });
    } catch (error) {
      this.emitDataError(error);
    } finally {
      this.isDataLoading = false;
    }
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

      if (options.refreshSlots) {
        this.options.syncSlots();
        this.options.emitVisibleRange();
        if (result.totalRowsChanged) this.options.emitContentSize();
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
