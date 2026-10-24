import type {
  ColumnDefinition,
  DataSource,
  DataSourceResponse,
  FilterModel,
  SortModel,
} from "../types";
import { buildDataSourceRequest } from "../utils";

export interface PageCacheOptions<TData> {
  getDataSource: () => DataSource<TData>;
  getCachedRows: () => Map<number, TData>;
  getTotalRows: () => number;
  setTotalRows: (count: number) => void;
  getSortModel: () => SortModel[];
  getFilterModel: () => FilterModel;
  getColumns: () => ColumnDefinition[];
}

/**
 * Owns the loaded row blocks, the in-flight requests and the cache
 * generation. A response or failure from an older generation is dropped, so a
 * reset never applies late data; which blocks to request and evict is policy.
 * A response for a block the policy no longer admits is dropped as well (C8).
 */
export class PageCache<TData = unknown> {
  private readonly options: PageCacheOptions<TData>;
  private readonly getPageSize: () => number;
  private readonly isBlockAdmitted: (blockIndex: number) => boolean;
  private generation = 0;
  private knownTotal = false;
  private readonly loaded = new Set<number>();
  private readonly pendingBlocks = new Map<number, Promise<void>>();

  constructor(
    options: PageCacheOptions<TData>,
    getPageSize: () => number,
    isBlockAdmitted: (blockIndex: number) => boolean = () => true,
  ) {
    this.options = options;
    this.getPageSize = getPageSize;
    this.isBlockAdmitted = isBlockAdmitted;
  }

  reset(): void {
    this.generation += 1;
    this.clear();
  }

  clear(): void {
    this.knownTotal = false;
    this.loaded.clear();
    this.pendingBlocks.clear();
    this.options.getCachedRows().clear();
  }

  getGeneration(): number {
    return this.generation;
  }

  hasKnownTotal(): boolean {
    return this.knownTotal;
  }

  isLoaded(blockIndex: number): boolean {
    return this.loaded.has(blockIndex);
  }

  loadedBlocks(): ReadonlySet<number> {
    return this.loaded;
  }

  /** Resolves the requests for every not-yet-loaded block. */
  ensureBlocks(
    blockIndexes: readonly number[],
    generation: number,
  ): Promise<void>[] {
    return blockIndexes
      .map((blockIndex) => this.getOrCreateBlockRequest(blockIndex, generation))
      .filter((task): task is Promise<void> => task !== null);
  }

  deleteBlocks(blockIndexes: Iterable<number>): void {
    for (const blockIndex of blockIndexes) {
      this.loaded.delete(blockIndex);
      this.deleteRowsForBlock(blockIndex);
    }
  }

  private getOrCreateBlockRequest(
    blockIndex: number,
    generation: number,
  ): Promise<void> | null {
    if (this.loaded.has(blockIndex)) {
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

  private async fetchBlock(
    blockIndex: number,
    generation: number,
  ): Promise<void> {
    const startRow = blockIndex * this.getPageSize();
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

    if (generation === this.generation && this.isBlockAdmitted(blockIndex)) {
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

    const startRow = blockIndex * this.getPageSize();
    rows.forEach((row, index) => {
      if (row !== undefined) {
        cachedRows.set(startRow + index, row);
      }
    });

    this.options.setTotalRows(totalRows);
    this.knownTotal = true;
    this.loaded.add(blockIndex);

    if (totalRows < previousTotalRows) {
      this.deleteRowsAfterTotal(totalRows);
    }
  }

  private getBlockEndRow(blockIndex: number): number {
    const startRow = blockIndex * this.getPageSize();
    const candidate = startRow + this.getPageSize();
    const totalRows = this.options.getTotalRows();
    if (this.knownTotal && totalRows > 0) {
      return Math.min(candidate, totalRows);
    }
    return candidate;
  }

  private deleteRowsForBlock(blockIndex: number): void {
    const cachedRows = this.options.getCachedRows();
    const startRow = blockIndex * this.getPageSize();
    const endRow = startRow + this.getPageSize();
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
