import type {
  ColumnDefinition,
  DataSource,
  FilterModel,
  RowLoadingOptions,
  SortModel,
} from "../types";
import type { InstructionBatcher } from "./instruction-batcher";
import { createFrozenPrefixBudget, isUniformAxis } from "./page-capacity";
import {
  RowWindowLoader,
  type RowLoadContext,
  type RowPageBudgetInput,
  type RowWindowRange,
} from "./row-window-loader";
import type { RowIdDiagnostics } from "./row-id-diagnostics";

interface PaginatedFetchOptions {
  range: RowWindowRange;
  resetCache: boolean;
  showLoading: boolean;
  /** false when the caller awaits the load and reconciles the view itself. */
  notifyRowsLoaded: boolean;
}

export interface PaginatedRowLoaderOptions<TData> {
  getDataSource: () => DataSource<TData>;
  rowLoading: RowLoadingOptions | undefined;
  batcher: InstructionBatcher;
  getCachedRows: () => Map<number, TData>;
  getTotalRows: () => number;
  setTotalRows: (count: number) => void;
  getSortModel: () => SortModel[];
  getFilterModel: () => FilterModel;
  getColumns: () => ColumnDefinition[];
  /** Overscanned half-open row window from the geometry service. */
  getRowWindow: () => { start: number; end: number };
  /** Exact half-open visible row window from the geometry service. */
  getVisibleRowWindow: () => { start: number; end: number };
  /** Finite row estimate for the first load, while the row axis is still empty. */
  getBootstrapRowCount: () => number;
  /** Capacity inputs for C2's cache predicate; see `RowPageBudgetInput`. */
  getPageBudgetInput: () => RowPageBudgetInput;
  /** Windows and published regions for the load being computed. */
  getLoadContext: () => RowLoadContext;
  diagnostics: RowIdDiagnostics<TData>;
  emitDataError: (error: unknown) => void;
  setDataLoading: (loading: boolean) => void;
  /**
   * A row window arrived from a fire-and-forget load (scroll-triggered), so
   * nobody is awaiting it: the view must be synced from here.
   */
  onRowsLoaded: (totalRowsChanged: boolean) => void;
}

/** Windowed loading for sources queried page by page. */
export class PaginatedRowLoader<TData = unknown> {
  private readonly options: PaginatedRowLoaderOptions<TData>;
  private readonly rowLoading: RowLoadingOptions;
  private readonly rowWindowLoader: RowWindowLoader<TData>;

  constructor(options: PaginatedRowLoaderOptions<TData>) {
    this.options = options;
    this.rowLoading = options.rowLoading ?? {};
    this.rowWindowLoader = new RowWindowLoader<TData>(
      options,
      this.rowLoading.cache,
    );
  }

  getPageSize(): number {
    return this.rowWindowLoader.getPageSize();
  }

  /** C2's cache predicate; undefined while paging is inactive or unbounded. */
  getPrefixAdmission(): ((count: number) => boolean) | undefined {
    if (this.isPaginatedLoading() === false) return undefined;
    const budget = this.rowWindowLoader.getPageBudget();
    if (isUniformAxis(budget.axis) === false) return undefined;
    return createFrozenPrefixBudget(budget);
  }

  reset(): void {
    this.rowWindowLoader.reset();
  }

  isPaginatedLoading(): boolean {
    const mode = this.rowLoading.mode ?? "auto";
    if (mode === "paginated") return true;
    if (mode === "all") return false;
    return this.options.getDataSource().loadMode === "paginated";
  }

  async loadInitial(): Promise<void> {
    await this.fetchPaginatedData({
      range: this.getInitialPaginatedRange(),
      resetCache: true,
      showLoading: true,
      notifyRowsLoaded: false,
    });
  }

  requestVisibleRows(): void {
    this.options.diagnostics.diagnoseWindowRows();
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
    await this.fetchPaginatedData({
      range: this.getPaginatedLoadRange(true),
      resetCache: true,
      showLoading: false,
      notifyRowsLoaded: false,
    });
  }

  /**
   * Bootstrap paging without inventing an infinite axis: the row axis is
   * empty until the first response, so the viewport estimate sizes the load.
   */
  getInitialPaginatedRange(): RowWindowRange {
    return {
      startRow: 0,
      endRow: Math.max(
        this.rowWindowLoader.getPageSize(),
        this.getPaginatedLoadRange(true).endRow,
        this.options.getBootstrapRowCount(),
      ),
    };
  }

  /** Load range adapted from the geometry windows, capped by a known total. */
  getPaginatedLoadRange(includeOverscan: boolean): RowWindowRange {
    const window = includeOverscan
      ? this.options.getRowWindow()
      : this.options.getVisibleRowWindow();
    const startRow = Math.max(0, window.start);
    const estimatedEndRow = Math.max(startRow, window.end);
    const totalRows = this.options.getTotalRows();
    const endRow = totalRows > 0
      ? Math.min(totalRows, estimatedEndRow)
      : estimatedEndRow;
    return { startRow, endRow };
  }

  private async fetchPaginatedData(
    options: PaginatedFetchOptions,
  ): Promise<void> {
    if (options.showLoading) {
      this.options.setDataLoading(true);
      this.options.batcher.emit({ type: "DATA_LOADING" });
    }

    try {
      const result = await this.rowWindowLoader.loadRange(
        options.range,
        options.resetCache,
      );
      if (result.applied === false) return;
      if (result.loadedBlockCount > 0) {
        this.options.diagnostics.diagnoseLoadedRows();
        this.options.diagnostics.diagnoseWindowRows();
      }

      if (options.showLoading || result.totalRowsChanged) {
        this.options.batcher.emit({
          type: "DATA_LOADED",
          totalRows: this.options.getTotalRows(),
        });
      }

      if (options.notifyRowsLoaded) {
        this.options.onRowsLoaded(result.totalRowsChanged);
      }
    } catch (error) {
      this.options.emitDataError(error);
    } finally {
      if (options.showLoading) {
        this.options.setDataLoading(false);
      }
    }
  }
}
