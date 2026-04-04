<script setup lang="ts">
import { ref } from "vue";
import type {
  GridCore,
  Row,
  ColumnDefinition,
  CellPosition,
  CellRange,
  CellValue,
  DragState,
  SlotData,
  FillHandlePosition,
  VisibleColumnInfo,
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
import type { VueCellRenderer, VueEditRenderer } from "../types";

const props = defineProps<{
  rowHeight: number;
  totalHeaderHeight: number;
  contentWidth: number;
  contentHeight: number;
  totalWidth: number;
  rowsWrapperOffset: number;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  hoverPosition: CellPosition | null;
  error: string | null;
  isLoading: boolean;
  totalRows: number;
  slotsArray: SlotData[];
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnPositions: number[];
  columnWidths: number[];
  fillHandlePosition: FillHandlePosition | null;
  dragState: DragState;
  onScroll: () => void;
  onWheel: (e: WheelEvent, dampening: number) => void;
  wheelDampening: number;
  onCellMouseDown: (rowIndex: number, colIndex: number, e: MouseEvent) => void;
  onCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  onCellMouseEnter: (rowIndex: number, colIndex: number) => void;
  onCellMouseLeave: () => void;
  onFillHandleMouseDown: (e: MouseEvent) => void;
  coreRef: GridCore<Row> | null;
  cellRenderers: Record<string, VueCellRenderer>;
  editRenderers: Record<string, VueEditRenderer>;
  globalCellRenderer?: VueCellRenderer;
  globalEditRenderer?: VueEditRenderer;
}>();

const bodyRef = ref<HTMLDivElement | null>(null);

// Get row classes including highlight classes
const getRowClasses = (slot: { rowIndex: number; rowData: Row }): string => {
  const highlightRowClasses =
    props.coreRef?.highlight?.computeRowClasses(slot.rowIndex, slot.rowData) ?? [];
  return ["gp-grid-row", ...highlightRowClasses].filter(Boolean).join(" ");
};

// Get cell classes
const getCellClasses = (
  rowIndex: number,
  colIndex: number,
  column: ColumnDefinition,
  rowData: Row,
  _hoverPosition: CellPosition | null,
): string => {
  const isEditing = isCellEditing(rowIndex, colIndex, props.editingCell);
  const active = isCellActive(rowIndex, colIndex, props.activeCell);
  const selected = isCellSelected(rowIndex, colIndex, props.selectionRange);
  const inFillPreview = isCellInFillPreview(
    rowIndex,
    colIndex,
    props.dragState.dragType === "fill",
    props.dragState.fillSourceRange,
    props.dragState.fillTarget,
  );
  const baseCellClasses = buildCellClasses(active, selected, isEditing, inFillPreview);

  const highlightCellClasses =
    props.coreRef?.highlight?.computeCombinedCellClasses(rowIndex, colIndex, column, rowData) ?? [];

  const isRowDragHandle = column.rowDrag === true;

  return [
    baseCellClasses,
    ...highlightCellClasses,
    isRowDragHandle ? "gp-grid-cell--row-drag-handle" : "",
  ].filter(Boolean).join(" ");
};

defineExpose({ bodyRef });
</script>

<template>
  <div
    ref="bodyRef"
    style="flex: 1; overflow: auto; position: relative"
    @scroll="props.onScroll"
    @wheel="(e) => props.onWheel(e, props.wheelDampening)"
  >
    <!-- Content sizer - provides scroll range -->
    <div
      :style="{
        width: `${Math.max(props.contentWidth, props.totalWidth)}px`,
        height: `${Math.max(props.contentHeight - props.totalHeaderHeight, 0)}px`,
        position: 'relative',
        minWidth: '100%',
      }"
    >
      <!-- Rows wrapper -->
      <div
        class="gp-grid-rows-wrapper"
        :style="{
          width: `${Math.max(props.contentWidth, props.totalWidth)}px`,
          transform: `translateY(${props.rowsWrapperOffset}px)`,
        }"
      >
        <!-- Row slots -->
        <div
          v-for="slot in props.slotsArray.filter((s) => s.rowIndex >= 0)"
          :key="slot.slotId"
          :class="getRowClasses(slot)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translateY(${slot.translateY}px)`,
            width: `${Math.max(props.contentWidth, props.totalWidth)}px`,
            height: `${props.rowHeight}px`,
          }"
        >
          <div
            v-for="({ column, originalIndex }, visibleIndex) in props.visibleColumnsWithIndices"
            :key="`${slot.slotId}-${column.colId ?? column.field}`"
            :class="getCellClasses(slot.rowIndex, originalIndex, column, slot.rowData, props.hoverPosition)"
            :style="{
              position: 'absolute',
              left: `${props.columnPositions[visibleIndex]}px`,
              top: 0,
              width: `${props.columnWidths[visibleIndex]}px`,
              height: `${props.rowHeight}px`,
            }"
            @mousedown="(e) => props.onCellMouseDown(slot.rowIndex, originalIndex, e)"
            @dblclick="() => props.onCellDoubleClick(slot.rowIndex, originalIndex)"
            @mouseenter="() => props.onCellMouseEnter(slot.rowIndex, originalIndex)"
            @mouseleave="props.onCellMouseLeave"
          >
            <!-- Edit mode -->
            <template v-if="isCellEditing(slot.rowIndex, originalIndex, props.editingCell) && props.editingCell">
              <component
                :is="renderEditCell({
                  column,
                  rowData: slot.rowData,
                  rowIndex: slot.rowIndex,
                  colIndex: originalIndex,
                  initialValue: props.editingCell.initialValue,
                  core: props.coreRef,
                  editRenderers: props.editRenderers,
                  globalEditRenderer: props.globalEditRenderer,
                })"
              />
            </template>
            <!-- View mode -->
            <template v-else>
              <component
                :is="renderCell({
                  column,
                  rowData: slot.rowData,
                  rowIndex: slot.rowIndex,
                  colIndex: originalIndex,
                  isActive: isCellActive(slot.rowIndex, originalIndex, props.activeCell),
                  isSelected: isCellSelected(slot.rowIndex, originalIndex, props.selectionRange),
                  isEditing: false,
                  cellRenderers: props.cellRenderers,
                  globalCellRenderer: props.globalCellRenderer,
                })"
              />
            </template>
          </div>
        </div>

        <!-- Fill handle -->
        <div
          v-if="props.fillHandlePosition && !props.editingCell"
          class="gp-grid-fill-handle"
          :style="{
            top: `${props.fillHandlePosition.top}px`,
            left: `${props.fillHandlePosition.left}px`,
          }"
          @mousedown="props.onFillHandleMouseDown"
        />

        <!-- Row drop indicator -->
        <div
          v-if="props.dragState.dragType === 'row-drag' && props.dragState.rowDrag?.dropTargetIndex !== null"
          class="gp-grid-row-drop-indicator"
          :style="{
            transform: `translateY(${props.dragState.rowDrag!.dropIndicatorY}px)`,
            width: `${Math.max(props.contentWidth, props.totalWidth)}px`,
          }"
        />
      </div>

    </div>

    <!-- Error message -->
    <div v-if="props.error" class="gp-grid-error">
      Error: {{ props.error }}
    </div>

    <!-- Empty state -->
    <div
      v-if="!props.isLoading && !props.error && props.totalRows === 0"
      class="gp-grid-empty"
    >
      No data to display
    </div>
  </div>
</template>
