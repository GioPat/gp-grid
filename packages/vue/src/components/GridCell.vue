<script setup lang="ts">
import type { CellValue, ColumnDefinition } from "@gp-grid/core";
import {
  buildCellClasses,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  isCellSelected,
} from "@gp-grid/core";
import { renderCell } from "../renderers/cellRenderer";
import { renderEditCell } from "../renderers/editRenderer";
import type { GridCellProps } from "./cell-props";

const props = defineProps<GridCellProps>();

// Region-local inset: the same markup renders inside a pin container and as an
// absolute center cell.
const getCellClasses = (): string => {
  const { rowIndex, column, rowData } = props;
  // Registers the hover signal as a dependency: highlight classes read live
  // core state, which is not reactive on its own.
  void props.hoverPosition;
  const definition: ColumnDefinition = column.column;
  const isEditing = isCellEditing(rowIndex, column.layoutIndex, props.editingCell);
  const active = isCellActive(rowIndex, column.layoutIndex, props.activeCell);
  const selected = isCellSelected(rowIndex, column.layoutIndex, props.selectionRange);
  const inFillPreview = isCellInFillPreview(
    rowIndex,
    column.layoutIndex,
    props.dragState.dragType === "fill",
    props.dragState.fillSourceRange,
    props.dragState.fillTarget,
  );

  const highlightCellClasses =
    props.coreRef?.highlight?.computeCombinedCellClasses(
      rowIndex,
      column.layoutIndex,
      definition,
      rowData,
    ) ?? [];

  // Wrap only affects the default text content, so it is irrelevant (and would
  // clash with the edit input) in edit mode.
  const wrapText = definition.wrapText === true && !isEditing;

  return [
    buildCellClasses(active, selected, isEditing, inFillPreview),
    ...highlightCellClasses,
    definition.rowDrag === true ? "gp-grid-cell--row-drag-handle" : "",
    wrapText ? "gp-grid-cell--wrap" : "",
  ].filter(Boolean).join(" ");
};

const isEditing = (): boolean =>
  isCellEditing(props.rowIndex, props.column.layoutIndex, props.editingCell);

// Read raw values through the core so a record-less (columnar) row renders
// exactly like an object row.
const getRawValue = (): CellValue =>
  props.coreRef?.cells.getValue(props.rowIndex, props.column.layoutIndex) ?? null;

const getRowIdAt = () => props.coreRef?.rows.getId(props.rowIndex);

const getFieldValueAt = (field: string): CellValue =>
  props.coreRef?.cells.getFieldValue(props.rowIndex, field) ?? null;

/** The open editor is the source of truth for its draft value. */
const initialEditValue = (): CellValue => {
  const editing = props.editingCell;
  if (editing === null) return null;
  const live = props.coreRef?.edit.getState() ?? null;
  if (live !== null && live.editId === editing.editId) return live.currentValue;
  return editing.initialValue;
};

const cellContent = () => {
  const { column, rowData } = props;
  void props.renderToken;
  const definition = column.column;
  const editing = props.editingCell;
  if (isEditing() && editing) {
    return renderEditCell({
      column: definition,
      rowData,
      rawValue: getRawValue(),
      rowId: getRowIdAt(),
      getValue: getFieldValueAt,
      rowIndex: props.rowIndex,
      colIndex: column.layoutIndex,
      initialValue: initialEditValue(),
      editId: editing.editId,
      core: props.coreRef,
      editRenderers: props.editRenderers,
      globalEditRenderer: props.globalEditRenderer,
    });
  }
  return renderCell({
    column: definition,
    rowData,
    rawValue: getRawValue(),
    rowId: getRowIdAt(),
    getValue: getFieldValueAt,
    rowIndex: props.rowIndex,
    colIndex: column.layoutIndex,
    isActive: isCellActive(props.rowIndex, column.layoutIndex, props.activeCell),
    isSelected: isCellSelected(props.rowIndex, column.layoutIndex, props.selectionRange),
    isEditing: false,
    cellRenderers: props.cellRenderers,
    globalCellRenderer: props.globalCellRenderer,
  });
};
</script>

<template>
  <div
    :class="getCellClasses()"
    role="gridcell"
    :aria-colindex="props.displayedIndex + 1"
    :data-cell-row="props.rowIndex"
    :data-cell-col="props.column.layoutIndex"
    :data-cell-region="props.column.region"
    :style="{
      position: 'absolute',
      insetInlineStart: `${props.column.regionOffset}px`,
      top: 0,
      width: `${props.column.width}px`,
      height: `${props.rowHeight}px`,
    }"
    @pointerdown="(e) => props.onCellMouseDown(props.rowIndex, props.column.layoutIndex, e)"
    @dblclick="() => props.onCellDoubleClick(props.rowIndex, props.column.layoutIndex)"
    @mouseenter="() => props.onCellMouseEnter(props.rowIndex, props.column.layoutIndex)"
    @mouseleave="props.onCellMouseLeave"
  >
    <component :is="cellContent()" />
  </div>
</template>
