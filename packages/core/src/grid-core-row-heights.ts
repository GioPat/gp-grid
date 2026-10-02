// packages/core/src/grid-core-row-heights.ts
// `GridCore.rowHeights`: application-set row heights, the one-shot row fit,
// and the atomic size change that keeps the suffix row at the clip top where
// it was (D5).

import type { RowHeightUpdate, RowId, RowResizedEvent } from "./types";
import type { MeasurementHost, RowFitResult, RowFitSkip } from "./types/measurement";
import type { AxisBounds } from "./types/geometry";
import type { LocateRowIds, RowHeightOverrides } from "./managers/row-height-overrides";
import {
  captureSizeAnchor,
  resyncAfterSizeChange,
  type SizeChangeDeps,
} from "./grid-core-size-change";
import {
  resolveRowFit,
  unsupportedRowFit,
  type FitLimits,
  type FitTargets,
  type RowFitTarget,
} from "./grid-core-fit";

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
  /**
   * Fit mounted rows to their tallest rendered cell once, all of them when
   * `rowIds` is omitted. The heights are stored like `set`; issues no data
   * request.
   */
  fit(rowIds?: readonly RowId[]): RowFitResult;
  /**
   * Turn the user's row resize on or off: the row edge drag and double-click,
   * Alt+ArrowUp/Down and Alt+Shift+Enter. Emits nothing.
   */
  setResizable(enabled: boolean): void;
  /** Whether the user can resize rows; the `rowResize` option until changed. */
  isResizable(): boolean;
}

export interface RowHeightsControllerDeps<TData> extends SizeChangeDeps<TData> {
  overrides: RowHeightOverrides;
  isDestroyed: () => boolean;
  measurementHost?: MeasurementHost;
  /** `[minRowHeight, maxRowHeight]` of the `autoFit` option. */
  fitLimits: FitLimits;
  onRowResized?: (event: RowResizedEvent) => void;
  /** The `rowResize` option. */
  resizable: boolean;
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
  private resizable: boolean;

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
    this.resizable = deps.resizable;
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

  fit(rowIds?: readonly RowId[]): RowFitResult {
    const host = this.deps.measurementHost;
    if (this.deps.isDestroyed() || host === undefined) return unsupportedRowFit();
    const { targets, skipped } = this.resolveFitTargets(rowIds);
    const { result, changes } = resolveRowFit({
      measurement: host.measureRows(targets.map((target) => target.rowIndex)),
      layoutRevision: this.deps.getGeometry().getColumnWindow().layout.revision,
      targets,
      skipped,
      limits: this.deps.fitLimits,
      heightOf: (rowIndex) => this.heightAt(rowIndex),
    });
    if (result.rows.length > 0) {
      const updates = result.rows.map(({ rowId, height }) => ({ rowId, height }));
      this.applySizeChange(() => this.deps.overrides.set(updates, this.locateRows));
    }
    for (const { rowId, rowIndex, height } of changes) {
      this.deps.onRowResized?.({ rowId, height, viewIndex: rowIndex });
    }
    return result;
  }

  setResizable(enabled: boolean): void {
    this.resizable = enabled;
  }

  isResizable(): boolean {
    return this.resizable;
  }

  /**
   * A gesture's height for one row. Unlike `set`, a real change is reported
   * through `onRowResized`.
   *
   * @internal
   */
  resize(viewIndex: number, height: number): void {
    if (this.deps.isDestroyed()) return;
    const rowId = this.rowIdAt(viewIndex);
    if (rowId === undefined) return;
    const before = this.heightAt(viewIndex);
    this.set([{ rowId, height }]);
    const after = this.heightAt(viewIndex);
    if (after === before) return;
    this.deps.onRowResized?.({ rowId, height: after, viewIndex });
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
    const anchor = captureSizeAnchor(this.deps);
    if (mutate() === false) return false;
    batcher.start();
    try {
      resyncAfterSizeChange(this.deps, anchor);
    } finally {
      batcher.flush();
    }
    return true;
  }

  /** The named rows that are mounted, or every mounted row. */
  private resolveFitTargets(
    rowIds: readonly RowId[] | undefined,
  ): FitTargets<RowFitTarget, RowFitSkip> {
    const mounted = this.mountedRows();
    if (rowIds === undefined) {
      return { targets: [...mounted].map(([rowId, rowIndex]) => ({ rowId, rowIndex })), skipped: [] };
    }
    const targets: RowFitTarget[] = [];
    const skipped: RowFitSkip[] = [];
    for (const rowId of new Set(rowIds)) {
      const rowIndex = mounted.get(rowId);
      if (rowIndex === undefined) skipped.push({ rowId, reason: "not-mounted" });
      else targets.push({ rowId, rowIndex });
    }
    return { targets, skipped };
  }

  /** Loaded rows of the frozen prefix and the mounted window, by identity. */
  private mountedRows(): Map<RowId, number> {
    const geometry = this.deps.getGeometry();
    const { frozenCount } = geometry.getRowRegions();
    const rowWindow = geometry.getRowWindow();
    const mounted = new Map<RowId, number>();
    this.collectMounted(mounted, 0, frozenCount);
    this.collectMounted(mounted, rowWindow.start, rowWindow.end);
    return mounted;
  }

  private collectMounted(mounted: Map<RowId, number>, start: number, end: number): void {
    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      const rowId = this.rowIdAt(rowIndex);
      if (rowId !== undefined) mounted.set(rowId, rowIndex);
    }
  }

  /** Identity of a loaded row; its view index when the source exposes none. */
  private rowIdAt(viewIndex: number): RowId | undefined {
    const rowData = this.deps.getRowData();
    if (rowData.hasRow(viewIndex) === false) return undefined;
    return rowData.getRowId(viewIndex) ?? viewIndex;
  }

  private heightAt(viewIndex: number): number {
    const bounds = this.deps.getGeometry().getRowBounds(viewIndex, "content");
    return bounds === undefined ? 0 : bounds.end - bounds.start;
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
