// packages/react/src/components/GridRow.tsx

import React from "react";
import type {
  ColumnRegion,
  ColumnWindowSnapshot,
  ResolvedColumn,
  SlotData,
} from "@gp-grid/core";
import { GridCell } from "./GridCell";
import type { GridCellProps } from "./GridCell";

/** Everything a cell needs except the position it renders at. */
export type GridRowCellContext<TData = unknown> = Omit<
  GridCellProps<TData>,
  "rowIndex" | "rowData" | "column" | "displayedIndex"
>;

const ALL_REGIONS: readonly ColumnRegion[] = ["start", "center", "end"];
const PIN_REGIONS: readonly ColumnRegion[] = ["start", "end"];

export interface GridRowProps<TData = unknown> {
  slot: SlotData<TData>;
  columnWindow: ColumnWindowSnapshot;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  width: number;
  rowHeight: number;
  cellContext: GridRowCellContext<TData>;
  /** Column regions this row renders: the frozen block renders `center` only. */
  regions?: readonly ColumnRegion[];
}

export interface GridRowPinsProps<TData = unknown> {
  slot: SlotData<TData>;
  columnWindow: ColumnWindowSnapshot;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  cellContext: GridRowCellContext<TData>;
  regions?: readonly ColumnRegion[];
}

/**
 * Absolute box shared by a row and a frozen pin row; `translateY` is local to
 * the container the row is mounted in.
 */
export const rowBoxStyle = (
  translateY: number,
  width: number,
  rowHeight: number,
): React.CSSProperties => ({
  position: "absolute",
  top: 0,
  insetInlineStart: 0,
  transform: `translateY(${translateY}px)`,
  width: `${width}px`,
  height: `${rowHeight}px`,
  display: "flex",
});

const renderColumn = <TData = unknown>(
  slot: SlotData<TData>,
  displayedIndexOf: (columnId: string) => number,
  cellContext: GridRowCellContext<TData>,
  column: ResolvedColumn,
): React.ReactNode => (
  <GridCell
    key={column.columnId}
    {...cellContext}
    rowIndex={slot.rowIndex}
    rowData={slot.rowData}
    column={column}
    displayedIndex={displayedIndexOf(column.columnId)}
  />
);

/**
 * Start/end pin containers for one row, shared by the suffix rows and the
 * frozen pin layer so the pinned-cell markup exists once for both.
 */
export const GridRowPins = <TData = unknown>(
  props: GridRowPinsProps<TData>,
): React.ReactNode => {
  const { slot, columnWindow, displayedIndexOf, cellContext, regions = PIN_REGIONS } = props;
  const { start, end } = columnWindow;
  const layout = columnWindow.layout.regions;

  const pin = (region: "start" | "end"): React.ReactNode => {
    const columns = region === "start" ? start : end;
    if (regions.includes(region) === false || columns.length === 0) return null;
    const width = region === "start" ? layout.startWidth : layout.endWidth;
    return (
      <div
        className={`gp-grid-pin gp-grid-pin--${region}`}
        role="presentation"
        data-pin-region={region}
        style={{ width: `${width}px` }}
      >
        {columns.map((column) => renderColumn(slot, displayedIndexOf, cellContext, column))}
      </div>
    );
  };

  return (
    <>
      {pin("start")}
      {pin("end")}
    </>
  );
};

/**
 * One mounted row: absolute at its `translateY` inside the rows wrapper, a flex
 * line whose sticky pin containers hold the admitted start/end cells while the
 * center cells stay absolute and scroll beneath them.
 */
export const GridRow = <TData = unknown>(
  props: GridRowProps<TData>,
): React.ReactNode => {
  const {
    slot,
    columnWindow,
    displayedIndexOf,
    width,
    rowHeight,
    cellContext,
    regions = ALL_REGIONS,
  } = props;

  // C7: an unavailable frozen row has no data and renders no cells.
  if (slot.loading) {
    return (
      <div
        className="gp-grid-row gp-grid-row--loading"
        role="row"
        aria-rowindex={slot.rowIndex + 1}
        style={rowBoxStyle(slot.translateY, width, rowHeight)}
      />
    );
  }

  const { center } = columnWindow;

  const highlightRowClasses =
    cellContext.coreRef.current?.highlight?.computeRowClasses(slot.rowIndex, slot.rowData) ?? [];
  const rowClassName = ["gp-grid-row", ...highlightRowClasses].filter(Boolean).join(" ");

  return (
    <div
      className={rowClassName}
      role="row"
      aria-rowindex={slot.rowIndex + 1}
      style={rowBoxStyle(slot.translateY, width, rowHeight)}
    >
      {regions.includes("center") &&
        center.map((column) => renderColumn(slot, displayedIndexOf, cellContext, column))}

      <GridRowPins
        slot={slot}
        columnWindow={columnWindow}
        displayedIndexOf={displayedIndexOf}
        cellContext={cellContext}
        regions={regions}
      />
    </div>
  );
};
