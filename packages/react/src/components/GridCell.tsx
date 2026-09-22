// packages/react/src/components/GridCell.tsx

import React from "react";
import type {
  GridCore,
  CellPosition,
  CellRange,
  CellValue,
  DragState,
  ResolvedColumn,
} from "@gp-grid/core";
import {
  isCellSelected,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
  formatCellValue,
} from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import { renderEditCell } from "../renderers/editRenderer";
import type { ReactCellRenderer, ReactEditRenderer } from "../types";

export interface GridCellProps<TData = unknown> {
  rowIndex: number;
  rowData: TData | undefined;
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  rowHeight: number;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue; editId: number } | null;
  dragState: DragState;
  coreRef: React.RefObject<GridCore<TData> | null>;
  cellRenderers: Record<string, ReactCellRenderer>;
  editRenderers: Record<string, ReactEditRenderer>;
  globalCellRenderer?: ReactCellRenderer;
  globalEditRenderer?: ReactEditRenderer;
  onCellMouseDown: (rowIndex: number, colIndex: number, e: React.PointerEvent) => void;
  onCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  onCellMouseEnter: (rowIndex: number, colIndex: number) => void;
  onCellMouseLeave: () => void;
}

/**
 * One body cell. `insetInlineStart` is region-local, so the same markup renders
 * inside a pin container and as an absolute center cell.
 */
export const GridCell = <TData = unknown>(
  props: GridCellProps<TData>,
): React.ReactNode => {
  const {
    rowIndex,
    rowData,
    column,
    displayedIndex,
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
  } = props;

  const { column: definition, layoutIndex, width, regionOffset } = column;
  const core = coreRef.current;

  const isEditing = isCellEditing(rowIndex, layoutIndex, editingCell);
  const liveEdit = isEditing ? core?.getEditState() : null;
  const active = isCellActive(rowIndex, layoutIndex, activeCell);
  const selected = isCellSelected(rowIndex, layoutIndex, selectionRange);
  const inFillPreview = isCellInFillPreview(
    rowIndex,
    layoutIndex,
    dragState.dragType === "fill",
    dragState.fillSourceRange,
    dragState.fillTarget,
  );

  const highlightCellClasses =
    coreRef.current?.highlight?.computeCombinedCellClasses(
      rowIndex,
      layoutIndex,
      definition,
      rowData,
    ) ?? [];

  // Read the raw value through the core read path so a record-less (columnar)
  // row renders like an object row.
  const rawValue = core?.getCellValue(rowIndex, layoutIndex) ?? null;
  const rowId = core?.getRowId(rowIndex);
  const getValue = (field: string): CellValue =>
    core?.getFieldValue(rowIndex, field) ?? null;

  // Wrap only affects the default text content, so it is irrelevant (and would
  // clash with the edit input) in edit mode.
  const wrapText = definition.wrapText === true && !isEditing;

  const cellClasses = [
    buildCellClasses(active, selected, isEditing, inFillPreview),
    ...highlightCellClasses,
    definition.rowDrag === true ? "gp-grid-cell--row-drag-handle" : "",
    wrapText ? "gp-grid-cell--wrap" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Native tooltip: show the formatted value on hover so users can read
  // content that's clipped by the cell width. Opt out per column with
  // `tooltip: false`. Suppressed while editing (the input shows its value).
  const titleText =
    definition.tooltip === false || isEditing
      ? ""
      : formatCellValue(rawValue, definition.valueFormatter);

  return (
    <div
      className={cellClasses}
      role="gridcell"
      aria-colindex={displayedIndex + 1}
      data-cell-row={rowIndex}
      data-cell-col={layoutIndex}
      data-cell-region={column.region}
      title={titleText || undefined}
      style={{
        position: "absolute",
        insetInlineStart: `${regionOffset}px`,
        top: 0,
        width: `${width}px`,
        height: `${rowHeight}px`,
      }}
      onPointerDown={(e) => onCellMouseDown(rowIndex, layoutIndex, e)}
      onDoubleClick={() => onCellDoubleClick(rowIndex, layoutIndex)}
      onMouseEnter={() => onCellMouseEnter(rowIndex, layoutIndex)}
      onMouseLeave={onCellMouseLeave}
    >
      {isEditing && editingCell
        ? renderEditCell({
          column: definition,
          rowData,
          rawValue,
          rowId,
          getValue,
          rowIndex,
          colIndex: layoutIndex,
          initialValue:
            liveEdit?.editId === editingCell.editId
              ? liveEdit.currentValue
              : editingCell.initialValue,
          editId: editingCell.editId,
          coreRef,
          editRenderers,
          globalEditRenderer,
        })
        : renderCell({
          column: definition,
          rowData,
          rawValue,
          rowId,
          getValue,
          rowIndex,
          colIndex: layoutIndex,
          isActive: active,
          isSelected: selected,
          isEditing,
          cellRenderers,
          globalCellRenderer,
        })}
    </div>
  );
};
