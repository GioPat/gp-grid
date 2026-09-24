<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  CellPosition,
  CellRange,
  CellValue,
  ColumnWindowSnapshot,
  DragState,
  FillHandlePosition,
  GridAnnouncement,
  GridCore,
  GridLabels,
  RowRegionLayout,
  SlotData,
} from "@gp-grid/core";
import { formatLabel } from "@gp-grid/core";
import GridRow from "./GridRow.vue";
import GridFrozenRows from "./GridFrozenRows.vue";
import type { GridRowCellContext } from "./cell-props";
import type { Row, VueCellRenderer, VueEditRenderer } from "../types";

const props = defineProps<{
  rowHeight: number;
  totalHeaderHeight: number;
  contentWidth: number;
  contentHeight: number;
  totalWidth: number;
  rowsWrapperOffset: number;
  rowRegions: RowRegionLayout;
  /** C13 live-region content, or `null` when there is nothing to announce. */
  announcement: GridAnnouncement | null;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  hoverPosition: CellPosition | null;
  editingCell: { row: number; col: number; initialValue: CellValue; editId: number } | null;
  error: string | null;
  isLoading: boolean;
  totalRows: number;
  labels: GridLabels;
  slotsArray: SlotData[];
  columnWindow: ColumnWindowSnapshot | null;
  /** 0-based displayed index of a column id, for `aria-colindex`. */
  displayedIndexOf: (columnId: string) => number;
  /** Bumped once per core batch, so cells re-read their core-backed content. */
  renderToken: number;
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

const contentWidthPx = computed(() => Math.max(props.contentWidth, props.totalWidth));

const cellContext = computed<GridRowCellContext>(() => ({
  rowHeight: props.rowHeight,
  activeCell: props.activeCell,
  selectionRange: props.selectionRange,
  hoverPosition: props.hoverPosition,
  renderToken: props.renderToken,
  editingCell: props.editingCell,
  dragState: props.dragState,
  coreRef: props.coreRef,
  cellRenderers: props.cellRenderers,
  editRenderers: props.editRenderers,
  globalCellRenderer: props.globalCellRenderer,
  globalEditRenderer: props.globalEditRenderer,
  onCellMouseDown: props.onCellMouseDown,
  onCellDoubleClick: props.onCellDoubleClick,
  onCellMouseEnter: props.onCellMouseEnter,
  onCellMouseLeave: props.onCellMouseLeave,
}));

/** C7: rows are split by the published slot region, never by an index guess. */
const frozenSlots = computed(() => props.slotsArray.filter((slot) => slot.region === "frozen"));
const suffixSlots = computed(() =>
  props.slotsArray.filter((slot) => slot.region === "suffix" && slot.rowIndex >= 0));

/** Region hosting the fill handle, or `null` when it is not rendered. */
const handleRegion = computed(() =>
  props.fillHandlePosition === null || props.editingCell !== null
    ? null
    : props.fillHandlePosition.region);

/** C10: a frozen anchor hosts the handle in the frozen band, not in the wrapper. */
const frozenHandlePosition = computed<FillHandlePosition | null>(() => {
  const position = props.fillHandlePosition;
  if (position?.rowRegion !== "frozen" || handleRegion.value === null) return null;
  return position;
});

const suffixHandleRegion = computed(() =>
  frozenHandlePosition.value === null ? handleRegion.value : null);

/** Pin regions host the handle in a zero-height sticky overlay so it follows them. */
const pinOverlayWidth = computed(() => {
  const regions = props.columnWindow?.layout.regions;
  if (regions === undefined) return 0;
  return suffixHandleRegion.value === "end" ? regions.endWidth : regions.startWidth;
});

const fillHandleStyle = computed(() => ({
  top: `${props.fillHandlePosition?.top ?? 0}px`,
  insetInlineStart: `${props.fillHandlePosition?.left ?? 0}px`,
}));

const rowDrag = computed(() =>
  props.dragState.dragType === "row-drag" ? props.dragState.rowDrag : null);
const dropIndicatorVisible = computed(() =>
  rowDrag.value !== null && rowDrag.value.dropTargetIndex !== null);
/** The drop indicator follows the row it targets, like the fill handle does. */
const frozenDropIndicator = computed(() =>
  dropIndicatorVisible.value && rowDrag.value?.dropIndicatorRegion === "frozen");
const suffixDropIndicator = computed(() =>
  dropIndicatorVisible.value && frozenDropIndicator.value === false);
const dropIndicatorY = computed(() => rowDrag.value?.dropIndicatorY ?? 0);

defineExpose({ bodyRef });
</script>

<template>
  <div
    ref="bodyRef"
    class="gp-grid-body-scroll"
    role="presentation"
    style="flex: 1; overflow: auto; position: relative"
    @scroll="props.onScroll"
    @wheel="(e) => props.onWheel(e, props.wheelDampening)"
  >
    <!-- Content sizer - provides scroll range -->
    <div
      role="presentation"
      :style="{
        width: `${contentWidthPx}px`,
        height: `${Math.max(props.contentHeight - props.totalHeaderHeight, 0)}px`,
        position: 'relative',
        minWidth: '100%',
      }"
    >
      <GridFrozenRows
        :row-regions="props.rowRegions"
        :slots="frozenSlots"
        :column-window="props.columnWindow"
        :displayed-index-of="props.displayedIndexOf"
        :content-width-px="contentWidthPx"
        :row-height="props.rowHeight"
        :cell-context="cellContext"
        :fill-handle-position="frozenHandlePosition"
        :show-drop-indicator="frozenDropIndicator"
      >
        <template #fill-handle>
          <div
            class="gp-grid-fill-handle"
            :style="fillHandleStyle"
            @pointerdown="props.onFillHandleMouseDown"
          />
        </template>
        <template #drop-indicator>
          <div
            class="gp-grid-row-drop-indicator"
            :style="{
              transform: `translateY(${dropIndicatorY}px)`,
              width: `${contentWidthPx}px`,
            }"
          />
        </template>
      </GridFrozenRows>

      <!-- Rows wrapper -->
      <div
        class="gp-grid-rows-wrapper"
        role="presentation"
        :style="{
          width: `${contentWidthPx}px`,
          transform: `translateY(${props.rowsWrapperOffset}px)`,
        }"
      >
        <template v-if="props.columnWindow">
          <GridRow
            v-for="slot in suffixSlots"
            :key="slot.slotId"
            :slot="slot"
            :column-window="props.columnWindow"
            :displayed-index-of="props.displayedIndexOf"
            :width="contentWidthPx"
            :row-height="props.rowHeight"
            :cell-context="cellContext"
          />
        </template>

        <!-- Fill handle (drag to fill) - inside the wrapper so it moves with rows -->
        <template v-if="suffixHandleRegion !== null">
          <div
            v-if="suffixHandleRegion === 'center'"
            class="gp-grid-fill-handle"
            :style="fillHandleStyle"
            @pointerdown="props.onFillHandleMouseDown"
          />
          <div
            v-else
            class="gp-grid-pin-overlay"
            :class="`gp-grid-pin-overlay--${suffixHandleRegion}`"
            role="presentation"
            :style="{ width: `${pinOverlayWidth}px` }"
          >
            <div
              class="gp-grid-fill-handle"
              :style="fillHandleStyle"
              @pointerdown="props.onFillHandleMouseDown"
            />
          </div>
        </template>

        <!-- Row drop indicator -->
        <div
          v-if="suffixDropIndicator"
          class="gp-grid-row-drop-indicator"
          :style="{
            transform: `translateY(${dropIndicatorY}px)`,
            width: `${contentWidthPx}px`,
          }"
        />
      </div>

    </div>

    <!-- Error message -->
    <div v-if="props.error" class="gp-grid-error">
      {{ formatLabel(props.labels.errorPrefix, { message: props.error }) }}
    </div>

    <!-- Empty state -->
    <div
      v-if="!props.isLoading && !props.error && props.totalRows === 0"
      class="gp-grid-empty"
    >
      {{ props.labels.emptyState }}
    </div>
  </div>

  <!-- C13 live region: the revision key remounts it so each message is read once. -->
  <div
    v-if="props.announcement !== null"
    :key="props.announcement.revision"
    class="gp-grid-visually-hidden"
    role="status"
    aria-live="polite"
  >
    {{ props.announcement.message }}
  </div>
</template>
