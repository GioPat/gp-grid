<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  GridCore,
  ColumnDefinition,
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
import type { Row, VueCellRenderer, VueEditRenderer } from "../types";

const props = defineProps<{
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
  hoverPosition: CellPosition | null;
  error: string | null;
  isLoading: boolean;
  totalRows: number;
  slotsArray: SlotData[];
  visibleColumnsWithIndices: VisibleColumnInfo[];
  columnLayout: ColumnLayout;
  columnPositions: number[];
  columnWidths: number[];
  fillHandlePosition: FillHandlePosition | null;
  dragState: DragState;
  onScroll: () => void;
  onWheel: (e: WheelEvent, dampening: number) => void;
  wheelDampening: number;
  onCellMouseDown: (rowIndex: number, colIndex: number, e: PointerEvent) => void;
  onCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  onCellMouseEnter: (rowIndex: number, colIndex: number) => void;
  onCellMouseLeave: () => void;
  onFillHandleMouseDown: (e: PointerEvent) => void;
  coreRef: GridCore<Row> | null;
  cellRenderers: Record<string, VueCellRenderer>;
  editRenderers: Record<string, VueEditRenderer>;
  globalCellRenderer?: VueCellRenderer;
  globalEditRenderer?: VueEditRenderer;
}>();

const bodyRef = ref<HTMLDivElement | null>(null);
const renderedWidth = computed(() =>
  Math.max(props.contentWidth, props.totalWidth, props.columnLayout.totalWidth),
);

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

const getCellStyle = (item: ColumnLayoutItem): Record<string, string | number> => {
  if (item.region === "left") {
    return {
      position: "absolute",
      left: `calc(var(--gp-grid-scroll-left, 0px) + ${item.left}px)`,
      top: 0,
      width: `${item.width}px`,
      height: `${props.rowHeight}px`,
      zIndex: 6,
    };
  }
  if (item.region === "right") {
    return {
      position: "absolute",
      left: `calc(var(--gp-grid-scroll-left, 0px) + var(--gp-grid-viewport-width, 0px) - ${props.columnLayout.rightPinnedWidth - item.left}px)`,
      top: 0,
      width: `${item.width}px`,
      height: `${props.rowHeight}px`,
      zIndex: 6,
    };
  }
  return {
    position: "absolute",
    left: `${props.columnLayout.leftPinnedWidth + item.left}px`,
    top: 0,
    width: `${item.width}px`,
    height: `${props.rowHeight}px`,
  };
};

const groupLabel = (slot: SlotData): string => {
  const expanded = slot.groupExpanded === true ? "[-]" : "[+]";
  return `${expanded} ${slot.groupField ?? "Group"}: ${String(slot.groupValue ?? "")} (${slot.groupChildCount ?? 0})`;
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
        width: `${renderedWidth}px`,
        height: `${Math.max(props.contentHeight - props.totalHeaderHeight, 0)}px`,
        position: 'relative',
        minWidth: '100%',
      }"
    >
      <!-- Rows wrapper -->
      <div
        class="gp-grid-rows-wrapper"
        :style="{
          width: `${renderedWidth}px`,
          transform: `translateY(${props.rowsWrapperOffset}px)`,
        }"
      >
        <!-- Row slots -->
        <div
          v-for="slot in props.slotsArray.filter((s) => s.rowIndex >= 0)"
          :key="slot.slotId"
          :class="slot.rowKind === 'group' ? 'gp-grid-row gp-grid-row--group' : getRowClasses(slot)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translateY(${slot.translateY}px)`,
            width: `${renderedWidth}px`,
            height: `${props.rowHeight}px`,
          }"
        >
          <div
            v-if="slot.rowKind === 'group'"
            class="gp-grid-row-group-cell"
            :style="{
              left: 0,
              width: `${renderedWidth}px`,
              height: `${props.rowHeight}px`,
              paddingLeft: `${12 + (slot.groupDepth ?? 0) * 16}px`,
            }"
            @pointerdown.prevent="() => slot.groupKey && props.coreRef?.toggleRowGroup(slot.groupKey)"
          >
            {{ groupLabel(slot) }}
          </div>
          <div
            v-for="item in slot.rowKind === 'group' ? [] : props.columnLayout.items"
            :key="`${slot.slotId}-${item.key}`"
            :class="[
              getCellClasses(slot.rowIndex, item.originalIndex, item.column, slot.rowData, props.hoverPosition),
              item.region !== 'center' ? 'gp-grid-cell--pinned' : '',
              item.region === 'left' ? 'gp-grid-cell--pinned-left' : '',
              item.region === 'right' ? 'gp-grid-cell--pinned-right' : '',
            ].filter(Boolean).join(' ')"
            :style="getCellStyle(item)"
            @pointerdown="(e) => props.onCellMouseDown(slot.rowIndex, item.originalIndex, e)"
            @dblclick="() => props.onCellDoubleClick(slot.rowIndex, item.originalIndex)"
            @mouseenter="() => props.onCellMouseEnter(slot.rowIndex, item.originalIndex)"
            @mouseleave="props.onCellMouseLeave"
          >
            <!-- Edit mode -->
            <template v-if="isCellEditing(slot.rowIndex, item.originalIndex, props.editingCell) && props.editingCell">
              <component
                :is="renderEditCell({
                  column: item.column,
                  rowData: slot.rowData,
                  rowIndex: slot.rowIndex,
                  colIndex: item.originalIndex,
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
                  column: item.column,
                  rowData: slot.rowData,
                  rowIndex: slot.rowIndex,
                  colIndex: item.originalIndex,
                  isActive: isCellActive(slot.rowIndex, item.originalIndex, props.activeCell),
                  isSelected: isCellSelected(slot.rowIndex, item.originalIndex, props.selectionRange),
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
          @pointerdown="props.onFillHandleMouseDown"
        />

        <!-- Row drop indicator -->
        <div
          v-if="props.dragState.dragType === 'row-drag' && props.dragState.rowDrag?.dropTargetIndex !== null"
          class="gp-grid-row-drop-indicator"
          :style="{
            transform: `translateY(${props.dragState.rowDrag!.dropIndicatorY}px)`,
            width: `${renderedWidth}px`,
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
