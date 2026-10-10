import type {
  CellValue,
  DataSource,
  DataSourceResponse,
  HierarchicalRowAccess,
  HierarchyRow,
  RowAccess,
  RowGrouping,
  RowGroupingResult,
  RowId,
  WriteRejectionOperation,
  WriteRejectionReason,
} from "../types";
import type { AxisBounds } from "../types/geometry";
import { buildDataSourceRequest } from "../utils";
import { PaginatedRowLoader } from "./paginated-row-loader";
import { RowIdDiagnostics } from "./row-id-diagnostics";
import { RowStore } from "./row-store";
import { RowViewBinder } from "./row-view-binder";
import { refreshTransactionData } from "../grid-core-operations";
import type { RowDataManagerOptions } from "./row-data-manager-options";

export type { RowDataManagerOptions } from "./row-data-manager-options";

export class RowDataManager<TData = unknown> {
  private dataSource: DataSource<TData>;
  private readonly options: RowDataManagerOptions<TData>;
  private readonly store: RowStore<TData>;
  private readonly diagnostics: RowIdDiagnostics<TData>;
  private readonly paginated: PaginatedRowLoader<TData>;
  private readonly binder: RowViewBinder<TData>;
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
      bumpDataRevision: () => this.bumpDataRevision(),
    });
    this.binder = new RowViewBinder(
      this.store,
      { ...options, getDataSource: () => this.dataSource },
      () => this.paginated.isPaginatedLoading(),
    );
  }

  getCachedRows(): Map<number, TData> {
    return this.store.getCachedRows();
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
  getHierarchy(): HierarchicalRowAccess<TData> | null {
    return this.store.getHierarchy();
  }
  getHierarchyRow(viewIndex: number): HierarchyRow | undefined {
    return this.store.getHierarchyRow(viewIndex);
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
  /** Whether the bound source exposes a stable row identity. */
  hasStableIdentity(): boolean { return this.store.hasStableIdentity(); }
  /** View indices of the requested identities, within `range` when given. */
  locateRowIds(ids: ReadonlySet<RowId>, range?: AxisBounds): Map<RowId, number> {
    return this.store.locateIds(ids, range);
  }
  /** Changes whenever row order or membership may have changed. */
  getDataRevision(): number { return this.store.getRevision(); }
  bumpDataRevision(): void { this.store.bumpRevision(); }

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
  /** False when the write was refused, and reported as `operation`. */
  setCellValue(row: number, col: number, value: CellValue, operation?: WriteRejectionOperation): boolean {
    return this.store.setCellValue(row, col, value, operation);
  }
  /** A group or total row takes no write. */
  isRowWritable(row: number): boolean {
    return this.store.isRowWritable(row);
  }
  rejectWrite(row: number, col: number, operation: WriteRejectionOperation, reason: WriteRejectionReason): void {
    this.store.rejectWrite(row, col, operation, reason);
  }

  async loadInitial(): Promise<void> {
    if (this.paginated.isPaginatedLoading()) {
      this.binder.bindPaginated();
      await this.paginated.loadInitial();
      return;
    }

    await this.fetchAllData();
  }

  /** Regroup the resident flat rows with no query. */
  setGrouping(grouping: RowGrouping | null): RowGroupingResult {
    return this.binder.setGrouping(grouping);
  }

  requestVisibleRows(): void {
    this.paginated.requestVisibleRows();
  }

  /** C2's prefix budget for a paginated source; see C8's cache predicate. */
  getPrefixAdmission(): ((count: number) => boolean) | undefined {
    return this.paginated.getPrefixAdmission();
  }

  async refreshFromTransaction(): Promise<void> {
    // A hierarchy has no flat cache to patch: it is re-bound from a full query.
    if (this.dataSource.writable === false || this.store.getHierarchy()) {
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
    this.bumpDataRevision();
    this.emitLoaded();
  }

  setDataSource(dataSource: DataSource<TData>): void {
    this.dataSource = dataSource;
    this.paginated.reset();
    this.store.setRowAccess(null);
    this.binder.reset();
    this.loadGeneration += 1;
    this.store.setTotalRows(0);
    this.bumpDataRevision();
  }

  destroy(): void {
    this.paginated.reset();
    this.store.setRowAccess(null);
    this.binder.reset();
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
      this.emitLoaded();
    } catch (error) {
      if (generation !== this.loadGeneration) return;
      this.emitDataError(error);
    } finally {
      if (generation === this.loadGeneration) {
        this.isDataLoading = false;
      }
    }
  }

  private applyResponse(response: DataSourceResponse<TData>): void {
    this.bumpDataRevision();
    if (this.binder.bind(response) === "rows") this.diagnostics.diagnoseLoadedRows();
  }

  /** A flat load omits `hierarchical`, so the flat payload stays exact. */
  emitLoaded(): void {
    const totalRows = this.store.getTotalRows();
    if (this.store.getHierarchy()) {
      this.options.batcher.emit({ type: "DATA_LOADED", totalRows, hierarchical: true });
      return;
    }
    this.options.batcher.emit({ type: "DATA_LOADED", totalRows });
  }

  private emitDataError(error: unknown): void {
    this.options.batcher.emit({
      type: "DATA_ERROR",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
