// packages/core/src/grid-core-frozen-rows.ts
// Runtime freeze configuration for GridCore: the stored options, the request
// the geometry resolves, and the atomic apply with its scroll correction.

import type { FreezeRowsOptions } from "./types";
import {
  resolveRegionScrollCorrection,
  type FrozenRowsRequest,
  type FrozenRowsState,
  type GridGeometryService,
} from "./geometry";
import type { EditManager } from "./edit-manager";
import type { InstructionBatcher } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import type { ViewSync } from "./grid-core-view-sync";
import { resolveFreezeRowsOptions } from "./grid-core-config";

type ResolvedFreezeRows = Readonly<Required<FreezeRowsOptions>>;

export interface GridFrozenRowsApi {
  /**
   * Replace the freeze configuration; omitted fields take the option defaults.
   * A value-equal request emits nothing, so wrappers call this on every prop
   * identity change.
   */
  set(config?: FreezeRowsOptions): void;
  /** Freeze through a view index over the current limits; `-1` unfreezes. */
  freezeThrough(viewIndex: number): void;
  /**
   * Effective prefix and the reason the requested count was reduced. The
   * first resolution is the baseline of `onFrozenRowsChanged` and never fires it.
   */
  get(): FrozenRowsState;
}

export interface FrozenRowsControllerDeps<TData> {
  initial: ResolvedFreezeRows;
  batcher: InstructionBatcher;
  getGeometry: () => GridGeometryService;
  getRowData: () => RowDataManager<TData>;
  getView: () => ViewSync<TData>;
  getEditManager: () => EditManager;
  /** Commits geometry and emits any clamp correction inside the open batch. */
  refreshGeometry: () => void;
  /** Writes a corrected DOM scroll top to whichever sample is in charge. */
  writeScrollTop: (domScrollTop: number) => void;
  isDestroyed: () => boolean;
}

const createFrozenRowsRequest = (options: ResolvedFreezeRows): FrozenRowsRequest | null => {
  const { count, maxCount, minSuffixHeight } = options;
  return count > 0 ? { requestedCount: count, maxCount, minSuffixHeight } : null;
};

/** `admitsPrefix` is composed on read, so it is not part of the identity. */
const isSameFrozenRowsRequest = (
  a: FrozenRowsRequest | null,
  b: FrozenRowsRequest | null,
): boolean => {
  if (a === null || b === null) return a === b;
  return a.requestedCount === b.requestedCount &&
    a.maxCount === b.maxCount &&
    a.minSuffixHeight === b.minSuffixHeight;
};

export class FrozenRowsController<TData> implements GridFrozenRowsApi {
  private readonly deps: FrozenRowsControllerDeps<TData>;
  private options: ResolvedFreezeRows;
  private request: FrozenRowsRequest | null;
  // First resolution, captured over the empty axis; it never fires the event.
  private baseline: FrozenRowsState | null = null;

  constructor(deps: FrozenRowsControllerDeps<TData>) {
    this.deps = deps;
    this.options = deps.initial;
    this.request = createFrozenRowsRequest(deps.initial);
  }

  /** Request for the geometry; the cache predicate is composed per refresh. */
  getRequest(): FrozenRowsRequest | null {
    if (this.request === null) return null;
    return {
      ...this.request,
      admitsPrefix: this.request.admitsPrefix ?? this.deps.getRowData().getPrefixAdmission(),
    };
  }

  captureBaseline(): void {
    this.baseline = this.get();
  }

  get(): FrozenRowsState {
    return this.deps.getGeometry().getRowRegions().frozen;
  }

  getBaseline(): FrozenRowsState {
    return this.baseline ?? this.get();
  }

  set(config?: FreezeRowsOptions): void {
    if (this.deps.isDestroyed()) return;
    const options = resolveFreezeRowsOptions(config);
    const request = createFrozenRowsRequest(options);
    const changed = isSameFrozenRowsRequest(request, this.request) === false;
    this.options = options;
    if (changed) this.apply(request);
  }

  freezeThrough(viewIndex: number): void {
    this.set({ ...this.options, count: viewIndex + 1 });
  }

  /**
   * The C2 request seam. One batch keeps the published count, the anchor
   * correction and the slots atomic.
   *
   * @internal
   */
  apply(request: FrozenRowsRequest | null): void {
    if (this.deps.isDestroyed()) return;
    const { batcher, getGeometry } = this.deps;
    const previous = getGeometry().getRowRegions();
    this.request = request;
    batcher.start();
    try {
      this.deps.refreshGeometry();
      // Before the slot sync: a region flip must not invalidate the open
      // edit's assignment first (mirrors commitHiddenEdit).
      this.commitRegionChangedEdit(previous.frozenCount);
      // Before requestVisibleRows: the prefix/suffix request and every
      // published window must answer from the corrected sample.
      this.applyScrollCorrection(previous.frozenExtent);
      // Freezing fetches the prefix and unfreezing releases it without a
      // scroll sample; a non-paginated source keeps this a no-op.
      this.deps.getRowData().requestVisibleRows();
      this.deps.getView().syncVisibleRows(true);
    } finally {
      batcher.flush();
    }
  }

  /** Growing the block lowers the scroll top by the extent delta, anchoring the suffix. */
  private applyScrollCorrection(previousFrozenExtent: number): void {
    const geometry = this.deps.getGeometry();
    const corrected = resolveRegionScrollCorrection({
      mapper: geometry.getRowGeometry().getMapper(),
      frozenExtent: geometry.getRowRegions().frozenExtent,
      previousFrozenExtent,
    });
    if (corrected === null) return;
    this.deps.writeScrollTop(corrected);
    this.deps.batcher.emit({ type: "SCROLL_TO", scrollTop: corrected });
  }

  /** A row that stays in its region keeps its editor and draft. */
  private commitRegionChangedEdit(previousFrozenCount: number): void {
    const editManager = this.deps.getEditManager();
    const edit = editManager.getState();
    if (edit === null) return;
    const wasFrozen = edit.row < previousFrozenCount;
    const isFrozen = edit.row < this.deps.getGeometry().getRowRegions().frozenCount;
    if (wasFrozen === isFrozen) return;
    editManager.commit(edit.editId);
  }
}
