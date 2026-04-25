// packages/react/src/components/GridBody.tsx

import React from "react";
import type {
  GridCore,
  CellPosition,
  CellRange,
  CellValue,
  DragState,
  SlotData,
  FillHandlePosition,
  VisibleColumnInfo,
  ColumnLayout,
  ColumnLayoutItem,
} from "@gp-grid/core";
import {
  isCellSelected,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
} from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import { renderEditCell } from "../renderers/editRenderer";
import type { ReactCellRenderer, ReactEditRenderer } from "../types";

export interface GridBodyProps<TData = unknown> {
  rowHeight: number;
  totalHeaderHeight: number;
  contentWidth: number;
  contentHeight: number;
  totalWidth: number;
  scrollLeft: number;
  viewportWidth: number;
  rowsWrapperOffset: number;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  error: string | null;
  isLoading: boolean;
  totalRows: number;
  slotsArray: SlotData<TData>[];
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnLayout: ColumnLayout;
  columnPositions: number[];
  columnWidths: number[];
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
    slotsArray,
    columnLayout,
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
  const renderedWidth = Math.max(contentWidth, totalWidth, columnLayout.totalWidth);

  const renderGroupRow = (
    slot: SlotData<TData>,
    width: number,
  ): React.ReactNode => {
    const depth = slot.groupDepth ?? 0;
    const expanded = slot.groupExpanded === true;
    const label = `${expanded ? "[-]" : "[+]"} ${slot.groupField ?? "Group"}: ${String(slot.groupValue ?? "")} (${slot.groupChildCount ?? 0})`;
    return (
      <div
        key={slot.slotId}
        className="gp-grid-row gp-grid-row--group"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translateY(${slot.translateY}px)`,
          width: `${width}px`,
          height: `${rowHeight}px`,
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          if (slot.groupKey) coreRef.current?.toggleRowGroup(slot.groupKey);
        }}
      >
        <div
          className="gp-grid-row-group-cell"
          style={{
            left: 0,
            width: `${width}px`,
            height: `${rowHeight}px`,
            paddingLeft: `${12 + depth * 16}px`,
          }}
        >
          {label}
        </div>
      </div>
    );
  };

  const getCellPositionStyle = (
    item: ColumnLayoutItem,
    layout: ColumnLayout,
  ): React.CSSProperties => {
    if (item.region === "left") {
      return {
        position: "absolute",
        left: `calc(var(--gp-grid-scroll-left, 0px) + ${item.left}px)`,
        zIndex: 6,
      };
    }
    if (item.region === "right") {
      return {
        position: "absolute",
        left: `calc(var(--gp-grid-scroll-left, 0px) + var(--gp-grid-viewport-width, 0px) - ${layout.rightPinnedWidth - item.left}px)`,
        zIndex: 6,
      };
    }
    return {
      position: "absolute",
      left: `${layout.leftPinnedWidth + item.left}px`,
    };
  };

  return (
    <div
      ref={ref}
      style={{
        flex: 1,
        overflow: "auto",
        position: "relative",
      }}
      onScroll={onScroll}
    >
      {/* Content sizer - provides scroll range */}
      <div
        style={{
          width: renderedWidth,
          height: Math.max(contentHeight - totalHeaderHeight, 0),
          position: "relative",
          minWidth: "100%",
        }}
      >
        {/* Rows wrapper - uses transform to position rows with small translateY values */}
        {/* This prevents browser rendering issues at extreme pixel positions (millions of px) */}
        <div
          className="gp-grid-rows-wrapper"
          style={{
            width: `${renderedWidth}px`,
            transform: `translateY(${rowsWrapperOffset}px)`,
          }}
        >
          {/* Row slots */}
          {slotsArray.map((slot) => {
            if (slot.rowIndex < 0) return null;

            // Compute row highlight classes (pass rowData for content-based rules)
            if (slot.rowKind === "group") {
              return renderGroupRow(slot, renderedWidth);
            }

            const highlightRowClasses =
              coreRef.current?.highlight?.computeRowClasses(slot.rowIndex, slot.rowData) ?? [];
            const rowClassName = ["gp-grid-row", ...highlightRowClasses]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={slot.slotId}
                className={rowClassName}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `translateY(${slot.translateY}px)`,
                  width: `${renderedWidth}px`,
                  height: `${rowHeight}px`,
                }}
              >
                {columnLayout.items.map((item) => {
                  const { column, originalIndex } = item;
                  const isEditing = isCellEditing(
                    slot.rowIndex,
                    originalIndex,
                    editingCell,
                  );
                  const active = isCellActive(
                    slot.rowIndex,
                    originalIndex,
                    activeCell,
                  );
                  const selected = isCellSelected(
                    slot.rowIndex,
                    originalIndex,
                    selectionRange,
                  );
                  const inFillPreview = isCellInFillPreview(
                    slot.rowIndex,
                    originalIndex,
                    dragState.dragType === "fill",
                    dragState.fillSourceRange,
                    dragState.fillTarget,
                  );

                  // Build base cell classes
                  const baseCellClasses = buildCellClasses(
                    active,
                    selected,
                    isEditing,
                    inFillPreview,
                  );

                  // Compute highlight cell classes
                  const highlightCellClasses =
                    coreRef.current?.highlight?.computeCombinedCellClasses(
                      slot.rowIndex,
                      originalIndex,
                      column,
                      slot.rowData,
                    ) ?? [];

                  const isRowDragHandle = column.rowDrag === true;

                  const cellClasses = [
                    baseCellClasses,
                    ...highlightCellClasses,
                    item.region !== "center" ? "gp-grid-cell--pinned" : "",
                    item.region === "left" ? "gp-grid-cell--pinned-left" : "",
                    item.region === "right" ? "gp-grid-cell--pinned-right" : "",
                    isRowDragHandle ? "gp-grid-cell--row-drag-handle" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={`${slot.slotId}-${originalIndex}`}
                      className={cellClasses}
                      style={{
                        ...getCellPositionStyle(item, columnLayout),
                        top: 0,
                        width: `${item.width}px`,
                        height: `${rowHeight}px`,
                      }}
                      onPointerDown={(e) =>
                        onCellMouseDown(slot.rowIndex, originalIndex, e)
                      }
                      onDoubleClick={() =>
                        onCellDoubleClick(slot.rowIndex, originalIndex)
                      }
                      onMouseEnter={() =>
                        onCellMouseEnter(slot.rowIndex, originalIndex)
                      }
                      onMouseLeave={onCellMouseLeave}
                    >
                      {isEditing && editingCell
                        ? renderEditCell({
                          column,
                          rowData: slot.rowData,
                          rowIndex: slot.rowIndex,
                          colIndex: originalIndex,
                          initialValue: editingCell.initialValue,
                          coreRef,
                          editRenderers,
                          globalEditRenderer,
                        })
                        : renderCell({
                          column,
                          rowData: slot.rowData,
                          rowIndex: slot.rowIndex,
                          colIndex: originalIndex,
                          isActive: active,
                          isSelected: selected,
                          isEditing,
                          cellRenderers,
                          globalCellRenderer,
                        })}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Fill handle (drag to fill) - inside wrapper so it moves with rows */}
          {fillHandlePosition && !editingCell && (
            <div
              className="gp-grid-fill-handle"
              style={{
                top: fillHandlePosition.top,
                left: fillHandlePosition.left,
              }}
              onPointerDown={onFillHandleMouseDown}
            />
          )}

          {/* Row drop indicator - inside wrapper so it scrolls with rows */}
          {dragState.dragType === "row-drag" && dragState.rowDrag?.dropTargetIndex !== null && (
            <div
              className="gp-grid-row-drop-indicator"
              style={{
                transform: `translateY(${dragState.rowDrag!.dropIndicatorY}px)`,
                width: `${Math.max(contentWidth, totalWidth)}px`,
              }}
            />
          )}
        </div>

      </div>

      {/* Error message */}
      {error && (
        <div className="gp-grid-error">Error: {error}</div>
      )}

      {/* Empty state */}
      {!isLoading && !error && totalRows === 0 && (
        <div className="gp-grid-empty">No data to display</div>
      )}
    </div>
  );
};

export const GridBody = React.forwardRef(GridBodyInner) as <TData = unknown>(
  props: GridBodyProps<TData> & { ref?: React.Ref<HTMLDivElement> },
) => React.ReactNode;
