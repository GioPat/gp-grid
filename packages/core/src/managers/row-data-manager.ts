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
import { buildDataSourceRequest } from "../utils";
import { PaginatedRowLoader } from "./paginated-row-loader";
import { RowIdDiagnostics } from "./row-id-diagnostics";
import { RowStore } from "./row-store";
import type { RowLoadContext, RowPageBudgetInput } from "./row-window-loader";
import { refreshTransactionData } from "../grid-core-operations";

export interface RowDataManagerOptions<TData> {
  dataSource: DataSource<TData>;
  rowLoading: RowLoadingOptions | undefined;
  batcher: InstructionBatcher;
  getColumns: () => ColumnDefinition[];
  getSortModel: () => SortModel[];
  getFilterModel: () => FilterModel;
  /** Overscanned half-open row window from the geometry service. */
  getRowWindow: () => { start: number; end: number };
  /** Exact half-open visible row window from the geometry service. */
  getVisibleRowWindow: () => { start: number; end: number };
  /** Finite row estimate for the first load, while the row axis is still empty. */
  getBootstrapRowCount: () => number;
  /** Capacity inputs for C2's cache predicate; never reads the region layout. */
  getPageBudgetInput: () => RowPageBudgetInput;
  /** Windows and the published C9 layout for the load being computed. */
  getLoadContext: () => RowLoadContext;
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

export class RowDataManager<TData = unknown> {
  private dataSource: DataSource<TData>;
  private readonly options: RowDataManagerOptions<TData>;
  private readonly store: RowStore<TData>;
  private readonly diagnostics: RowIdDiagnostics<TData>;
  private readonly paginated: PaginatedRowLoader<TData>;
  private isDataLoading = false;
  /** Guards against an obsolete load applying after a newer one. */
  private loadGeneration = 0;

  constructor(options: RowDataManagerOptions<TData>) {
    this.options = options;
    this.dataSource = options.dataSource;
    this.store = new RowStore<TData>({
      getColumns: options.getColumns,
      getDataSource: () => this.dataSource,
      isWritable: () => this.isWritable(),
      getRowId: options.getRowId,
      onCellValueChanged: options.onCellValueChanged,
      onWriteRejected: options.onWriteRejected,
    });

    // The window diagnostic sizes its scan from the paginated load range, so
    // the two reference each other, lazily on the first load.
    this.diagnostics = new RowIdDiagnostics<TData>({
      getCachedRows: () => this.store.getCachedRows(),
      getRowId: options.getRowId,
      getLoadRange: () => this.paginated.getPaginatedLoadRange(true),
    });
    this.paginated = new PaginatedRowLoader<TData>({
      getDataSource: () => this.dataSource,
      rowLoading: options.rowLoading,
      batcher: options.batcher,
      getCachedRows: () => this.store.getCachedRows(),
      getTotalRows: () => this.store.getTotalRows(),
      setTotalRows: (count) => this.store.setTotalRows(count),
      getSortModel: options.getSortModel,
      getFilterModel: options.getFilterModel,
      getColumns: options.getColumns,
      getRowWindow: options.getRowWindow,
      getVisibleRowWindow: options.getVisibleRowWindow,
      getBootstrapRowCount: options.getBootstrapRowCount,
      getPageBudgetInput: options.getPageBudgetInput,
      getLoadContext: options.getLoadContext,
      diagnostics: this.diagnostics,
      emitDataError: (error) => this.emitDataError(error),
      setDataLoading: (loading) => {
        this.isDataLoading = loading;
      },
      onRowsLoaded: options.onRowsLoaded,
    });
  }

  getCachedRows(): Map<number, TData> {
    return this.store.getCachedRows();
  }
  setCachedRows(rows: Map<number, TData>): void {
    this.store.setCachedRows(rows);
  }
  getTotalRows(): number {
    return this.store.getTotalRows();
  }
  setTotalRows(count: number): void {
    this.store.setTotalRows(count);
  }
  getDataSource(): DataSource<TData> {
    return this.dataSource;
  }

  getRowData(rowIndex: number): TData | undefined {
    return this.store.getRowData(rowIndex);
  }
  hasRow(rowIndex: number): boolean {
    return this.store.hasRow(rowIndex);
  }
  getRowAccess(): RowAccess | null {
    return this.store.getRowAccess();
  }
  getRowId(viewRow: number): RowId | undefined {
    return this.store.getRowId(viewRow);
  }
  getRecordById(rowId: RowId): TData | undefined {
    return this.store.getRecordById(rowId);
  }
  findViewIndexById(rowId: RowId): number {
    return this.store.findViewIndexById(rowId);
  }

  /** False when the bound source declares itself read-only. */
  isWritable(): boolean {
    return this.dataSource.writable !== false;
  }
  isLoading(): boolean {
    return this.isDataLoading;
  }

  getCellValue(row: number, col: number): CellValue {
    return this.store.getCellValue(row, col);
  }
  getFieldValue(viewIndex: number, field: string): CellValue {
    return this.store.getFieldValue(viewIndex, field);
  }
  setCellValue(row: number, col: number, value: CellValue): void {
    this.store.setCellValue(row, col, value);
  }
  rejectWrite(
    row: number,
    col: number,
    operation: WriteRejectionOperation,
  ): void {
    this.store.rejectWrite(row, col, operation);
  }

  async loadInitial(): Promise<void> {
    if (this.paginated.isPaginatedLoading()) {
      await this.paginated.loadInitial();
      return;
    }

    await this.fetchAllData();
  }

  requestVisibleRows(): void {
    this.paginated.requestVisibleRows();
  }

  /** C2's prefix budget for a paginated source; see C8's cache predicate. */
  getPrefixAdmission(): ((count: number) => boolean) | undefined {
    return this.paginated.getPrefixAdmission();
  }

  async refreshFromTransaction(): Promise<void> {
    if (this.dataSource.writable === false) {
      await this.fetchAllData();
      return;
    }
    if (this.paginated.isPaginatedLoading()) {
      await this.paginated.refreshFromTransaction();
      return;
    }

    await refreshTransactionData({
      dataSource: this.dataSource,
      sortModel: this.options.getSortModel(),
      filterModel: this.options.getFilterModel(),
      cachedRows: this.store.getCachedRows(),
      setTotalRows: (count) => {
        this.store.setTotalRows(count);
      },
      getColumns: this.options.getColumns,
    });

    // Keep wrapper row counts in sync without showing a loading indicator.
    this.options.batcher.emit({
      type: "DATA_LOADED",
      totalRows: this.store.getTotalRows(),
    });
  }

  setDataSource(dataSource: DataSource<TData>): void {
    this.dataSource = dataSource;
    this.paginated.reset();
    this.store.setRowAccess(null);
    this.loadGeneration += 1;
    this.store.setTotalRows(0);
  }

  destroy(): void {
    this.paginated.reset();
    this.store.setRowAccess(null);
    this.loadGeneration += 1;
    this.store.clear();
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
        totalRows: this.store.getTotalRows(),
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
      this.store.getCachedRows().clear();
      this.store.setRowAccess(response.access);
      this.store.setTotalRows(response.totalRows);
      return;
    }
    this.store.setRowAccess(null);
    const cachedRows = this.store.getCachedRows();
    cachedRows.clear();
    response.rows.forEach((row, index) => {
      cachedRows.set(index, row);
    });
    this.store.setTotalRows(response.totalRows);
    this.diagnostics.diagnoseLoadedRows();
  }

  private emitDataError(error: unknown): void {
    this.options.batcher.emit({
      type: "DATA_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
