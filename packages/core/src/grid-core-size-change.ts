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

export interface SizeChangeDeps<TData> {
  batcher: InstructionBatcher;
  getGeometry: () => GridGeometryService;
  getRowData: () => RowDataManager<TData>;
  getView: () => ViewSync<TData>;
  /** Commits geometry and emits any clamp correction inside the open batch. */
  refreshGeometry: () => void;
  /** Writes a corrected DOM scroll top to whichever sample is in charge. */
  writeScrollTop: (domScrollTop: number) => void;
}

/** C5 frame at the live sample: hits, clips and the anchor all read it. */
const regionInput = <TData>(deps: SizeChangeDeps<TData>): RowRegionMappingInput =>
  deps.getGeometry().getRowGeometry().getRegionInput();

export const captureSizeAnchor = <TData>(deps: SizeChangeDeps<TData>): RowAnchor | null =>
  captureRowAnchor(regionInput(deps));

/** Runs inside the caller's open batch. */
export const resyncAfterSizeChange = <TData>(
  deps: SizeChangeDeps<TData>,
  anchor: RowAnchor | null,
): void => {
  deps.refreshGeometry();
  const corrected = anchor === null ? null : resolveAnchoredScrollTop(anchor, regionInput(deps));
  if (corrected !== null) {
    deps.writeScrollTop(corrected);
    deps.batcher.emit({ type: "SCROLL_TO", scrollTop: corrected });
  }
  deps.getRowData().requestVisibleRows();
  deps.getView().syncVisibleRows(true);
};
