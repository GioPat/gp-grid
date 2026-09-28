// packages/core/src/grid-core-row-heights.ts
// `GridCore.rowHeights`: application-set row heights, and the atomic size
// change that keeps the suffix row at the clip top where it was (D5).

import type { RowHeightUpdate, RowId } from "./types";
import type { AxisBounds } from "./types/geometry";
import {
  captureRowAnchor,
  resolveAnchoredScrollTop,
  type GridGeometryService,
  type RowAnchor,
  type RowRegionMappingInput,
} from "./geometry";
import type { InstructionBatcher } from "./managers";
import type { LocateRowIds, RowHeightOverrides } from "./managers/row-height-overrides";
import type { RowDataManager } from "./managers/row-data-manager";
import type { ViewSync } from "./grid-core-view-sync";

export interface GridRowHeightsApi {
  /**
   * Set heights by row identity. Every `height` must be finite and `> 0`,
   * otherwise nothing is applied and a `RangeError` is thrown.
   */
  set(updates: readonly RowHeightUpdate[]): void;
  /** Drop the named heights, or all of them when `rowIds` is omitted. */
  reset(rowIds?: readonly RowId[]): void;
  /**
   * Stored heights in insertion order, including the ones still waiting for
   * their row, so an application can persist and restore them.
   */
  getOverrides(): readonly RowHeightUpdate[];
}

export interface RowHeightsControllerDeps<TData> {
  batcher: InstructionBatcher;
  overrides: RowHeightOverrides;
  getGeometry: () => GridGeometryService;
  getRowData: () => RowDataManager<TData>;
  getView: () => ViewSync<TData>;
  /** Commits geometry and emits any clamp correction inside the open batch. */
  refreshGeometry: () => void;
  /** Writes a corrected DOM scroll top to whichever sample is in charge. */
  writeScrollTop: (domScrollTop: number) => void;
  isDestroyed: () => boolean;
}

const missingIds = (ids: ReadonlySet<RowId>, found: Map<RowId, number>): Set<RowId> => {
  const missing = new Set<RowId>();
  for (const rowId of ids) {
    if (found.has(rowId) === false) missing.add(rowId);
  }
  return missing;
};

export class RowHeightsController<TData> implements GridRowHeightsApi {
  private readonly deps: RowHeightsControllerDeps<TData>;

  /** Frozen prefix, then the mounted window, then one full resident scan. */
  private readonly locateRows: LocateRowIds = (ids) => {
    const found = new Map<RowId, number>();
    const { frozenCount } = this.deps.getGeometry().getRowRegions();
    this.collect(ids, found, { start: 0, end: frozenCount });
    this.collect(ids, found, this.deps.getGeometry().getRowWindow());
    this.collect(ids, found);
    return found;
  };

  /** One resident scan, for arrivals and re-placements after a revision. */
  private readonly scanRows: LocateRowIds = (ids) =>
    this.deps.getRowData().locateRowIds(ids);

  constructor(deps: RowHeightsControllerDeps<TData>) {
    this.deps = deps;
  }

  set(updates: readonly RowHeightUpdate[]): void {
    if (this.deps.isDestroyed()) return;
    this.applySizeChange(() => this.deps.overrides.set(updates, this.locateRows));
  }

  reset(rowIds?: readonly RowId[]): void {
    if (this.deps.isDestroyed()) return;
    this.applySizeChange(() => this.deps.overrides.reset(rowIds));
  }

  getOverrides(): readonly RowHeightUpdate[] {
    return this.deps.overrides.getOverrides();
  }

  /** D7: a page that places a pending height is a size change like any other. */
  onRowsLoaded(totalRowsChanged: boolean): void {
    if (this.deps.isDestroyed()) return;
    if (this.deps.overrides.hasPending()) {
      const placed = this.applySizeChange(() => this.deps.overrides.placePending(this.scanRows));
      if (placed) return;
    }
    this.deps.getView().syncVisibleRows(totalRowsChanged);
  }

  /** D6: a moved row keeps its height by identity, with no anchor correction. */
  onRowsMoved(): void {
    if (this.deps.isDestroyed()) return;
    const { overrides, getRowData } = this.deps;
    getRowData().bumpDataRevision();
    if (overrides.size === 0) return;
    this.deps.batcher.start();
    try {
      this.deps.refreshGeometry();
      this.deps.getView().syncVisibleRows(true);
    } finally {
      this.deps.batcher.flush();
    }
  }

  clear(): void {
    this.deps.overrides.clear();
  }

  /** One atomic size change: anchor, geometry, scroll correction, rows (D5). */
  private applySizeChange(mutate: () => boolean): boolean {
    const { batcher } = this.deps;
    const anchor = captureRowAnchor(this.frame());
    if (mutate() === false) return false;
    batcher.start();
    try {
      this.deps.refreshGeometry();
      this.applyAnchorCorrection(anchor);
      this.deps.getRowData().requestVisibleRows();
      this.deps.getView().syncVisibleRows(true);
    } finally {
      batcher.flush();
    }
    return true;
  }

  private applyAnchorCorrection(anchor: RowAnchor | null): void {
    if (anchor === null) return;
    const corrected = resolveAnchoredScrollTop(anchor, this.frame());
    if (corrected === null) return;
    this.deps.writeScrollTop(corrected);
    this.deps.batcher.emit({ type: "SCROLL_TO", scrollTop: corrected });
  }

  /** C5 frame at the live sample: hits, clips and the anchor all read it. */
  private frame(): RowRegionMappingInput {
    return this.deps.getGeometry().getRowGeometry().getRegionInput();
  }

  private collect(
    ids: ReadonlySet<RowId>,
    found: Map<RowId, number>,
    range?: AxisBounds,
  ): void {
    const missing = missingIds(ids, found);
    if (missing.size === 0) return;
    for (const [rowId, index] of this.deps.getRowData().locateRowIds(missing, range)) {
      found.set(rowId, index);
    }
  }
}
