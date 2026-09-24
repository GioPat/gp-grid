// packages/react/src/components/GridFrozenRows.tsx

import React from "react";
import type {
  ColumnRegion,
  ColumnWindowSnapshot,
  FillHandlePosition,
  RowRegionLayout,
  SlotData,
} from "@gp-grid/core";
import { GridRow, GridRowPins, rowBoxStyle } from "./GridRow";
import type { GridRowCellContext } from "./GridRow";

const CENTER_REGION: readonly ColumnRegion[] = ["center"];

export interface GridFrozenRowsProps<TData = unknown> {
  rowRegions: RowRegionLayout;
  /** Frozen slots only; the suffix rows stay in the scrolling wrapper. */
  slots: SlotData<TData>[];
  columnWindow: ColumnWindowSnapshot | null;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  contentWidthPx: number;
  rowHeight: number;
  cellContext: GridRowCellContext<TData>;
  fillHandlePosition: FillHandlePosition | null;
  /** Handle overlay node, placed by row region and column region. */
  fillHandle: React.ReactNode;
  /** Row drop indicator node, placed by row region. */
  dropIndicator: React.ReactNode;
}

/**
 * C10 frozen band: center cells in the sticky block, pinned cells in a sibling
 * sticky layer. The block scrolls horizontally, so a pin inside it would ride
 * its content box out of the viewport (Slice 1 findings).
 */
export const GridFrozenRows = <TData = unknown>(
  props: GridFrozenRowsProps<TData>,
): React.ReactNode => {
  const {
    rowRegions,
    slots,
    columnWindow,
    displayedIndexOf,
    contentWidthPx,
    rowHeight,
    cellContext,
    fillHandlePosition,
    fillHandle,
    dropIndicator,
  } = props;

  if (rowRegions.frozenCount === 0) return null;

  const blockWidth = `${contentWidthPx}px`;
  const frozenHandle = fillHandlePosition?.rowRegion === "frozen" ? fillHandle : null;
  const centerHandle = fillHandlePosition?.region === "center" ? frozenHandle : null;

  const pinOverlay = (region: "start" | "end"): React.ReactNode => {
    const layout = columnWindow?.layout.regions;
    const hostsHandle =
      frozenHandle !== null && fillHandlePosition?.region === region && layout !== undefined;
    if (hostsHandle === false) return null;
    const width = region === "start" ? layout.startWidth : layout.endWidth;
    return (
      <div
        className={`gp-grid-pin-overlay gp-grid-pin-overlay--${region}`}
        role="presentation"
        style={{ width: `${width}px` }}
      >
        {frozenHandle}
      </div>
    );
  };

  const rows =
    columnWindow === null
      ? null
      : slots.map((slot) => (
        <GridRow
          key={slot.slotId}
          slot={slot}
          columnWindow={columnWindow}
          displayedIndexOf={displayedIndexOf}
          width={contentWidthPx}
          rowHeight={rowHeight}
          cellContext={cellContext}
          regions={CENTER_REGION}
        />
      ));

  // A loading placeholder renders no cells, so it has no pin row either.
  const pinRows =
    columnWindow === null
      ? null
      : slots
        .filter((slot) => slot.loading === false)
        .map((slot) => (
          <div
            key={slot.slotId}
            className="gp-grid-frozen-pin-row"
            role="presentation"
            style={rowBoxStyle(slot.translateY, contentWidthPx, rowHeight)}
          >
            <GridRowPins
              slot={slot}
              columnWindow={columnWindow}
              displayedIndexOf={displayedIndexOf}
              cellContext={cellContext}
            />
          </div>
        ));

  return (
    <>
      <div
        className="gp-grid-frozen-rows"
        role="presentation"
        style={{ height: `${rowRegions.frozenExtent}px`, width: blockWidth }}
      >
        <div
          className="gp-grid-rows-wrapper"
          role="presentation"
          style={{ width: blockWidth, transform: "translateY(0)" }}
        >
          {rows}
          {centerHandle}
          {dropIndicator}
        </div>
      </div>

      <div
        className="gp-grid-frozen-pins"
        role="presentation"
        style={{ marginTop: `${-rowRegions.frozenExtent}px` }}
      >
        {pinRows}
        {pinOverlay("start")}
        {pinOverlay("end")}
      </div>
    </>
  );
};
