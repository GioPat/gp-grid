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
  injectStyles,
  calculateScaledColumnPositions,
  getTotalWidth,
  isCellSelected,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
} from "@gp-grid/core";
import type { Row, RowId, ColumnDefinition, ColumnFilterModel, DataSource, CellRange, CellValueChangedEvent, HighlightingOptions } from "@gp-grid/core";
import { useGridState } from "./gridState";
import { useInputHandler } from "./composables/useInputHandler";
import { useFillHandle } from "./composables/useFillHandle";
import { renderCell } from "./renderers/cellRenderer";
import { renderEditCell } from "./renderers/editRenderer";
import { renderHeader } from "./renderers/headerRenderer";
import type { VueCellRenderer, VueEditRenderer, VueHeaderRenderer } from "./types";
import FilterPopup from "./components/FilterPopup.vue";

// Inject styles on first render
injectStyles();

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
const bodyContainerRef = ref<HTMLDivElement | null>(null);
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

// Effective columns: use core-updated columns (after resize/move) or fall back to props
const effectiveColumns = computed(() => state.columns ?? props.columns);

// Create visible columns with original index tracking (for hidden column support)
const visibleColumnsWithIndices = computed(() =>
  effectiveColumns.value
    .map((col, index) => ({ column: col, originalIndex: index }))
    .filter(({ column }) => !column.hidden),
);

const scaledColumns = computed(() =>
  calculateScaledColumnPositions(
    visibleColumnsWithIndices.value.map((v) => v.column),
    state.viewportWidth,
  ),
);
const columnPositions = computed(() => scaledColumns.value.positions);
const columnWidths = computed(() => scaledColumns.value.widths);
const totalWidth = computed(() => getTotalWidth(columnPositions.value));
const slotsArray = computed(() => Array.from(state.slots.values()));

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
  activeCell: computed(() => state.activeCell),
  selectionRange: computed(() => state.selectionRange),
  editingCell: computed(() => state.editingCell),
  filterPopupOpen: computed(() => state.filterPopup?.isOpen ?? false),
  rowHeight: props.rowHeight,
  headerHeight: totalHeaderHeight.value,
  columnPositions,
  visibleColumnsWithIndices,
  slots: computed(() => state.slots),
});

// Fill handle position
const { fillHandlePosition } = useFillHandle({
  activeCell: computed(() => state.activeCell),
  selectionRange: computed(() => state.selectionRange),
  slots: computed(() => state.slots),
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
    scrollLeft.value = container.scrollLeft;
  }
  handleScroll();
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

// Get row classes including highlight classes (pass rowData for content-based rules)
function getRowClasses(slot: { rowIndex: number; rowData: Row }): string {
  const highlightRowClasses =
    coreRef.value?.highlight?.computeRowClasses(slot.rowIndex, slot.rowData) ?? [];
  return ["gp-grid-row", ...highlightRowClasses].filter(Boolean).join(" ");
}

// Get cell classes
// Note: hoverPosition param establishes Vue reactivity dependency for re-render on hover changes
function getCellClasses(
  rowIndex: number,
  colIndex: number,
  column: ColumnDefinition,
  rowData: Row,
  _hoverPosition: { row: number; col: number } | null,
): string {
  const isEditing = isCellEditing(rowIndex, colIndex, state.editingCell);
  const active = isCellActive(rowIndex, colIndex, state.activeCell);
  const selected = isCellSelected(rowIndex, colIndex, state.selectionRange);
  const inFillPreview = isCellInFillPreview(
    rowIndex,
    colIndex,
    dragState.value.dragType === "fill",
    dragState.value.fillSourceRange,
    dragState.value.fillTarget,
  );
  const baseCellClasses = buildCellClasses(active, selected, isEditing, inFillPreview);

  // Compute highlight cell classes
  const highlightCellClasses =
    coreRef.value?.highlight?.computeCombinedCellClasses(rowIndex, colIndex, column, rowData) ?? [];

  const isRowDragHandle = column.rowDrag === true;

  return [
    baseCellClasses,
    ...highlightCellClasses,
    isRowDragHandle ? "gp-grid-cell--row-drag-handle" : "",
  ].filter(Boolean).join(" ");
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

  // Create new GridCore
  const core = new GridCore<Row>({
    columns: props.columns,
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
    style="width: 100%; height: 100%; position: relative; display: flex; flex-direction: column"
    tabindex="0"
    @keydown="handleKeyDown"
  >
    <!-- Header container - fixed height, horizontal scroll synced with body -->
    <div
      :class="['gp-grid-header', { 'gp-grid-header--loading': state.isLoading }]"
      :style="{
        flexShrink: 0,
        height: `${totalHeaderHeight}px`,
        overflow: 'hidden',
        position: 'relative',
        zIndex: 100,
      }"
    >
      <div
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translateX(${-scrollLeft}px)`,
          width: `${Math.max(state.contentWidth, totalWidth)}px`,
          height: `${totalHeaderHeight}px`,
        }"
      >
        <div
          v-for="({ column, originalIndex }, visibleIndex) in visibleColumnsWithIndices"
          :key="column.colId ?? column.field"
          class="gp-grid-header-cell"
          :data-col-index="originalIndex"
          :style="{
            position: 'absolute',
            left: `${columnPositions[visibleIndex]}px`,
            top: 0,
            width: `${columnWidths[visibleIndex]}px`,
            height: `${totalHeaderHeight}px`,
            background: 'transparent',
          }"
          @mousedown="(e: MouseEvent) => handleHeaderMouseDown(originalIndex, columnWidths[visibleIndex] ?? 0, totalHeaderHeight, e)"
        >
          <component
            :is="renderHeader({
              column,
              colIndex: originalIndex,
              sortDirection: state.headers.get(originalIndex)?.sortDirection,
              sortIndex: state.headers.get(originalIndex)?.sortIndex,
              sortable: (column.sortable !== false) && sortingEnabled,
              filterable: column.filterable !== false,
              hasFilter: state.headers.get(originalIndex)?.hasFilter ?? false,
              core: coreRef,
              container: outerContainerRef,
              headerRenderers: headerRenderers ?? {},
              globalHeaderRenderer: headerRenderer,
            })"
          />
          <!-- Resize handle -->
          <div
            v-if="column.resizable !== false"
            class="gp-grid-header-resize-handle"
            @mousedown.stop="(e: MouseEvent) => handleHeaderResizeMouseDown(originalIndex, columnWidths[visibleIndex] ?? 0, e)"
          />
        </div>
      </div>
    </div>

    <!-- Scrollable body container -->
    <div
      ref="bodyContainerRef"
      style="flex: 1; overflow: auto; position: relative"
      @scroll="handleScrollWithHeaderSync"
      @wheel="(e) => handleWheel(e, wheelDampening)"
    >
      <!-- Content sizer - provides scroll range -->
      <div
        :style="{
          width: `${Math.max(state.contentWidth, totalWidth)}px`,
          height: `${Math.max(state.contentHeight - totalHeaderHeight, 0)}px`,
          position: 'relative',
          minWidth: '100%',
        }"
      >
        <!-- Rows wrapper - uses transform to position rows with small translateY values -->
        <!-- This prevents browser rendering issues at extreme pixel positions (millions of px) -->
        <div
          class="gp-grid-rows-wrapper"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${Math.max(state.contentWidth, totalWidth)}px`,
            transform: `translateY(${state.rowsWrapperOffset}px)`,
            willChange: 'transform',
          }"
        >
        <!-- Row slots -->
        <div
          v-for="slot in slotsArray.filter((s) => s.rowIndex >= 0)"
          :key="slot.slotId"
          :class="getRowClasses(slot)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translateY(${slot.translateY}px)`,
            width: `${Math.max(state.contentWidth, totalWidth)}px`,
            height: `${rowHeight}px`,
          }"
        >
          <div
            v-for="({ column, originalIndex }, visibleIndex) in visibleColumnsWithIndices"
            :key="`${slot.slotId}-${originalIndex}`"
            :class="getCellClasses(slot.rowIndex, originalIndex, column, slot.rowData, state.hoverPosition)"
            :style="{
              position: 'absolute',
              left: `${columnPositions[visibleIndex]}px`,
              top: 0,
              width: `${columnWidths[visibleIndex]}px`,
              height: `${rowHeight}px`,
            }"
            @mousedown="(e) => handleCellMouseDown(slot.rowIndex, originalIndex, e)"
            @dblclick="() => handleCellDoubleClick(slot.rowIndex, originalIndex)"
            @mouseenter="() => handleCellMouseEnter(slot.rowIndex, originalIndex)"
            @mouseleave="handleCellMouseLeave"
          >
            <!-- Edit mode -->
            <template v-if="isCellEditing(slot.rowIndex, originalIndex, state.editingCell) && state.editingCell">
              <component
                :is="renderEditCell({
                  column,
                  rowData: slot.rowData,
                  rowIndex: slot.rowIndex,
                  colIndex: originalIndex,
                  initialValue: state.editingCell.initialValue,
                  core: coreRef,
                  editRenderers: editRenderers ?? {},
                  globalEditRenderer: editRenderer,
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
                  isActive: isCellActive(slot.rowIndex, originalIndex, state.activeCell),
                  isSelected: isCellSelected(slot.rowIndex, originalIndex, state.selectionRange),
                  isEditing: false,
                  cellRenderers: cellRenderers ?? {},
                  globalCellRenderer: cellRenderer,
                })"
              />
            </template>
          </div>
        </div>

        <!-- Fill handle - inside wrapper so it moves with rows -->
        <div
          v-if="fillHandlePosition && !state.editingCell"
          class="gp-grid-fill-handle"
          :style="{
            position: 'absolute',
            top: `${fillHandlePosition.top}px`,
            left: `${fillHandlePosition.left}px`,
            zIndex: 200,
          }"
          @mousedown="handleFillHandleMouseDown"
        />

        <!-- Row drop indicator - inside wrapper so it scrolls with rows -->
        <div
          v-if="dragState.dragType === 'row-drag' && dragState.rowDrag?.dropTargetIndex !== null"
          class="gp-grid-row-drop-indicator"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translateY(${dragState.rowDrag!.dropIndicatorY}px)`,
            width: `${Math.max(state.contentWidth, totalWidth)}px`,
          }"
        />
      </div>

      <!-- Error message -->
      <div v-if="state.error" class="gp-grid-error">
        Error: {{ state.error }}
      </div>

      <!-- Empty state -->
      <div
        v-if="!state.isLoading && !state.error && state.totalRows === 0"
        class="gp-grid-empty"
      >
        No data to display
      </div>
    </div>
    <!-- End content sizer -->
  </div>
  <!-- End scrollable body container -->

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
    <div
      class="gp-grid-loading-overlay"
      :style="{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }"
    />
    <component
      v-if="props.loadingComponent"
      :is="props.loadingComponent"
      :is-loading="true"
    />
    <div
      v-else
      class="gp-grid-loading"
      :style="{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'auto',
      }"
    >
      <div class="gp-grid-loading-spinner" />
    </div>
  </div>

  <!-- Filter Popup -->
    <FilterPopup
      v-if="state.filterPopup?.isOpen && state.filterPopup.column && state.filterPopup.anchorRect"
      :column="state.filterPopup.column"
      :col-index="state.filterPopup.colIndex"
      :anchor-rect="state.filterPopup.anchorRect"
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
        position: 'absolute',
        top: 0,
        left: `${(columnPositions[visibleColumnsWithIndices.findIndex(v => v.originalIndex === dragState.columnResize!.colIndex)] ?? 0) + dragState.columnResize!.currentWidth}px`,
        height: '100%',
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
          position: 'absolute',
          top: 0,
          left: `${columnPositions[dragState.columnMove!.dropTargetIndex!] ?? 0}px`,
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
