// packages/core/src/grid-core-header.ts
// `GridCore.header`: the header bands (PRD 007 D8). Core owns the header
// height. Every band change, of the heights or of the band count, runs through
// one applier that gives the body what the header no longer takes and keeps
// the suffix row at the clip top where it was.

import type { GridInstruction } from "./types";
import type { HeaderBandLayout } from "./types/geometry";
import type { RowAnchor } from "./geometry";
import type { ViewportState } from "./managers";
import { resolveHeaderBandHeights, type GridCoreConfig } from "./grid-core-config";
import {
  captureSizeAnchor,
  resyncAfterSizeChange,
  type SizeChangeDeps,
} from "./grid-core-size-change";
import { isSameArray } from "./utils/arrays";
import { normalizeSize } from "./utils/number-guards";

export interface GridHeaderApi {
  /** The bands of the visible hierarchy, one while flat; reused while unchanged. */
  getBands(): HeaderBandLayout;
  /**
   * Replace the configured heights, indexed by band; a band without one is
   * `headerHeight`. Each must be finite and `> 0`, otherwise nothing is
   * applied and a `RangeError` is thrown. A value-equal list emits nothing.
   */
  setBandHeights(heights: readonly number[]): void;
}

export interface HeaderControllerDeps<TData> extends SizeChangeDeps<TData> {
  config: Pick<GridCoreConfig<TData>, "headerHeight" | "headerBandHeights">;
  viewport: ViewportState;
  isDestroyed: () => boolean;
}

/** Published by the command and again by the re-sync; a batch keeps the re-sync's. */
const RESYNC_REPLACES: ReadonlySet<GridInstruction["type"]> = new Set([
  "SET_CONTENT_SIZE",
  "SET_COLUMN_WINDOW",
]);

/**
 * The layout of `count` bands. `configured` entries past the count are
 * ignored, and `previous` is returned while every height is unchanged.
 */
export const resolveHeaderBands = (
  count: number,
  headerHeight: number,
  configured: readonly number[],
  previous: HeaderBandLayout | null = null,
): HeaderBandLayout => {
  const heights = Array.from({ length: count }, (_, band) => configured[band] ?? headerHeight);
  if (previous !== null && isSameArray(previous.heights, heights)) return previous;
  const offsets: number[] = [];
  let totalHeight = 0;
  for (const height of heights) {
    offsets.push(totalHeight);
    totalHeight += height;
  }
  return { count, heights, offsets, totalHeight };
};

export class HeaderController<TData> implements GridHeaderApi {
  private readonly deps: HeaderControllerDeps<TData>;
  private heights: readonly number[];
  private bands: HeaderBandLayout | null = null;
  /** The configured list `bands` was resolved from. */
  private bandsHeights: readonly number[] | null = null;
  /** Geometry revision the band count was last read at. */
  private bandsRevision = -1;

  constructor(deps: HeaderControllerDeps<TData>) {
    this.deps = deps;
    this.heights = deps.config.headerBandHeights;
  }

  getBands(): HeaderBandLayout {
    const geometry = this.deps.getGeometry();
    const cached = this.bands;
    const hasSameHeights = this.bandsHeights === this.heights;
    // The scroll mapping reads the header height many times per sample, and a
    // new layout snapshot always advances the revision.
    if (cached !== null && hasSameHeights && this.bandsRevision === geometry.revision) return cached;
    const { bandCount } = geometry.getColumnLayout();
    this.bandsRevision = geometry.revision;
    if (cached?.count === bandCount && hasSameHeights) return cached;
    this.bands = resolveHeaderBands(bandCount, this.deps.config.headerHeight, this.heights, cached);
    this.bandsHeights = this.heights;
    return this.bands;
  }

  setBandHeights(heights: readonly number[]): void {
    if (this.deps.isDestroyed()) return;
    const next = resolveHeaderBandHeights(heights);
    if (isSameArray(next, this.heights)) return;
    this.applyBandChange(() => {
      this.heights = next;
    });
  }

  /**
   * Run `change` in one batch; when it moved the bands, adopt them atomically
   * with the body height, the anchor and the rows (D8). Column commands that
   * can change the band count run their guard in here.
   *
   * @internal
   */
  applyBandChange<T>(change: () => T): T {
    const { batcher } = this.deps;
    const previous = this.getBands();
    const anchor = captureSizeAnchor(this.deps);
    batcher.start();
    try {
      const value = change();
      const bands = this.getBands();
      if (bands !== previous) this.adoptBands(bands.totalHeight - previous.totalHeight, anchor);
      return value;
    } finally {
      batcher.flush();
    }
  }

  private adoptBands(growth: number, anchor: RowAnchor | null): void {
    const { deps } = this;
    deps.batcher.replacing(RESYNC_REPLACES, () => {
      // The body is what a fixed container leaves below the header.
      deps.viewport.setViewportHeight(normalizeSize(deps.viewport.getViewportHeight() - growth));
      resyncAfterSizeChange(deps, anchor);
    });
  }
}
