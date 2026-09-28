// packages/core/src/managers/row-height-overrides.ts
// Application-set row heights (D1, D2): the stored heights by identity, the
// ones still waiting for their row, and the placed sizes the axis is built
// from. Everything here is O(overrides); nothing is per row.

import type { RowHeightUpdate, RowId } from "../types";
import type { AxisBounds } from "../types/geometry";
import { assertPositiveFinite } from "../geometry/offsets";
import type { PlacedRowSize } from "../geometry/override-axis";

/** Identity lookup: the indices of the requested IDs, omitting the missing. */
export type LocateRowIds = (
  ids: ReadonlySet<RowId>,
  range?: AxisBounds,
) => Map<RowId, number>;

/** Revision and identity context a placement pass runs against (D6). */
export interface PlacedRowSizeSource {
  revision: number;
  rowCount: number;
  defaultSize: number;
  stableIdentity: boolean;
  /** One resident scan for identities the mounted window does not hold. */
  scan: LocateRowIds;
}

export interface RowHeightOverridesDeps {
  /** Creation-time height of every row. */
  getRowHeight: () => number;
  getRowCount: () => number;
  /** Whether the bound source exposes a stable identity (D2). */
  hasStableIdentity: () => boolean;
  /** Data revision of the current query (D6). */
  getDataRevision: () => number;
}

interface PlacementContext {
  revision: number;
  rowCount: number;
  defaultSize: number;
  stableIdentity: boolean;
}

/** Stable identity for the empty placement: the axis memo compares arrays. */
const NO_PLACED: readonly PlacedRowSize[] = [];

/** An index-keyed placement, only for an integer identity inside the axis. */
const indexIdentityOf = (rowId: RowId, rowCount: number): number | undefined => {
  const usable =
    typeof rowId === "number" && Number.isSafeInteger(rowId) && rowId >= 0 && rowId < rowCount;
  return usable ? rowId : undefined;
};

const assertUpdates = (updates: readonly RowHeightUpdate[]): void => {
  for (const update of updates) {
    assertPositiveFinite(update.height, `row height for row "${update.rowId}"`);
  }
};

const isSamePlaced = (a: readonly PlacedRowSize[], b: readonly PlacedRowSize[]): boolean => {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]!.index !== b[index]!.index) return false;
    if (a[index]!.size !== b[index]!.size) return false;
  }
  return true;
};

export class RowHeightOverrides {
  private readonly deps: RowHeightOverridesDeps;
  private readonly overrides = new Map<RowId, number>();
  /** Placement decided by index alone; dropped at the next data revision (D2). */
  private scoped = new Set<RowId>();
  private pending = new Set<RowId>();
  /** Placed index per identity, so a reset rebuilds without a lookup. */
  private placedById = new Map<RowId, number>();
  /** The axis input; only replaced when a placement actually changed (D3). */
  private placed: readonly PlacedRowSize[] = NO_PLACED;
  /** Data revision the current placement belongs to (D6). */
  private placedRevision: number;
  /** Row count the placement was checked against; a shrink unplaces rows past it. */
  private placedRowCount: number;

  constructor(deps: RowHeightOverridesDeps) {
    this.deps = deps;
    // Seeded from the live state, so a height set before the first load waits
    // for its row instead of being dropped by that load's revision.
    this.placedRevision = deps.getDataRevision();
    this.placedRowCount = deps.getRowCount();
  }

  get size(): number {
    return this.overrides.size;
  }

  hasPending(): boolean {
    return this.pending.size > 0;
  }

  getOverrides(): readonly RowHeightUpdate[] {
    return [...this.overrides].map(([rowId, height]) => ({ rowId, height }));
  }

  /** Store the heights, all or nothing, and place what the source holds. */
  set(updates: readonly RowHeightUpdate[], locate: LocateRowIds): boolean {
    assertUpdates(updates);
    const changed = new Set<RowId>();
    for (const { rowId, height } of updates) {
      if (this.overrides.get(rowId) === height) continue;
      this.overrides.set(rowId, height);
      changed.add(rowId);
    }
    const context = this.liveContext();
    if (changed.size === 0 && context.revision === this.placedRevision) return false;
    return this.settle(() => {
      // A moved revision invalidates every index, so everything is re-placed;
      // otherwise only the changed and still-waiting identities are looked up.
      if (this.advanceRevision(context.revision)) {
        this.placeAll(locate, context);
        return;
      }
      this.placeSome(new Set([...changed, ...this.pending]), locate, context);
    });
  }

  /** Drop the named overrides, or all of them, without any lookup. */
  reset(rowIds?: readonly RowId[]): boolean {
    const removed = rowIds ?? [...this.overrides.keys()];
    let dropped = false;
    for (const rowId of removed) {
      if (this.overrides.delete(rowId) === false) continue;
      dropped = true;
      this.pending.delete(rowId);
      this.scoped.delete(rowId);
      this.placedById.delete(rowId);
    }
    if (dropped === false) return false;
    return this.commitPlacement(this.placedById);
  }

  /** The axis input; re-placed once per data revision, then read per sync. */
  getPlaced(source: PlacedRowSizeSource): readonly PlacedRowSize[] {
    if (this.advanceRevision(source.revision)) this.placeAll(source.scan, source);
    // A page can lower the row count without a new revision.
    if (source.rowCount !== this.placedRowCount) this.trimToCount(source.rowCount);
    return this.placed;
  }

  /** Place the overrides whose row has arrived since the last pass. */
  placePending(scan: LocateRowIds): boolean {
    if (this.pending.size === 0) return false;
    const context = this.liveContext();
    return this.settle(() => {
      if (this.advanceRevision(context.revision)) {
        this.placeAll(scan, context);
        return;
      }
      this.placeSome(new Set(this.pending), scan, context);
    });
  }

  clear(): void {
    this.overrides.clear();
    this.scoped.clear();
    this.pending.clear();
    this.placedById.clear();
    this.placed = NO_PLACED;
    this.placedRevision = this.deps.getDataRevision();
    this.placedRowCount = this.deps.getRowCount();
  }

  private liveContext(): PlacementContext {
    return {
      revision: this.deps.getDataRevision(),
      rowCount: this.deps.getRowCount(),
      defaultSize: this.deps.getRowHeight(),
      stableIdentity: this.deps.hasStableIdentity(),
    };
  }

  /** Run a placement and report whether the axis input changed overall. */
  private settle(run: () => void): boolean {
    const before = this.placed;
    run();
    if (isSamePlaced(before, this.placed) === false) return true;
    // Intermediate rebuilds must not cost the axis its identity memo.
    this.placed = before;
    return false;
  }

  /**
   * Adopt a new data revision: index-scoped identities are dropped (D2) and
   * the caller must re-place everything. False while the revision is current.
   */
  private advanceRevision(revision: number): boolean {
    if (revision === this.placedRevision) return false;
    this.placedRevision = revision;
    for (const rowId of this.scoped) {
      this.overrides.delete(rowId);
    }
    this.scoped.clear();
    return true;
  }

  private placeAll(resolve: LocateRowIds, context: PlacementContext): void {
    this.placedById = new Map();
    this.pending = new Set();
    this.scoped = new Set();
    this.placeSome(new Set(this.overrides.keys()), resolve, context);
  }

  /** Re-place `ids` only; every other placement keeps its index. */
  private placeSome(ids: ReadonlySet<RowId>, resolve: LocateRowIds, context: PlacementContext): void {
    const { rowCount, defaultSize, stableIdentity } = context;
    const indices = new Map(this.placedById);
    const wanted = new Set<RowId>();
    for (const rowId of ids) {
      indices.delete(rowId);
      this.pending.delete(rowId);
      this.scoped.delete(rowId);
      const height = this.overrides.get(rowId);
      if (height !== undefined && height !== defaultSize) wanted.add(rowId);
    }
    const located = stableIdentity && wanted.size > 0 ? resolve(wanted) : null;

    for (const rowId of wanted) {
      const index = stableIdentity
        ? located?.get(rowId)
        : indexIdentityOf(rowId, rowCount);
      if (index === undefined || index >= rowCount) {
        this.pending.add(rowId);
        continue;
      }
      if (stableIdentity === false) this.scoped.add(rowId);
      indices.set(rowId, index);
    }
    this.placedRowCount = rowCount;
    this.commitPlacement(indices);
  }

  /** Rows past a lowered count wait again for their row to arrive. */
  private trimToCount(rowCount: number): void {
    this.placedRowCount = rowCount;
    const kept = new Map<RowId, number>();
    for (const [rowId, index] of this.placedById) {
      if (index < rowCount) {
        kept.set(rowId, index);
        continue;
      }
      this.pending.add(rowId);
      this.scoped.delete(rowId);
    }
    if (kept.size !== this.placedById.size) this.commitPlacement(kept);
  }

  /** Rebuild the sorted axis input; the array survives an unchanged placement. */
  private commitPlacement(indices: Map<RowId, number>): boolean {
    this.placedById = indices;
    const next: PlacedRowSize[] = [];
    for (const [rowId, index] of indices) {
      const size = this.overrides.get(rowId);
      if (size !== undefined) next.push({ index, size });
    }
    next.sort((a, b) => a.index - b.index);
    if (isSamePlaced(this.placed, next)) return false;
    this.placed = next.length === 0 ? NO_PLACED : next;
    return true;
  }
}
