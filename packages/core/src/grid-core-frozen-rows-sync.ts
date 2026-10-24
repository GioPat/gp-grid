// packages/core/src/grid-core-frozen-rows-sync.ts
// Frozen/suffix publication for ViewSync: the C9 region layout instruction,
// the C9 change event and the C13 live-region announcement. Object identity
// is the layout change contract — the geometry reuses the layout while
// membership and extents are unchanged.

import type { FrozenRowsState, RowRegionLayout } from "./geometry";
import type { InstructionBatcher } from "./managers";
import { type GridLabels, formatLabel } from "./i18n";

export interface FrozenRowsSyncDeps {
  batcher: InstructionBatcher;
  labels: GridLabels;
  /** The core's first resolution; comparing against it never fires. */
  getFrozenRowsBaseline: () => FrozenRowsState;
  onFrozenRowsChanged?: (state: FrozenRowsState) => void;
}

const isSameState = (a: FrozenRowsState, b: FrozenRowsState): boolean =>
  a.effectiveCount === b.effectiveCount && a.limit === b.limit;

export class FrozenRowsSync {
  private readonly deps: FrozenRowsSyncDeps;
  /** Layout last published; identical means nothing to re-emit. */
  private emittedRegions: RowRegionLayout | null = null;
  /** Last state the event reported; `null` until the baseline is passed. */
  private lastPublished: FrozenRowsState | null = null;

  constructor(deps: FrozenRowsSyncDeps) {
    this.deps = deps;
  }

  publish(regions: RowRegionLayout, revision: number): void {
    if (regions === this.emittedRegions) return;
    this.emittedRegions = regions;
    const { batcher, onFrozenRowsChanged } = this.deps;
    batcher.emit({ type: "SET_ROW_REGIONS", regions, revision });

    const previous = this.lastPublished ?? this.deps.getFrozenRowsBaseline();
    if (isSameState(previous, regions.frozen)) return;
    onFrozenRowsChanged?.(regions.frozen);
    this.lastPublished = regions.frozen;
    if (previous.limit === regions.frozen.limit) return;
    batcher.emit({
      type: "SET_ANNOUNCEMENT",
      announcement: { message: this.limitedMessage(regions.frozen), revision },
      revision,
    });
  }

  private limitedMessage(frozen: FrozenRowsState): string {
    return formatLabel(this.deps.labels.frozenRowsLimited, {
      effective: frozen.effectiveCount,
      requested: frozen.requestedCount,
    });
  }
}
