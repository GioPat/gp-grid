// packages/react/src/components/GridBody.tsx

import React from "react";
import type {
  GridCore,
  CellPosition,
  CellRange,
  CellValue,
  ColumnWindowSnapshot,
  DragState,
  FillHandlePosition,
  GridLabels,
  SlotData,
} from "@gp-grid/core";
import { formatLabel } from "@gp-grid/core";
import { GridRow } from "./GridRow";
import type { GridRowCellContext } from "./GridRow";
import type { ReactCellRenderer, ReactEditRenderer } from "../types";

export interface GridBodyProps<TData = unknown> {
  rowHeight: number;
  totalHeaderHeight: number;
  contentWidth: number;
  contentHeight: number;
  totalWidth: number;
  rowsWrapperOffset: number;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue; editId: number } | null;
  error: string | null;
  isLoading: boolean;
  totalRows: number;
  labels: GridLabels;
  slotsArray: SlotData<TData>[];
  columnWindow: ColumnWindowSnapshot | null;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  fillHandlePosition: FillHandlePosition | null;
  dragState: DragState;
  onScroll: () => void;
  onCellMouseDown: (rowIndex: number, colIndex: number, e: React.PointerEvent) => void;
  onCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  onCellMouseEnter: (rowIndex: number, colIndex: number) => void;
  onCellMouseLeave: () => void;
  onFillHandleMouseDown: (e: React.PointerEvent) => void;
  coreRef: React.RefObject<GridCore<TData> | null>;
  cellRenderers: Record<string, ReactCellRenderer>;
  editRenderers: Record<string, ReactEditRenderer>;
  globalCellRenderer?: ReactCellRenderer;
  globalEditRenderer?: ReactEditRenderer;
}

const GridBodyInner = <TData = unknown>(
  props: GridBodyProps<TData>,
  ref: React.ForwardedRef<HTMLDivElement>,
): React.ReactNode => {
  const {
    rowHeight,
    totalHeaderHeight,
    contentWidth,
    contentHeight,
    totalWidth,
    rowsWrapperOffset,
    activeCell,
    selectionRange,
    editingCell,
    error,
    isLoading,
    totalRows,
    labels,
    slotsArray,
    columnWindow,
    displayedIndexOf,
    fillHandlePosition,
    dragState,
    onScroll,
    onCellMouseDown,
    onCellDoubleClick,
    onCellMouseEnter,
    onCellMouseLeave,
    onFillHandleMouseDown,
    coreRef,
    cellRenderers,
    editRenderers,
    globalCellRenderer,
    globalEditRenderer,
  } = props;

  const contentWidthPx = Math.max(contentWidth, totalWidth);
  const regions = columnWindow?.layout.regions;

  const cellContext: GridRowCellContext<TData> = {
    rowHeight,
    activeCell,
    selectionRange,
    editingCell,
    dragState,
    coreRef,
    cellRenderers,
    editRenderers,
    globalCellRenderer,
    globalEditRenderer,
    onCellMouseDown,
    onCellDoubleClick,
    onCellMouseEnter,
    onCellMouseLeave,
  };

  const fillHandle = fillHandlePosition && !editingCell ? (
    <div
      className="gp-grid-fill-handle"
      style={{
        top: fillHandlePosition.top,
        insetInlineStart: fillHandlePosition.left,
      }}
      onPointerDown={onFillHandleMouseDown}
    />
  ) : null;

  /** Pin regions host the handle in a zero-height sticky overlay so it follows them. */
  const pinOverlay = (region: "start" | "end"): React.ReactNode =>
    fillHandle !== null && fillHandlePosition?.region === region && regions !== undefined ? (
      <div
        className={`gp-grid-pin-overlay gp-grid-pin-overlay--${region}`}
        role="presentation"
        style={{ width: `${region === "start" ? regions.startWidth : regions.endWidth}px` }}
      >
        {fillHandle}
      </div>
    ) : null;

  return (
    <div
      ref={ref}
      className="gp-grid-body-scroll"
      role="presentation"
      style={{
        flex: 1,
        overflow: "auto",
        position: "relative",
      }}
      onScroll={onScroll}
    >
      {/* Content sizer - provides scroll range */}
      <div
        role="presentation"
        style={{
          width: contentWidthPx,
          height: Math.max(contentHeight - totalHeaderHeight, 0),
          position: "relative",
          minWidth: "100%",
        }}
      >
        {/* Rows wrapper - uses transform to position rows with small translateY values */}
        {/* This prevents browser rendering issues at extreme pixel positions (millions of px) */}
        <div
          className="gp-grid-rows-wrapper"
          role="presentation"
          style={{
            width: `${contentWidthPx}px`,
            transform: `translateY(${rowsWrapperOffset}px)`,
          }}
        >
          {columnWindow !== null &&
            slotsArray.map((slot) =>
              slot.rowIndex < 0 ? null : (
                <GridRow
                  key={slot.slotId}
                  slot={slot}
                  columnWindow={columnWindow}
                  displayedIndexOf={displayedIndexOf}
                  width={contentWidthPx}
                  rowHeight={rowHeight}
                  cellContext={cellContext}
                />
              ),
            )}

          {/* Fill handle (drag to fill) - inside the wrapper so it moves with rows */}
          {fillHandlePosition?.region === "center" && fillHandle}

          {pinOverlay("start")}
          {pinOverlay("end")}

          {/* Row drop indicator - inside wrapper so it scrolls with rows */}
          {dragState.dragType === "row-drag" && dragState.rowDrag?.dropTargetIndex !== null && (
            <div
              className="gp-grid-row-drop-indicator"
              style={{
                transform: `translateY(${dragState.rowDrag!.dropIndicatorY}px)`,
                width: `${contentWidthPx}px`,
              }}
            />
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="gp-grid-error">{formatLabel(labels.errorPrefix, { message: error })}</div>
      )}

      {/* Empty state */}
      {!isLoading && !error && totalRows === 0 && (
        <div className="gp-grid-empty">{labels.emptyState}</div>
      )}
    </div>
  );
};

export const GridBody = React.forwardRef(GridBodyInner) as <TData = unknown>(
  props: GridBodyProps<TData> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactNode;
