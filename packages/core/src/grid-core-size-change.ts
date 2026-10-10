// packages/core/src/grid-core-size-change.ts
// The re-sync after a row or header size change (PRD 006 D5, PRD 007 D8):
// geometry, the anchor's scroll correction and the visible rows, so the suffix
// row stays at the clip top where it was.

import {
  captureRowAnchor,
  resolveAnchoredScrollTop,
  type GridGeometryService,
  type RowAnchor,
  type RowRegionMappingInput,
} from "./geometry";
import type { InstructionBatcher } from "./managers";
import type { RowDataManager } from "./managers/row-data-manager";
import type { ViewSync } from "./grid-core-view-sync";
import type { ViewportController } from "./grid-core-viewport";

export interface SizeChangeDeps<TData> {
  batcher: InstructionBatcher;
  getGeometry: () => GridGeometryService;
  rowData: RowDataManager<TData>;
  view: ViewSync<TData>;
  /** Commits geometry inside the open batch and writes a corrected scroll top to whichever sample is in charge. */
  viewport: Pick<ViewportController<TData>, "refreshGeometry" | "writeScrollTop">;
}

/** C5 frame at the live sample: hits, clips and the anchor all read it. */
const regionInput = <TData>(deps: SizeChangeDeps<TData>): RowRegionMappingInput =>
  deps.getGeometry().getRowGeometry().getRegionInput();

export const captureSizeAnchor = <TData>(deps: SizeChangeDeps<TData>): RowAnchor | null =>
  captureRowAnchor(regionInput(deps));

/**
 * Runs inside the caller's open batch. `"reconcile"` re-reads every mounted
 * slot, for a change of the rows themselves rather than of their sizes.
 */
export const resyncAfterSizeChange = <TData>(
  deps: SizeChangeDeps<TData>,
  anchor: RowAnchor | null,
  sync: "rows" | "reconcile" = "rows",
): void => {
  deps.viewport.refreshGeometry();
  const corrected = anchor === null ? null : resolveAnchoredScrollTop(anchor, regionInput(deps));
  if (corrected !== null) {
    deps.viewport.writeScrollTop(corrected);
    deps.batcher.emit({ type: "SCROLL_TO", scrollTop: corrected });
  }
  deps.rowData.requestVisibleRows();
  if (sync === "reconcile") deps.view.reconcile();
  else deps.view.syncVisibleRows(true);
};
