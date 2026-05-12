import type {
  ColumnDefinition,
  DataSource,
  DataSourceResponse,
  FilterModel,
  RowCacheEviction,
  RowCacheOptions,
  SortModel,
} from "../types";
import { buildDataSourceRequest } from "../utils";

export interface RowWindowRange {
  /** First row index in the requested window. */
  startRow: number;
  /** First row index after the requested window. */
  endRow: number;
}

export interface RowWindowLoadResult {
  applied: boolean;
  loadedBlockCount: number;
  totalRowsChanged: boolean;
}

export interface RowWindowLoaderOptions<TData> {
  getDataSource: () => DataSource<TData>;
  getCachedRows: () => Map<number, TData>;
  getTotalRows: () => number;
  setTotalRows: (count: number) => void;
  getSortModel: () => SortModel[];
  getFilterModel: () => FilterModel;
  getColumns: () => ColumnDefinition[];
}

interface NormalizedRowCacheOptions {
  pageSize: number;
  prefetchPages: number;
  maxPages: number;
}

const DEFAULT_PAGE_SIZE = 100;
const CACHE_PRESETS: Record<
  RowCacheEviction,
  Pick<NormalizedRowCacheOptions, "prefetchPages" | "maxPages">
> = {
  aggressive: { prefetchPages: 0, maxPages: 1 },
  balanced: { prefetchPages: 1, maxPages: 5 },
  conservative: { prefetchPages: 2, maxPages: 10 },
};

const positiveIntegerOrDefault = (
  value: number | undefined,
  fallback: number,
): number => {
  if (value === undefined) return fallback;
  if (Number.isFinite(value) && value > 0) return Math.floor(value);
  return fallback;
};

const nonNegativeIntegerOrDefault = (
  value: number | undefined,
  fallback: number,
): number => {
  if (value === undefined) return fallback;
  if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  return fallback;
};

const normalizeRowCacheOptions = (
  options: RowCacheOptions | undefined,
): NormalizedRowCacheOptions => {
  const preset = CACHE_PRESETS[options?.eviction ?? "balanced"];
  return {
    pageSize: positiveIntegerOrDefault(options?.pageSize, DEFAULT_PAGE_SIZE),
    prefetchPages: nonNegativeIntegerOrDefault(
      options?.prefetchPages,
      preset.prefetchPages,
    ),
    maxPages: positiveIntegerOrDefault(
      options?.maxPages,
      preset.maxPages,
    ),
  };
};

/**
 * Fetches aligned row blocks around the viewport and evicts rows outside the
 * configured cache budget. It is intentionally framework-agnostic and only
 * mutates GridCore's row cache through injected getters.
 */
export class RowWindowLoader<TData = unknown> {
  private readonly options: RowWindowLoaderOptions<TData>;
  private cacheOptions: NormalizedRowCacheOptions;
  private generation = 0;
  private hasKnownTotal = false;
  private readonly loadedBlocks = new Set<number>();
  private readonly pendingBlocks = new Map<number, Promise<void>>();

  constructor(
    options: RowWindowLoaderOptions<TData>,
    cacheOptions?: RowCacheOptions,
  ) {
    this.options = options;
    this.cacheOptions = normalizeRowCacheOptions(cacheOptions);
  }

  configure(cacheOptions: RowCacheOptions | undefined): void {
    this.cacheOptions = normalizeRowCacheOptions(cacheOptions);
  }

  getPageSize(): number {
    return this.cacheOptions.pageSize;
  }

  reset(): void {
    this.generation += 1;
    this.hasKnownTotal = false;
    this.loadedBlocks.clear();
    this.pendingBlocks.clear();
    this.options.getCachedRows().clear();
  }

  hasMissingRows(range: RowWindowRange): boolean {
    if (range.endRow <= range.startRow) return false;
    const totalRows = this.options.getTotalRows();
    if (this.hasKnownTotal && totalRows === 0) return false;
    if (this.hasKnownTotal && range.startRow >= totalRows) return false;

    const endRow = this.hasKnownTotal
      ? Math.min(range.endRow, totalRows)
      : range.endRow;
    const cachedRows = this.options.getCachedRows();
    for (let row = range.startRow; row < endRow; row += 1) {
      if (cachedRows.has(row)) continue;
      return true;
    }
    return false;
  }

  async loadRange(
    range: RowWindowRange,
    resetCache: boolean = false,
  ): Promise<RowWindowLoadResult> {
    if (resetCache) this.reset();

    const generation = this.generation;
    const totalRowsBefore = this.options.getTotalRows();
    const blocks = this.getBlocksForRange(range);
    const tasks = blocks
      .map((blockIndex) => this.getOrCreateBlockRequest(blockIndex, generation))
      .filter((task): task is Promise<void> => task !== null);

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    if (generation !== this.generation) {
      return { applied: false, loadedBlockCount: 0, totalRowsChanged: false };
    }

    this.evictAround(range);
    return {
      applied: true,
      loadedBlockCount: tasks.length,
      totalRowsChanged: totalRowsBefore !== this.options.getTotalRows(),
    };
  }

  private getOrCreateBlockRequest(
    blockIndex: number,
    generation: number,
  ): Promise<void> | null {
    if (this.loadedBlocks.has(blockIndex)) {
      return null;
    }

    const pending = this.pendingBlocks.get(blockIndex);
    if (pending) {
      return pending;
    }

    const promise = this.fetchBlock(blockIndex, generation);
    this.pendingBlocks.set(blockIndex, promise);
    void promise.then(
      () => this.deletePendingBlock(blockIndex, promise),
      () => this.deletePendingBlock(blockIndex, promise),
    );
    return promise;
  }

  private deletePendingBlock(
    blockIndex: number,
    promise: Promise<void>,
  ): void {
    if (this.pendingBlocks.get(blockIndex) === promise) {
      this.pendingBlocks.delete(blockIndex);
    }
  }

  private async fetchBlock(blockIndex: number, generation: number): Promise<void> {
    const startRow = blockIndex * this.cacheOptions.pageSize;
    const endRow = this.getBlockEndRow(blockIndex);
    let response: DataSourceResponse<TData>;
    try {
      response = await this.options.getDataSource().query(
        buildDataSourceRequest({
          range: { startRow, endRow },
          sortModel: this.options.getSortModel(),
          filterModel: this.options.getFilterModel(),
          columns: this.options.getColumns(),
        }),
      );
    } catch (error) {
      if (generation === this.generation) throw error;
      return;
    }

    if (generation === this.generation) {
      this.applyBlockResponse(blockIndex, response.rows, response.totalRows);
    }
  }

  private applyBlockResponse(
    blockIndex: number,
    rows: TData[],
    totalRows: number,
  ): void {
    const cachedRows = this.options.getCachedRows();
    const previousTotalRows = this.options.getTotalRows();
    this.deleteRowsForBlock(blockIndex);

    const startRow = blockIndex * this.cacheOptions.pageSize;
    rows.forEach((row, index) => {
      if (row !== undefined) {
        cachedRows.set(startRow + index, row);
      }
    });

    this.options.setTotalRows(totalRows);
    this.hasKnownTotal = true;
    this.loadedBlocks.add(blockIndex);

    if (totalRows < previousTotalRows) {
      this.deleteRowsAfterTotal(totalRows);
    }
  }

  private getBlocksForRange(range: RowWindowRange): number[] {
    if (range.endRow <= range.startRow) return [];

    const totalRows = this.options.getTotalRows();
    if (this.hasKnownTotal && totalRows === 0) return [];
    if (this.hasKnownTotal && range.startRow >= totalRows) return [];

    const endRow = this.hasKnownTotal
      ? Math.min(range.endRow, totalRows)
      : range.endRow;
    const pageSize = this.cacheOptions.pageSize;
    const firstBlock = Math.floor(range.startRow / pageSize);
    const lastBlock = Math.floor((endRow - 1) / pageSize);
    const firstPrefetchBlock = Math.max(0, firstBlock - this.cacheOptions.prefetchPages);
    const lastPrefetchBlock = this.getLastPrefetchBlock(lastBlock);

    const blocks: number[] = [];
    for (let block = firstPrefetchBlock; block <= lastPrefetchBlock; block += 1) {
      blocks.push(block);
    }
    return blocks;
  }

  private getLastPrefetchBlock(lastBlock: number): number {
    const totalRows = this.options.getTotalRows();
    const candidate = lastBlock + this.cacheOptions.prefetchPages;
    if (this.hasKnownTotal && totalRows > 0) {
      const lastKnownBlock = Math.floor((totalRows - 1) / this.cacheOptions.pageSize);
      return Math.min(candidate, lastKnownBlock);
    }
    return candidate;
  }

  private getBlockEndRow(blockIndex: number): number {
    const startRow = blockIndex * this.cacheOptions.pageSize;
    const candidate = startRow + this.cacheOptions.pageSize;
    const totalRows = this.options.getTotalRows();
    if (this.hasKnownTotal && totalRows > 0) {
      return Math.min(candidate, totalRows);
    }
    return candidate;
  }

  private evictAround(range: RowWindowRange): void {
    if (this.loadedBlocks.size <= this.cacheOptions.maxPages) return;

    const protectedBlocks = new Set(this.getBlocksForRange(range));
    const centerBlock = Math.floor(range.startRow / this.cacheOptions.pageSize);
    const candidates = [...this.loadedBlocks]
      .filter((block) => protectedBlocks.has(block) === false)
      .sort(
        (a, b) =>
          Math.abs(b - centerBlock) - Math.abs(a - centerBlock),
      );

    for (const blockIndex of candidates) {
      if (this.loadedBlocks.size <= this.cacheOptions.maxPages) return;
      this.loadedBlocks.delete(blockIndex);
      this.deleteRowsForBlock(blockIndex);
    }
  }

  private deleteRowsForBlock(blockIndex: number): void {
    const cachedRows = this.options.getCachedRows();
    const startRow = blockIndex * this.cacheOptions.pageSize;
    const endRow = startRow + this.cacheOptions.pageSize;
    for (let row = startRow; row < endRow; row += 1) {
      cachedRows.delete(row);
    }
  }

  private deleteRowsAfterTotal(totalRows: number): void {
    const cachedRows = this.options.getCachedRows();
    for (const rowIndex of cachedRows.keys()) {
      if (rowIndex >= totalRows) {
        cachedRows.delete(rowIndex);
      }
    }
  }
}
