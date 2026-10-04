// packages/core/src/grid-core-header-bands-sync.ts
// Header-band publication for ViewSync (D8). Object identity is the change
// contract: the header controller reuses the layout while the band count and
// every height are unchanged, so a new hierarchy that keeps them emits nothing.

import type { HeaderBandLayout } from "./types/geometry";
import type { InstructionBatcher } from "./managers";

export interface HeaderBandsSyncDeps {
  batcher: InstructionBatcher;
}

export class HeaderBandsSync {
  private readonly deps: HeaderBandsSyncDeps;
  /** Layout last published; identical means nothing to re-emit. */
  private emittedBands: HeaderBandLayout | null = null;

  constructor(deps: HeaderBandsSyncDeps) {
    this.deps = deps;
  }

  publish(bands: HeaderBandLayout, revision: number): void {
    if (bands === this.emittedBands) return;
    this.emittedBands = bands;
    this.deps.batcher.emit({ type: "SET_HEADER_BANDS", bands, revision });
  }
}
