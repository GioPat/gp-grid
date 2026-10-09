// packages/react/src/components/GridCell.tsx

import React from "react";
import type {
  GridCore,
  CellPosition,
  CellRange,
  CellValue,
  DragState,
  HierarchyRow,
  ResolvedColumn,
} from "@gp-grid/core";
import {
  isCellSelected,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
  formatCellValue,
  formatGroupLabel,
  isEmptyGroupCell,
} from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import { renderEditCell } from "../renderers/editRenderer";
import type { ReactCellRenderer, ReactEditRenderer } from "../types";
import { ResizeHandle } from "./ResizeHandle";
import type { ResizeHandleActions } from "./ResizeHandle";
import { GroupLabelCell } from "./GroupLabelCell";
import { groupCellClassName, groupCellOf } from "./row-group-attributes";
import type { RowGroupCellContext } from "./row-group-attributes";

export interface GridCellProps<TData = unknown> {
  rowIndex: number;
  rowData: TData | undefined;
  /** The row under a hierarchy; absent while flat. */
  row?: HierarchyRow;
  /** Height of the cell's row, where a row handle drag starts. */
  rowHeight: number;
  column: ResolvedColumn;
  /** 0-based index in the displayed columns, for `aria-colindex`. */
  displayedIndex: number;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue; editId: number } | null;
  dragState: DragState;
  resizeActions: ResizeHandleActions;
  /** Render the row edge handle while not editing. */
  rowResize: boolean;
  coreRef: React.RefObject<GridCore<TData> | null>;
  cellRenderers: Record<string, ReactCellRenderer>;
  editRenderers: Record<string, ReactEditRenderer>;
  globalCellRenderer?: ReactCellRenderer;
  globalEditRenderer?: ReactEditRenderer;
  rowGroups: RowGroupCellContext | null;
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
    row,
    rowHeight,
    column,
    displayedIndex,
    activeCell,
    selectionRange,
    editingCell,
    dragState,
    resizeActions,
    rowResize,
    coreRef,
    cellRenderers,
    editRenderers,
    globalCellRenderer,
    globalEditRenderer,
    rowGroups,
    onCellMouseDown,
    onCellDoubleClick,
    onCellMouseEnter,
    onCellMouseLeave,
  } = props;

  const { column: definition, layoutIndex, width, regionOffset } = column;
  const core = coreRef.current;
  const groupCell = groupCellOf(row, column.columnId, rowGroups);
  const groupLabel =
    groupCell.labelRow !== null && rowGroups !== null
      ? formatGroupLabel(groupCell.labelRow, rowGroups.columns, rowGroups.labels)
      : null;

  const isEditing = isCellEditing(rowIndex, layoutIndex, editingCell);
  const liveEdit = isEditing ? core?.edit.getState() : null;
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
  const rawValue = core?.cells.getValue(rowIndex, layoutIndex) ?? null;
  const rowId = core?.rows.getId(rowIndex);
  const getValue = (field: string): CellValue =>
    core?.cells.getFieldValue(rowIndex, field) ?? null;

  // Wrap only affects the default text content, so it is irrelevant (and would
  // clash with the edit input) in edit mode.
  const wrapText = definition.wrapText === true && !isEditing;

  const cellClasses = [
    buildCellClasses(active, selected, isEditing, inFillPreview),
    ...highlightCellClasses,
    definition.rowDrag === true ? "gp-grid-cell--row-drag-handle" : "",
    wrapText ? "gp-grid-cell--wrap" : "",
    groupCellClassName(groupCell),
  ]
    .filter(Boolean)
    .join(" ");

  // Native tooltip: show the formatted value on hover so users can read
  // content that's clipped by the cell width. Opt out per column with
  // `tooltip: false`. Suppressed while editing (the input shows its value).
  const titleText =
    definition.tooltip === false || isEditing
      ? ""
      : groupLabel ?? formatCellValue(rawValue, definition.valueFormatter);

  const content = (): React.ReactNode => {
    if (groupCell.labelRow !== null && rowGroups !== null) {
      return (
        <GroupLabelCell
          row={groupCell.labelRow}
          rowIndex={rowIndex}
          label={groupLabel ?? ""}
          context={rowGroups}
        />
      );
    }
    if (isEmptyGroupCell(row?.kind, rawValue)) return null;
    if (isEditing && editingCell) {
      return renderEditCell({
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
      });
    }
    return renderCell({
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
      rowKind: row?.kind,
      cellRenderers,
      globalCellRenderer,
    });
  };

  return (
    <div
      className={cellClasses}
      role="gridcell"
      aria-colindex={displayedIndex + 1}
      data-cell-row={rowIndex}
      data-cell-col={layoutIndex}
      data-cell-region={column.region}
      title={titleText || undefined}
      aria-readonly={groupCell.readOnly || undefined}
      style={{
        position: "absolute",
        insetInlineStart: `${regionOffset}px`,
        top: 0,
        width: `${width}px`,
      }}
      onPointerDown={(e) => onCellMouseDown(rowIndex, layoutIndex, e)}
      onDoubleClick={() => onCellDoubleClick(rowIndex, layoutIndex)}
      onMouseEnter={() => onCellMouseEnter(rowIndex, layoutIndex)}
      onMouseLeave={onCellMouseLeave}
    >
      {content()}
      {rowResize && isEditing === false && (
        <ResizeHandle
          axis="row"
          index={rowIndex}
          size={rowHeight}
          active={dragState.rowResize?.rowIndex === rowIndex}
          actions={resizeActions}
        />
      )}
    </div>
  );
};
