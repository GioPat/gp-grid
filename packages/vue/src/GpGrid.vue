<script setup lang="ts">
import {
  ref,
  shallowRef,
  computed,
  onMounted,
  onUnmounted,
  watch,
} from "vue";
import {
  GridCore,
  createClientDataSource,
  createDataSourceFromArray,
  calculateScaledColumnPositions,
  computeColumnLayout,
  getTotalWidth,
} from "@gp-grid/core";
import type { Component } from "vue";
import type { RowId, ColumnFilterModel, DataSource, CellRange, CellValueChangedEvent, HighlightingOptions, ColumnDefinition as CoreColumnDefinition, RowGroupingOptions } from "@gp-grid/core";
import { useGridState } from "./gridState";
import { useInputHandler } from "./composables/useInputHandler";
import { useFillHandle } from "./composables/useFillHandle";
import type { ColumnDefinition, Row, VueCellRenderer, VueEditRenderer, VueHeaderRenderer } from "./types";
import FilterPopup from "./components/FilterPopup.vue";
import GridHeader from "./components/GridHeader.vue";
import GridBody from "./components/GridBody.vue";

const props = withDefaults(
  defineProps<{
    columns: ColumnDefinition[];
    dataSource?: DataSource<Row>;
    rowData?: Row[];
    rowHeight: number;
    headerHeight?: number;
    overscan?: number;
    sortingEnabled?: boolean;
    darkMode?: boolean;
    wheelDampening?: number;
    cellRenderers?: Record<string, VueCellRenderer>;
    editRenderers?: Record<string, VueEditRenderer>;
    headerRenderers?: Record<string, VueHeaderRenderer>;
    cellRenderer?: VueCellRenderer;
    editRenderer?: VueEditRenderer;
    headerRenderer?: VueHeaderRenderer;
    /** Initial viewport width for SSR (pixels). ResizeObserver takes over on client. */
    initialWidth?: number;
    /** Initial viewport height for SSR (pixels). ResizeObserver takes over on client. */
    initialHeight?: number;
    /** Row/column/cell highlighting configuration */
    highlighting?: HighlightingOptions<Row>;
    /** Function to extract unique ID from row. Required when onCellValueChanged is provided. */
    getRowId?: (row: Row) => RowId;
    /** Called when a cell value is changed via editing or fill drag. Requires getRowId. */
    onCellValueChanged?: (event: CellValueChangedEvent<Row>) => void;
    /** Custom loading component to render instead of default spinner */
    loadingComponent?: Component<{ isLoading: boolean }>;
    /** Whether clicking and dragging any cell in a row drags the entire row. Default: false */
    rowDragEntireRow?: boolean;
    /** Called when a row is dropped after dragging. Consumer handles data reordering. */
    onRowDragEnd?: (sourceIndex: number, targetIndex: number) => void;
    /** Called when a column is resized. */
    onColumnResized?: (colIndex: number, newWidth: number) => void;
    /** Called when a column is moved/reordered. */
    onColumnMoved?: (fromIndex: number, toIndex: number) => void;
    rowGrouping?: RowGroupingOptions;
    onRowGroupExpandedChange?: (groupKey: string, expanded: boolean) => void;
  }>(),
  {
    overscan: 3,
    sortingEnabled: true,
    darkMode: false,
    wheelDampening: 0.1,
    cellRenderers: () => ({}),
    editRenderers: () => ({}),
    headerRenderers: () => ({}),
  },
);

// Refs
const outerContainerRef = ref<HTMLDivElement | null>(null);
const gridBodyComp = ref<InstanceType<typeof GridBody> | null>(null);
const bodyContainerRef = computed(() => gridBodyComp.value?.bodyRef ?? null);
const coreRef = shallowRef<GridCore<Row> | null>(null);
const currentDataSourceRef = shallowRef<DataSource<Row> | null>(null);
const coreUnsubscribeRef = shallowRef<(() => void) | null>(null);

// Header scroll sync
const scrollLeft = ref(0);

// State
const { state, applyInstructions, reset: resetState } = useGridState({
  initialWidth: props.initialWidth,
  initialHeight: props.initialHeight,
});

// Computed values
const totalHeaderHeight = computed(() => props.headerHeight ?? props.rowHeight);

// Effective columns: use core-updated columns (after resize/move) or fall back to props.
// Cast user props to core's ColumnDefinition for internal plumbing — the Vue-widened
// renderer fields are structurally a superset but core only reads non-renderer props here.
const effectiveColumns = computed<CoreColumnDefinition[]>(
  () => state.value.columns ?? (props.columns as unknown as CoreColumnDefinition[]),
);

// Create visible columns with original index tracking (for hidden column support)
const visibleColumnsWithIndices = computed(() =>
  effectiveColumns.value
    .map((col, index) => ({ column: col, originalIndex: index }))
    .filter(({ column }) => !column.hidden),
);

const scaledColumns = computed(() =>
  calculateScaledColumnPositions(
    visibleColumnsWithIndices.value.map((v) => v.column),
    state.value.viewportWidth,
  ),
);
const columnPositions = computed(() => scaledColumns.value.positions);
const columnWidths = computed(() => scaledColumns.value.widths);
const totalWidth = computed(() => getTotalWidth(columnPositions.value));
const columnLayout = computed(() =>
  computeColumnLayout(effectiveColumns.value, { containerWidth: state.value.viewportWidth }),
);
const slotsArray = computed(() => Array.from(state.value.slots.values()));

// Input handling
const {
  handleCellMouseDown,
  handleCellDoubleClick,
  handleFillHandleMouseDown,
  handleHeaderClick,
  handleHeaderMouseDown,
  handleHeaderResizeMouseDown,
  handleKeyDown,
  handleWheel,
  dragState,
} = useInputHandler(coreRef, bodyContainerRef, effectiveColumns, {
  activeCell: computed(() => state.value.activeCell),
  selectionRange: computed(() => state.value.selectionRange),
  editingCell: computed(() => state.value.editingCell),
  filterPopupOpen: computed(() => state.value.filterPopup?.isOpen ?? false),
  rowHeight: props.rowHeight,
  headerHeight: totalHeaderHeight.value,
  columnPositions,
  columnLayout,
  visibleColumnsWithIndices,
  slots: computed(() => state.value.slots),
  rowsWrapperOffset: computed(() => state.value.rowsWrapperOffset),
});

// Fill handle position
const { fillHandlePosition } = useFillHandle({
  activeCell: computed(() => state.value.activeCell),
  selectionRange: computed(() => state.value.selectionRange),
  slots: computed(() => state.value.slots),
  columns: effectiveColumns,
  visibleColumnsWithIndices,
  columnPositions,
  columnWidths,
  rowHeight: props.rowHeight,
});

// Handle scroll
function handleScroll(): void {
  const container = bodyContainerRef.value;
  const core = coreRef.value;
  if (!container || !core) return;

  core.setViewport(
    container.scrollTop,
    container.scrollLeft,
    container.clientWidth,
    container.clientHeight,
  );
}

// Handle scroll with header sync
function handleScrollWithHeaderSync(): void {
  const container = bodyContainerRef.value;
  if (container) {
    syncScrollCssVars(container);
  }
  handleScroll();
}

function syncScrollCssVars(container: HTMLDivElement): void {
    outerContainerRef.value?.style.setProperty(
        "--gp-grid-scroll-left",
        `${container.scrollLeft}px`,
    );
}

// Handle filter apply
function handleFilterApply(colId: string, filter: ColumnFilterModel | null): void {
  const core = coreRef.value;
  if (core) {
    core.setFilter(colId, filter);
  }
}

// Handle filter popup close
function handleFilterPopupClose(): void {
  const core = coreRef.value;
  if (core) {
    core.closeFilterPopup();
  }
}

// Handle cell mouse enter (for highlighting)
function handleCellMouseEnter(rowIndex: number, colIndex: number): void {
  coreRef.value?.input.handleCellMouseEnter(rowIndex, colIndex);
}

// Handle cell mouse leave (for highlighting)
function handleCellMouseLeave(): void {
  coreRef.value?.input.handleCellMouseLeave();
}

// Helper to create or get data source
function getOrCreateDataSource(): DataSource<Row> {
  return props.dataSource ??
    (props.rowData ? createDataSourceFromArray(props.rowData) : createClientDataSource<Row>([]));
}

/**
 * Initialize or reinitialize the GridCore with a data source.
 * Handles cleanup of old core and subscription before creating new ones.
 */
function initializeCore(dataSource: DataSource<Row>): void {
  // Cleanup old subscription
  if (coreUnsubscribeRef.value) {
    coreUnsubscribeRef.value();
    coreUnsubscribeRef.value = null;
  }

  // Destroy old core (idempotent - safe if already destroyed)
  if (coreRef.value) {
    coreRef.value.destroy();
  }

  // Create new GridCore.
  // Vue's ColumnDefinition widens the renderer fields to also accept Components,
  // which core's agnostic type doesn't name. The cast is safe because core only
  // stores the renderer and never invokes it — the Vue layer handles dispatch.
  const core = new GridCore<Row>({
    columns: props.columns as unknown as CoreColumnDefinition[],
    dataSource,
    rowHeight: props.rowHeight,
    headerHeight: totalHeaderHeight.value,
    overscan: props.overscan,
    sortingEnabled: props.sortingEnabled,
    highlighting: props.highlighting,
    getRowId: props.getRowId,
    onCellValueChanged: props.onCellValueChanged
      ? (event) => props.onCellValueChanged?.(event)
      : undefined,
    rowDragEntireRow: props.rowDragEntireRow ?? false,
    onRowDragEnd: (src, tgt) => props.onRowDragEnd?.(src, tgt),
    onColumnResized: (col, w) => props.onColumnResized?.(col, w),
    onColumnMoved: (from, to) => props.onColumnMoved?.(from, to),
    rowGrouping: props.rowGrouping,
    onRowGroupExpandedChange: (groupKey, expanded) =>
      props.onRowGroupExpandedChange?.(groupKey, expanded),
  });

  coreRef.value = core;

  // Subscribe to batched instructions
  coreUnsubscribeRef.value = core.onBatchInstruction((instructions) => {
    applyInstructions(instructions);
  });

  // Initialize and set viewport
  core.initialize();

  const container = bodyContainerRef.value;
  if (container) {
    core.setViewport(
      container.scrollTop,
      container.scrollLeft,
      container.clientWidth,
      container.clientHeight,
    );
  }
}

// Initialize on mount
onMounted(() => {
  const dataSource = getOrCreateDataSource();
  currentDataSourceRef.value = dataSource;

  initializeCore(dataSource);

  // Set up ResizeObserver (only once, not per-core)
  const container = bodyContainerRef.value;
  if (container && typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => {
      // Use current core ref (may change during lifecycle)
      coreRef.value?.setViewport(
        container.scrollTop,
        container.scrollLeft,
        container.clientWidth,
        container.clientHeight,
      );
    });
    resizeObserver.observe(container);

    onUnmounted(() => {
      resizeObserver.disconnect();
    });
  }

  if (container) {
    const sync = () => syncScrollCssVars(container);
    container.addEventListener("scroll", sync, { passive: true });
    sync();
    onUnmounted(() => container.removeEventListener("scroll", sync));
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (coreUnsubscribeRef.value) {
      coreUnsubscribeRef.value();
      coreUnsubscribeRef.value = null;
    }
    if (coreRef.value) {
      coreRef.value.destroy();
      coreRef.value = null;
    }
    if (currentDataSourceRef.value) {
      currentDataSourceRef.value.destroy?.();
      currentDataSourceRef.value = null;
    }
  });
});

// Watch for data source changes - swap via setDataSource to preserve grid state
watch(
  [() => props.dataSource, () => props.rowData],
  () => {
    // Dev warning: rowData prop changed with large dataset
    if (props.rowData && props.rowData.length > 10_000 && currentDataSourceRef.value) {
      console.warn(
        `[gp-grid] rowData prop changed with ${props.rowData.length} rows — this triggers a full rebuild. Use useGridData() for efficient updates.`,
      );
    }

    const newDataSource = getOrCreateDataSource();
    const oldDataSource = currentDataSourceRef.value;

    if (oldDataSource && oldDataSource !== newDataSource) {
      // Destroy old data source (terminates Web Workers)
      oldDataSource.destroy?.();
      // Update data source ref
      currentDataSourceRef.value = newDataSource;
      // Swap data source without destroying core (preserves sort, filter, scroll, selection)
      coreRef.value?.setDataSource(newDataSource);
    } else if (!oldDataSource) {
      // First time setting data source after mount
      currentDataSourceRef.value = newDataSource;
    }
  },
);

// Subscribe to data source changes
watch(
  () => props.dataSource,
  (dataSource) => {
    if (dataSource) {
      const mutableDataSource = dataSource as {
        subscribe?: (listener: () => void) => () => void;
      };
      if (mutableDataSource.subscribe) {
        const unsubscribe = mutableDataSource.subscribe(() => {
          coreRef.value?.refreshFromTransaction();
        });
        onUnmounted(() => unsubscribe());
      }
    }
  },
  { immediate: true },
);

// Apply programmatic scroll from SCROLL_TO instruction (e.g., after filter/sort).
// flush: 'post' ensures the DOM has been updated before we set scrollTop.
watch(
  () => state.value.pendingScrollTop,
  (scrollTop) => {
    if (scrollTop !== null) {
      const container = bodyContainerRef.value;
      if (container) {
        container.scrollTop = scrollTop;
      }
    }
  },
  { flush: "post" },
);

// Watch for highlighting prop changes
watch(
  () => props.highlighting,
  (highlighting) => {
    if (coreRef.value?.highlight && highlighting) {
      coreRef.value.highlight.updateOptions(highlighting);
    }
  },
);

// Expose core for external access (e.g., via template ref)
defineExpose({
  core: coreRef,
});
</script>

<template>
  <div
    ref="outerContainerRef"
    :class="['gp-grid-container', { 'gp-grid-container--dark': darkMode }]"
    :style="{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        '--gp-grid-scroll-left': `${scrollLeft}px`,
        '--gp-grid-viewport-width': `${state.viewportWidth}px`,
    }"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <GridHeader
      :header-height="totalHeaderHeight"
      :scroll-left="scrollLeft"
      :content-width="state.contentWidth"
      :total-width="totalWidth"
      :is-loading="state.isLoading"
      :visible-columns-with-indices="visibleColumnsWithIndices"
      :column-layout="columnLayout"
      :column-positions="columnPositions"
      :column-widths="columnWidths"
      :headers="state.headers"
      :sorting-enabled="sortingEnabled"
      :on-header-mouse-down="handleHeaderMouseDown"
      :on-header-resize-mouse-down="handleHeaderResizeMouseDown"
      :core-ref="coreRef"
      :outer-container-ref="outerContainerRef"
      :header-renderers="headerRenderers ?? {}"
      :global-header-renderer="headerRenderer"
    />

    <GridBody
      ref="gridBodyComp"
      :row-height="rowHeight"
      :total-header-height="totalHeaderHeight"
      :content-width="state.contentWidth"
      :content-height="state.contentHeight"
      :total-width="totalWidth"
      :scroll-left="scrollLeft"
      :viewport-width="state.viewportWidth"
      :rows-wrapper-offset="state.rowsWrapperOffset"
      :active-cell="state.activeCell"
      :selection-range="state.selectionRange"
      :editing-cell="state.editingCell"
      :hover-position="state.hoverPosition"
      :error="state.error"
      :is-loading="state.isLoading"
      :total-rows="state.totalRows"
      :slots-array="slotsArray"
      :visible-columns-with-indices="visibleColumnsWithIndices"
      :column-layout="columnLayout"
      :column-positions="columnPositions"
      :column-widths="columnWidths"
      :fill-handle-position="fillHandlePosition"
      :drag-state="dragState"
      :on-scroll="handleScrollWithHeaderSync"
      :on-wheel="handleWheel"
      :wheel-dampening="wheelDampening"
      :on-cell-mouse-down="handleCellMouseDown"
      :on-cell-double-click="handleCellDoubleClick"
      :on-cell-mouse-enter="handleCellMouseEnter"
      :on-cell-mouse-leave="handleCellMouseLeave"
      :on-fill-handle-mouse-down="handleFillHandleMouseDown"
      :core-ref="coreRef"
      :cell-renderers="cellRenderers ?? {}"
      :edit-renderers="editRenderers ?? {}"
      :global-cell-renderer="cellRenderer"
      :global-edit-renderer="editRenderer"
    />

  <!-- Loading overlay - positioned outside scrollable area to avoid Firefox sticky issues -->
  <div
    v-if="state.isLoading"
    :style="{
      position: 'absolute',
      top: `${totalHeaderHeight}px`,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 50,
      pointerEvents: 'none',
    }"
  >
    <div class="gp-grid-loading-overlay" />
    <component
      v-if="props.loadingComponent"
      :is="props.loadingComponent"
      :is-loading="true"
    />
    <div
      v-else
      class="gp-grid-loading"
    >
      <div class="gp-grid-loading-spinner" />
    </div>
  </div>

  <!-- Filter Popup -->
    <FilterPopup
      v-if="state.filterPopup?.isOpen && state.filterPopup.column"
      :column="state.filterPopup.column"
      :col-index="state.filterPopup.colIndex"
      :container-ref="outerContainerRef"
      :distinct-values="state.filterPopup.distinctValues"
      :current-filter="state.filterPopup.currentFilter"
      @apply="handleFilterApply"
      @close="handleFilterPopupClose"
    />

    <!-- Column resize line -->
    <div
      v-if="dragState.dragType === 'column-resize' && dragState.columnResize"
      class="gp-grid-column-resize-line"
      :style="{
        left: `${(columnPositions[visibleColumnsWithIndices.findIndex(v => v.originalIndex === dragState.columnResize!.colIndex)] ?? 0) + dragState.columnResize!.currentWidth - scrollLeft}px`,
      }"
    />

    <!-- Column move ghost -->
    <template v-if="dragState.dragType === 'column-move' && dragState.columnMove">
      <div
        class="gp-grid-column-move-ghost"
        :style="{
          left: `${dragState.columnMove!.currentX - dragState.columnMove!.ghostWidth / 2}px`,
          top: `${dragState.columnMove!.currentY - dragState.columnMove!.ghostHeight / 2}px`,
          width: `${dragState.columnMove!.ghostWidth}px`,
          height: `${dragState.columnMove!.ghostHeight}px`,
        }"
      >
        {{ effectiveColumns[dragState.columnMove!.sourceColIndex]?.headerName ?? effectiveColumns[dragState.columnMove!.sourceColIndex]?.field ?? '' }}
      </div>
      <div
        v-if="dragState.columnMove!.dropTargetIndex !== null"
        class="gp-grid-column-drop-indicator"
        :style="{
          left: `${(columnPositions[dragState.columnMove!.dropTargetIndex!] ?? 0) - scrollLeft}px`,
          height: `${totalHeaderHeight}px`,
        }"
      />
    </template>

    <!-- Row drag ghost (fixed position, follows cursor) -->
    <div
      v-if="dragState.dragType === 'row-drag' && dragState.rowDrag"
      class="gp-grid-row-drag-ghost"
      :style="{
        left: `${dragState.rowDrag!.currentX + 12}px`,
        top: `${dragState.rowDrag!.currentY - rowHeight / 2}px`,
        width: `${Math.min(300, totalWidth)}px`,
        height: `${rowHeight}px`,
      }"
    />
  </div>
</template>
