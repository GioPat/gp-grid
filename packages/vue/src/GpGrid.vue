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
import type { Row, ColumnDefinition, ColumnFilterModel, DataSource, CellRange, HighlightingOptions } from "@gp-grid/core";
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
const containerRef = ref<HTMLDivElement | null>(null);
const coreRef = shallowRef<GridCore<Row> | null>(null);
const currentDataSourceRef = shallowRef<DataSource<Row> | null>(null);
const coreUnsubscribeRef = shallowRef<(() => void) | null>(null);

// State
const { state, applyInstructions, reset: resetState } = useGridState({
  initialWidth: props.initialWidth,
  initialHeight: props.initialHeight,
});

// Computed values
const totalHeaderHeight = computed(() => props.headerHeight ?? props.rowHeight);

// Create visible columns with original index tracking (for hidden column support)
const visibleColumnsWithIndices = computed(() =>
  props.columns
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
  handleKeyDown,
  handleWheel,
  dragState,
} = useInputHandler(coreRef, containerRef, computed(() => props.columns), {
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
  columns: computed(() => props.columns),
  visibleColumnsWithIndices,
  columnPositions,
  columnWidths,
  rowHeight: props.rowHeight,
});

// Handle scroll
function handleScroll(): void {
  const container = containerRef.value;
  const core = coreRef.value;
  if (!container || !core) return;

  core.setViewport(
    container.scrollTop,
    container.scrollLeft,
    container.clientWidth,
    container.clientHeight,
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

  return [baseCellClasses, ...highlightCellClasses].filter(Boolean).join(" ");
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
  });

  coreRef.value = core;

  // Subscribe to batched instructions
  coreUnsubscribeRef.value = core.onBatchInstruction((instructions) => {
    applyInstructions(instructions);
  });

  // Initialize and set viewport
  core.initialize();

  const container = containerRef.value;
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
  const container = containerRef.value;
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

// Watch for data source changes - cleanup old, create new
watch(
  [() => props.dataSource, () => props.rowData],
  () => {
    const newDataSource = getOrCreateDataSource();
    const oldDataSource = currentDataSourceRef.value;

    // Only reinitialize if data source actually changed
    if (oldDataSource && oldDataSource !== newDataSource) {
      // Destroy old data source (terminates Web Workers)
      oldDataSource.destroy?.();
      // Reset state to clear slot rowData references
      resetState();
      // Update data source ref
      currentDataSourceRef.value = newDataSource;
      // Reinitialize core with new data source
      initializeCore(newDataSource);
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
          coreRef.value?.refresh();
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
    ref="containerRef"
    :class="['gp-grid-container', { 'gp-grid-container--dark': darkMode }]"
    style="width: 100%; height: 100%; overflow: auto; position: relative"
    tabindex="0"
    @scroll="handleScroll"
    @wheel="(e) => handleWheel(e, wheelDampening)"
    @keydown="handleKeyDown"
  >
    <!-- Content sizer -->
    <div
      :style="{
        width: `${Math.max(state.contentWidth, totalWidth)}px`,
        height: `${Math.max(state.contentHeight, totalHeaderHeight)}px`,
        position: 'relative',
        minWidth: '100%',
      }"
    >
      <!-- Headers -->
      <div
        class="gp-grid-header"
        :style="{
          position: 'sticky',
          top: 0,
          left: 0,
          height: `${totalHeaderHeight}px`,
          width: `${Math.max(state.contentWidth, totalWidth)}px`,
          minWidth: '100%',
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
          @click="(e) => handleHeaderClick(originalIndex, e)"
        >
          <component
            :is="renderHeader({
              column,
              colIndex: originalIndex,
              sortDirection: state.headers.get(originalIndex)?.sortDirection,
              sortIndex: state.headers.get(originalIndex)?.sortIndex,
              sortable: state.headers.get(originalIndex)?.sortable ?? true,
              filterable: state.headers.get(originalIndex)?.filterable ?? true,
              hasFilter: state.headers.get(originalIndex)?.hasFilter ?? false,
              core: coreRef,
              container: containerRef,
              headerRenderers: headerRenderers ?? {},
              globalHeaderRenderer: headerRenderer,
            })"
          />
        </div>
      </div>

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

      <!-- Fill handle -->
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

      <!-- Loading indicator -->
      <div v-if="state.isLoading" class="gp-grid-loading">
        <div class="gp-grid-loading-spinner" />
        Loading...
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
  </div>
</template>
