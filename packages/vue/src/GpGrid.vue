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
  calculateColumnPositions,
  getTotalWidth,
  isCellSelected,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
} from "gp-grid-core";
import type { Row, ColumnDefinition, ColumnFilterModel, DataSource, CellRange } from "gp-grid-core";
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
const coreRef = shallowRef<GridCore | null>(null);

// State
const { state, applyInstructions } = useGridState();

// Computed values
const totalHeaderHeight = computed(() => props.headerHeight ?? props.rowHeight);
const columnPositions = computed(() => calculateColumnPositions(props.columns));
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
  slots: computed(() => state.slots),
});

// Fill handle position
const { fillHandlePosition } = useFillHandle({
  activeCell: computed(() => state.activeCell),
  selectionRange: computed(() => state.selectionRange),
  slots: computed(() => state.slots),
  columns: computed(() => props.columns),
  columnPositions,
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

// Get cell classes
function getCellClasses(rowIndex: number, colIndex: number): string {
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
  return buildCellClasses(active, selected, isEditing, inFillPreview);
}

// Initialize GridCore
onMounted(() => {
  const dataSource =
    props.dataSource ??
    (props.rowData ? createDataSourceFromArray(props.rowData) : createClientDataSource<Row>([]));

  const core = new GridCore<Row>({
    columns: props.columns,
    dataSource,
    rowHeight: props.rowHeight,
    headerHeight: totalHeaderHeight.value,
    overscan: props.overscan,
    sortingEnabled: props.sortingEnabled,
  });

  coreRef.value = core;

  // Subscribe to batched instructions
  const unsubscribe = core.onBatchInstruction((instructions) => {
    applyInstructions(instructions);
  });

  // Initialize
  core.initialize();

  // Initial measurement
  const container = containerRef.value;
  if (container) {
    core.setViewport(
      container.scrollTop,
      container.scrollLeft,
      container.clientWidth,
      container.clientHeight,
    );

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      core.setViewport(
        container.scrollTop,
        container.scrollLeft,
        container.clientWidth,
        container.clientHeight,
      );
    });
    resizeObserver.observe(container);

    onUnmounted(() => {
      resizeObserver.disconnect();
      unsubscribe();
      coreRef.value = null;
    });
  }
});

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
          zIndex: 100,
        }"
      >
        <div
          v-for="(column, colIndex) in columns"
          :key="column.colId ?? column.field"
          class="gp-grid-header-cell"
          :data-col-index="colIndex"
          :style="{
            position: 'absolute',
            left: `${columnPositions[colIndex]}px`,
            top: 0,
            width: `${column.width}px`,
            height: `${totalHeaderHeight}px`,
            background: 'transparent',
          }"
          @click="(e) => handleHeaderClick(colIndex, e)"
        >
          <component
            :is="renderHeader({
              column,
              colIndex,
              sortDirection: state.headers.get(colIndex)?.sortDirection,
              sortIndex: state.headers.get(colIndex)?.sortIndex,
              sortable: state.headers.get(colIndex)?.sortable ?? true,
              filterable: state.headers.get(colIndex)?.filterable ?? true,
              hasFilter: state.headers.get(colIndex)?.hasFilter ?? false,
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
        :class="['gp-grid-row', { 'gp-grid-row--even': slot.rowIndex % 2 === 0 }]"
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
          v-for="(column, colIndex) in columns"
          :key="`${slot.slotId}-${colIndex}`"
          :class="getCellClasses(slot.rowIndex, colIndex)"
          :style="{
            position: 'absolute',
            left: `${columnPositions[colIndex]}px`,
            top: 0,
            width: `${column.width}px`,
            height: `${rowHeight}px`,
          }"
          @mousedown="(e) => handleCellMouseDown(slot.rowIndex, colIndex, e)"
          @dblclick="() => handleCellDoubleClick(slot.rowIndex, colIndex)"
        >
          <!-- Edit mode -->
          <template v-if="isCellEditing(slot.rowIndex, colIndex, state.editingCell) && state.editingCell">
            <component
              :is="renderEditCell({
                column,
                rowData: slot.rowData,
                rowIndex: slot.rowIndex,
                colIndex,
                initialValue: state.editingCell.initialValue,
                core: coreRef,
                editRenderers: editRenderers ?? {},
                globalEditRenderer: editRenderer,
              }) ?? ''"
            />
          </template>
          <!-- View mode -->
          <template v-else>
            <component
              :is="renderCell({
                column,
                rowData: slot.rowData,
                rowIndex: slot.rowIndex,
                colIndex,
                isActive: isCellActive(slot.rowIndex, colIndex, state.activeCell),
                isSelected: isCellSelected(slot.rowIndex, colIndex, state.selectionRange),
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
