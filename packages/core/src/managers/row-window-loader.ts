import type {
  ColumnDefinition,
  DataSource,
  FilterModel,
  RowCacheOptions,
  SortModel,
} from "../types";
import type { AxisBounds } from "../types/geometry";
import type { RowRegionLayout } from "../geometry/row-regions";
import type { VirtualAxis } from "../geometry/virtual-axis";
import { PageCache } from "./page-cache";
import {
  admitOptionalPages,
  evictionCandidates,
  getRequiredPageBlocks,
  getRequiredPageRanges,
  getWindowPageBlocks,
  resolvePrefixReservations,
  type BlockRange,
  type PageBudget,
} from "./page-reservation";
import {
  normalizeRowCacheOptions,
  type NormalizedRowCacheOptions,
} from "./row-cache-options";

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

/** Capacity inputs for C2's prefix predicate; never reads the region layout. */
export interface RowPageBudgetInput {
  axis: VirtualAxis;
  /** Full body height: the page helper subtracts the frozen prefix itself. */
  viewportHeight: number;
  scrollTop: number;
  maxScrollTop: number;
}

/** Sample the strict paging path resolves its blocks from. */
export interface RowLoadContext extends RowPageBudgetInput {
  /** Visible suffix window, half-open. */
  visibleWindow: AxisBounds;
  /** Overscanned suffix window, half-open. */
  overscanWindow: AxisBounds;
  regions: RowRegionLayout;
}

export interface RowWindowLoaderOptions<TData> {
  getDataSource: () => DataSource<TData>;
  getCachedRows: () => Map<number, TData>;
  getTotalRows: () => number;
  setTotalRows: (count: number) => void;
  getSortModel: () => SortModel[];
  getFilterModel: () => FilterModel;
  getColumns: () => ColumnDefinition[];
  /** Capacity inputs; must not read the region layout (C2 resolves inside it). */
  getPageBudgetInput: () => RowPageBudgetInput;
  /** Windows and the published C9 layout for the load being computed. */
  getLoadContext: () => RowLoadContext;
}

const notApplied = (): RowWindowLoadResult => ({ applied: false, loadedBlockCount: 0, totalRowsChanged: false });

const appliedResult = (before: number, after: number, loaded: number): RowWindowLoadResult => ({
  applied: true,
  loadedBlockCount: loaded,
  totalRowsChanged: before !== after,
});

const blocksBetween = (first: number, last: number): number[] =>
  Array.from({ length: last - first + 1 }, (_, index) => first + index);

/**
 * Fetches aligned row blocks around the viewport and evicts rows outside the
 * cache budget, through the injected getters only. A positive frozen count
 * switches it to C8's noncontiguous policy: prefix plus visible suffix blocks.
 */
export class RowWindowLoader<TData = unknown> {
  private readonly options: RowWindowLoaderOptions<TData>;
  private readonly cache: PageCache<TData>;
  private cacheOptions: NormalizedRowCacheOptions;
  /** Prefix blocks the current frozen count reserves. */
  private prefixReservations: readonly number[] = [];
  /** Required set and center of the latest load, not of the resolving call. */
  private latestProtected: ReadonlySet<number> = new Set();
  private latestCenter = 0;
  /** Blocks the latest strict load admitted; null while the flat path applies. */
  private admittedBlocks: Set<number> | null = null;

  constructor(
    options: RowWindowLoaderOptions<TData>,
    cacheOptions?: RowCacheOptions,
  ) {
    this.options = options;
    this.cacheOptions = normalizeRowCacheOptions(cacheOptions);
    this.cache = new PageCache<TData>(
      options,
      () => this.cacheOptions.pageSize,
      (blockIndex) => this.admittedBlocks === null || this.admittedBlocks.has(blockIndex),
    );
  }

  configure(cacheOptions: RowCacheOptions | undefined): void {
    this.cacheOptions = normalizeRowCacheOptions(cacheOptions);
  }

  getPageSize(): number {
    return this.cacheOptions.pageSize;
  }

  /** C8 capacity inputs for C2's cache predicate. */
  getPageBudget(): PageBudget {
    return {
      ...this.options.getPageBudgetInput(),
      pageSize: this.cacheOptions.pageSize,
      maxPages: this.cacheOptions.maxPages,
    };
  }

  reset(): void {
    this.cache.reset();
    this.prefixReservations = [];
  }

  hasMissingRows(range: RowWindowRange): boolean {
    if (range.endRow <= range.startRow) return false;
    const endRow = this.getLoadableEndRow(range.startRow, range.endRow);
    if (endRow === null) return false;

    const cachedRows = this.options.getCachedRows();
    for (let row = range.startRow; row < endRow; row += 1) {
      if (cachedRows.has(row)) continue;
      return true;
    }
    return false;
  }

  /** Rows a range may load, or null when a known total excludes it. */
  private getLoadableEndRow(startRow: number, endRow: number): number | null {
    const totalRows = this.options.getTotalRows();
    if (this.cache.hasKnownTotal() === false) return endRow;
    if (totalRows === 0 || startRow >= totalRows) return null;
    return Math.min(endRow, totalRows);
  }

  async loadRange(
    range: RowWindowRange,
    resetCache: boolean = false,
  ): Promise<RowWindowLoadResult> {
    if (resetCache) this.reset();
    const context = this.options.getLoadContext();
    if (context.regions.frozenCount === 0) return this.loadFlatRange(range);
    return this.loadStrictRange(context);
  }

  /** Today's single-range policy: visible window plus prefetch, gap included. */
  private async loadFlatRange(range: RowWindowRange): Promise<RowWindowLoadResult> {
    const generation = this.cache.getGeneration();
    const totalRowsBefore = this.options.getTotalRows();
    this.admittedBlocks = null;

    const blocks = this.getBlocksForRange(range);
    this.syncPrefixReservations(0, blocks);
    this.recordLatest(blocks, Math.floor(range.startRow / this.cacheOptions.pageSize));
    const tasks = this.cache.ensureBlocks(blocks, generation);
    if (tasks.length > 0) await Promise.all(tasks);
    if (generation !== this.cache.getGeneration()) return notApplied();

    this.evictAround();
    return appliedResult(totalRowsBefore, this.options.getTotalRows(), tasks.length);
  }

  /** C8 rules 1–3: required union, eviction, then optional pages. */
  private async loadStrictRange(context: RowLoadContext): Promise<RowWindowLoadResult> {
    const generation = this.cache.getGeneration();
    const totalRowsBefore = this.options.getTotalRows();
    const position = {
      ...this.options.getPageBudgetInput(),
      pageSize: this.cacheOptions.pageSize,
      frozenCount: context.regions.frozenCount,
    };
    const ranges = getRequiredPageRanges(position);
    const required = getRequiredPageBlocks(position);
    const reserved = this.syncPrefixReservations(position.frozenCount, required);
    this.recordLatest(
      [...required, ...reserved],
      Math.floor(context.visibleWindow.start / this.cacheOptions.pageSize),
    );
    this.evictToCapacity();

    const admitted = admitOptionalPages({
      required,
      loaded: [...this.cache.loadedBlocks()],
      reserved,
      maxPages: this.cacheOptions.maxPages,
      overscan: getWindowPageBlocks(context.overscanWindow, this.cacheOptions.pageSize),
      prefetch: this.getPrefetchBlocks(ranges.suffix),
      gap: ranges.gap,
    });
    const blocks = [...required, ...admitted];
    this.admittedBlocks = new Set(blocks);

    const tasks = this.cache.ensureBlocks(blocks, generation);
    if (tasks.length > 0) await Promise.all(tasks);
    if (generation !== this.cache.getGeneration()) return notApplied();

    return appliedResult(totalRowsBefore, this.options.getTotalRows(), tasks.length);
  }

  /** Flat blocks: visible window widened by `prefetchPages` both ways. */
  private getBlocksForRange(range: RowWindowRange): number[] {
    if (range.endRow <= range.startRow) return [];
    const endRow = this.getLoadableEndRow(range.startRow, range.endRow);
    if (endRow === null) return [];

    const pageSize = this.cacheOptions.pageSize;
    const firstBlock = Math.max(
      0,
      Math.floor(range.startRow / pageSize) - this.cacheOptions.prefetchPages,
    );
    const lastBlock = this.getLastPrefetchBlock(Math.floor((endRow - 1) / pageSize));
    return blocksBetween(firstBlock, lastBlock);
  }

  private getLastPrefetchBlock(lastBlock: number): number {
    const candidate = lastBlock + this.cacheOptions.prefetchPages;
    const totalRows = this.options.getTotalRows();
    if (this.cache.hasKnownTotal() === false || totalRows === 0) return candidate;
    const lastKnownBlock = Math.floor(
      (totalRows - 1) / this.cacheOptions.pageSize,
    );
    return Math.min(candidate, lastKnownBlock);
  }

  /** `prefetchPages` beyond each end of the required suffix range (C8 rule 2). */
  private getPrefetchBlocks(suffix: BlockRange | null): number[] {
    if (suffix === null) return [];
    const before = Math.max(0, suffix.start - this.cacheOptions.prefetchPages);
    const after = this.getLastPrefetchBlock(suffix.end - 1);
    return [...blocksBetween(before, suffix.start - 1), ...blocksBetween(suffix.end, after)];
  }

  private recordLatest(blocks: readonly number[], center: number): void {
    this.latestProtected = new Set(blocks);
    this.latestCenter = center;
  }

  // A released block the current load requires stays cached: dropping it would
  // blank a visible row until its refetch lands, and required pages never go.
  private syncPrefixReservations(
    frozenCount: number,
    required: readonly number[],
  ): readonly number[] {
    const pageSize = this.cacheOptions.pageSize;
    const reservation = resolvePrefixReservations(
      this.prefixReservations,
      frozenCount,
      pageSize,
    );
    this.prefixReservations = reservation.pages;
    const kept = new Set(required);
    const dropped = reservation.released.filter((block) => kept.has(block) === false);
    if (dropped.length > 0) this.cache.deleteBlocks(dropped);
    return reservation.pages;
  }

  /** Strict capacity: loaded plus protected never exceeds max(maxPages, |required|). */
  private evictToCapacity(): void {
    const capacity = Math.max(this.cacheOptions.maxPages, this.latestProtected.size);
    const used = new Set([...this.cache.loadedBlocks(), ...this.latestProtected]);
    this.evictExcess(used.size - capacity);
  }

  /** Flat policy: soft overflow that evicts only down to the cap. */
  private evictAround(): void {
    this.evictExcess(this.cache.loadedBlocks().size - this.cacheOptions.maxPages);
  }

  /** Unprotected pages leave farthest-from-center first, never a required one. */
  private evictExcess(over: number): void {
    if (over <= 0) return;
    const candidates = evictionCandidates({
      loaded: [...this.cache.loadedBlocks()],
      protectedBlocks: [...this.latestProtected],
      center: this.latestCenter,
    });
    this.cache.deleteBlocks(candidates.slice(0, over));
  }
}
