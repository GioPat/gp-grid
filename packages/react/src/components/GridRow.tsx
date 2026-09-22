// packages/react/src/components/GridRow.tsx

import React from "react";
import type {
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

export interface GridRowProps<TData = unknown> {
  slot: SlotData<TData>;
  columnWindow: ColumnWindowSnapshot;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  width: number;
  rowHeight: number;
  cellContext: GridRowCellContext<TData>;
}

/**
 * One mounted row: absolute at its `translateY` inside the rows wrapper, a flex
 * line whose sticky pin containers hold the admitted start/end cells while the
 * center cells stay absolute and scroll beneath them.
 */
export const GridRow = <TData = unknown>(
  props: GridRowProps<TData>,
): React.ReactNode => {
  const { slot, columnWindow, displayedIndexOf, width, rowHeight, cellContext } = props;
  const { start, center, end } = columnWindow;
  const { regions } = columnWindow.layout;

  const highlightRowClasses =
    cellContext.coreRef.current?.highlight?.computeRowClasses(slot.rowIndex, slot.rowData) ?? [];
  const rowClassName = ["gp-grid-row", ...highlightRowClasses].filter(Boolean).join(" ");

  const renderColumn = (column: ResolvedColumn): React.ReactNode => (
    <GridCell
      key={column.columnId}
      {...cellContext}
      rowIndex={slot.rowIndex}
      rowData={slot.rowData}
      column={column}
      displayedIndex={displayedIndexOf(column.columnId)}
    />
  );

  return (
    <div
      className={rowClassName}
      role="row"
      aria-rowindex={slot.rowIndex + 1}
      style={{
        position: "absolute",
        top: 0,
        insetInlineStart: 0,
        transform: `translateY(${slot.translateY}px)`,
        width: `${width}px`,
        height: `${rowHeight}px`,
        display: "flex",
      }}
    >
      {center.map(renderColumn)}

      {start.length > 0 && (
        <div
          className="gp-grid-pin gp-grid-pin--start"
          role="presentation"
          data-pin-region="start"
          style={{ width: `${regions.startWidth}px` }}
        >
          {start.map(renderColumn)}
        </div>
      )}

      {end.length > 0 && (
        <div
          className="gp-grid-pin gp-grid-pin--end"
          role="presentation"
          data-pin-region="end"
          style={{ width: `${regions.endWidth}px` }}
        >
          {end.map(renderColumn)}
        </div>
      )}
    </div>
  );
};
