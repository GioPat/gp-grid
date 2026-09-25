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
  readIsRtl,
  toInlineX,
  toPhysicalX,
  TouchScrollController,
  defaultPinIcon,
  resolveGridLabels,
} from "@gp-grid/core";
import type { Component } from "vue";
import type { RowId, ColumnFilterModel, ColumnLayoutMode, ColumnMovedEvent, ColumnPinnedEvent, ColumnResizedEvent, ColumnStateUpdate, DataSource, CellValueChangedEvent, CellWriteRejectedEvent, FreezeRowsOptions, FrozenRowsState, GridIcon, GridLabelOverrides, HighlightingOptions, ColumnDefinition as CoreColumnDefinition, RowDragEndEvent, RowLoadingOptions } from "@gp-grid/core";
import { useGridState } from "./gridState";
import { useInputHandler } from "./composables/useInputHandler";
import { useFillHandle } from "./composables/useFillHandle";
import type { ColumnDefinition, Row, VueCellRenderer, VueEditRenderer, VueHeaderRenderer } from "./types";
import FilterPopup from "./components/FilterPopup.vue";
import GridHeader from "./components/GridHeader.vue";
import GridBody from "./components/GridBody.vue";
import CellPeek from "./components/CellPeek.vue";

const props = withDefaults(
  defineProps<{
    columns: ColumnDefinition[];
    /** Controlled per-column state; applied through the core whenever it changes. */
    columnState?: ColumnStateUpdate[];
    dataSource?: DataSource<Row>;
    rowData?: Row[];
    rowHeight: number;
    headerHeight?: number;
    overscan?: number;
    /** Column overscan in CSS px per side for the mounted center window. */
    columnOverscan?: number;
    /** Displayed-width policy: "fit" (default) expands columns to the viewport. */
    columnLayout?: ColumnLayoutMode;
    rowLoading?: RowLoadingOptions;
    /**
     * Number of leading displayed rows kept visible below the header. Applied
     * at runtime; a new identity never rebuilds the core.
     */
    freezeRows?: FreezeRowsOptions;
    /** Called when the effective frozen count or its limiting reason changes. */
    onFrozenRowsChanged?: (state: FrozenRowsState) => void;
    sortingEnabled?: boolean;
    darkMode?: boolean;
    wheelDampening?: number;
    /** Max accumulated touch-fling velocity (logical px/ms) when scroll virtualization is active. Pair higher values with overscan 10-12. Default: 20 × rowHeight (~20,000 rows/s) */
    maxFlingVelocity?: number;
    cellRenderers?: Record<string, VueCellRenderer>;
    editRenderers?: Record<string, VueEditRenderer>;
    headerRenderers?: Record<string, VueHeaderRenderer>;
    cellRenderer?: VueCellRenderer;
    editRenderer?: VueEditRenderer;
    headerRenderer?: VueHeaderRenderer;
    /** SVG used by the default header's pin toggle. */
    pinIcon?: GridIcon;
    /** Initial viewport width for SSR (pixels). ResizeObserver takes over on client. */
    initialWidth?: number;
    /** Initial viewport height for SSR (pixels). ResizeObserver takes over on client. */
    initialHeight?: number;
    /** Row/column/cell highlighting configuration */
    highlighting?: HighlightingOptions<Row>;
    /** Function to extract unique ID from row. Required when onCellValueChanged is provided. */
    getRowId?: (row: Row) => RowId;
    /** Called when a cell value is changed via editing, fill drag, or paste. Requires getRowId. */
    onCellValueChanged?: (event: CellValueChangedEvent<Row>) => void;
    /** Called when a write is refused because the bound source is read-only. */
    onWriteRejected?: (event: CellWriteRejectedEvent) => void;
    /** Custom loading component to render instead of default spinner */
    loadingComponent?: Component<{ isLoading: boolean }>;
    /** Whether clicking and dragging any cell in a row drags the entire row. Default: false */
    rowDragEntireRow?: boolean;
    /** Called when a row is dropped after dragging. Consumer handles data reordering. */
    onRowDragEnd?: (event: RowDragEndEvent) => void;
    /** Called when a column is resized. */
    onColumnResized?: (event: ColumnResizedEvent) => void;
    /** Called when a column is moved/reordered. */
    onColumnMoved?: (event: ColumnMovedEvent) => void;
    /** Called when a column is pinned or unpinned. */
    onColumnPinned?: (event: ColumnPinnedEvent) => void;
    /** Override any user-visible grid label. Unspecified labels fall back to English defaults. */
    labels?: GridLabelOverrides;
  }>(),
  {
    overscan: 3,
    sortingEnabled: true,
    darkMode: false,
    wheelDampening: 0.1,
    cellRenderers: () => ({}),
    editRenderers: () => ({}),
    headerRenderers: () => ({}),
    pinIcon: () => defaultPinIcon,
  },
);

// Refs
const outerContainerRef = ref<HTMLDivElement | null>(null);
const gridBodyComp = ref<InstanceType<typeof GridBody> | null>(null);
const bodyContainerRef = computed(() => gridBodyComp.value?.bodyRef ?? null);
const coreRef = shallowRef<GridCore<Row> | null>(null);
const currentDataSourceRef = shallowRef<DataSource<Row> | null>(null);
const coreUnsubscribeRef = shallowRef<(() => void) | null>(null);

// Synthetic touch scrolling for scaled grids: when scroll virtualization
// compresses the DOM scroll space, the controller takes over touch gestures
// so content tracks the finger 1:1 with a consistent fling. Inert otherwise.
const touchScroll = new TouchScrollController<Row>({
  getCore: () => coreRef.value,
  getScrollEl: () => bodyContainerRef.value,
  isBrowser: typeof window !== "undefined",
});

// Header scroll sync
const scrollLeft = ref(0);

// Inline direction, resampled on mount and on every container resize.
const rtl = ref(false);

// State
const { state, renderToken, applyInstructions, reset: resetState } = useGridState({
  initialWidth: props.initialWidth,
  initialHeight: props.initialHeight,
  initialColumns: props.columns as unknown as CoreColumnDefinition[],
  initialColumnLayout: props.columnLayout ?? "fit",
});

// Computed values
const totalHeaderHeight = computed(() => props.headerHeight ?? props.rowHeight);
const resolvedLabels = computed(() => resolveGridLabels(props.labels));

// Resolved layout owned by the core. The `columns` prop is schema input only;
// the wrapper never renders it directly after mount.
const effectiveColumns = computed<CoreColumnDefinition[]>(
  () => state.value.columns,
);

// Displayed geometry: the core resolves offsets/widths and publishes them.
const columnWindow = computed(() => state.value.columnWindow);
const displayedColumnCount = computed(() => state.value.layout?.columns.length ?? 0);
const totalWidth = computed(() => state.value.contentWidth);
const slotsArray = computed(() => Array.from(state.value.slots.values()));

// Displayed index per column id, for `aria-colindex`. Keyed on the layout, so
// scrolling the window never rebuilds it.
const displayedIndexOf = computed(() => {
  const index = new Map<string, number>();
  state.value.layout?.columns.forEach((column, at) => index.set(column.columnId, at));
  return (columnId: string): number => index.get(columnId) ?? 0;
});

// Input handling
const {
  handleCellMouseDown,
  handleCellDoubleClick,
  handleFillHandleMouseDown,
  handleHeaderClick,
  handleHeaderMouseDown,
  handleHeaderResizeMouseDown,
  handleKeyDown,
  handlePaste,
  handleWheel,
  dragState,
} = useInputHandler(coreRef, bodyContainerRef, effectiveColumns, {
  activeCell: computed(() => state.value.activeCell),
  selectionRange: computed(() => state.value.selectionRange),
  editingCell: computed(() => state.value.editingCell),
  filterPopupOpen: computed(() => state.value.filterPopup?.isOpen ?? false),
  onBeforeProgrammaticScroll: () => touchScroll.stop(),
});

// Fill handle position, resolved by core geometry in rows-wrapper space.
const { fillHandlePosition } = useFillHandle({
  coreRef,
  activeCell: computed(() => state.value.activeCell),
  selectionRange: computed(() => state.value.selectionRange),
  slots: computed(() => state.value.slots),
  geometryRevision: computed(() => state.value.geometryRevision),
});

// Handle scroll
function handleScroll(): void {
  const container = bodyContainerRef.value;
  const core = coreRef.value;
  if (!container || !core) return;

  core.setViewport(
    container.scrollTop,
    toInlineX(container.scrollLeft, rtl.value),
    container.clientWidth,
    container.clientHeight,
  );
}

// Handle scroll with header sync
function handleScrollWithHeaderSync(): void {
  const container = bodyContainerRef.value;
  if (container) {
    // The header strip undoes the native scroll, so it takes the DOM value.
    scrollLeft.value = container.scrollLeft;
  }
  handleScroll();
}

// Handle filter apply
function handleFilterApply(colId: string, filter: ColumnFilterModel | null): void {
  const core = coreRef.value;
  if (core) {
    core.sortFilter.setFilter(colId, filter);
  }
}

// Handle filter popup close
function handleFilterPopupClose(): void {
  const core = coreRef.value;
  if (core) {
    core.sortFilter.closeFilterPopup();
  }
}

// Handle peek overlay close
function handlePeekClose(): void {
  coreRef.value?.edit.stopPeek();
}

// Resolve peek column + row data from current state
const peekContext = computed(() => {
  const peek = state.value.peekCell;
  if (!peek) return null;
  const column = effectiveColumns.value[peek.col];
  const slot = slotsArray.value.find((s) => s.rowIndex === peek.row);
  if (!column || !slot) return null;
  return { peek, column, rowData: slot.rowData as Row | undefined };
});

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
    columnOverscan: props.columnOverscan,
    columnLayout: props.columnLayout ?? "fit",
    maxFlingVelocity: props.maxFlingVelocity,
    rowLoading: props.rowLoading,
    freezeRows: props.freezeRows,
    sortingEnabled: props.sortingEnabled,
    highlighting: props.highlighting,
    getRowId: props.getRowId,
    onCellValueChanged: props.onCellValueChanged
      ? (event) => props.onCellValueChanged?.(event)
      : undefined,
    onWriteRejected: (event) => props.onWriteRejected?.(event),
    rowDragEntireRow: props.rowDragEntireRow ?? false,
    onRowDragEnd: (event) => props.onRowDragEnd?.(event),
    onColumnResized: (event) => props.onColumnResized?.(event),
    onColumnMoved: (event) => props.onColumnMoved?.(event),
    onColumnPinned: (event) => props.onColumnPinned?.(event),
    onFrozenRowsChanged: (state) => props.onFrozenRowsChanged?.(state),
    labels: props.labels,
  });

  // The columnState watcher only fires on change; apply the current value here.
  if (props.columnState) core.columns.setState(props.columnState);
  coreRef.value = core;
  touchScroll.syncCore();

  // Subscribe to batched instructions
  coreUnsubscribeRef.value = core.onBatchInstruction((instructions) => {
    applyInstructions(instructions);
  });

  // Initialize and set viewport
  core.initialize();

  const container = bodyContainerRef.value;
  if (container) {
    rtl.value = readIsRtl(container);
    core.setViewport(
      container.scrollTop,
      toInlineX(container.scrollLeft, rtl.value),
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

  touchScroll.attach();

  // Set up ResizeObserver (only once, not per-core)
  const container = bodyContainerRef.value;
  if (container && typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => {
      // Use current core ref (may change during lifecycle)
      rtl.value = readIsRtl(container);
      touchScroll.resetDirection();
      coreRef.value?.setViewport(
        container.scrollTop,
        toInlineX(container.scrollLeft, rtl.value),
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
    touchScroll.detach();
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

// Apply programmatic scroll from SCROLL_TO. flush: 'post' ensures the DOM has
// been updated before the scroll positions are written.
watch(
  () => [state.value.pendingScrollTop, state.value.pendingScrollLeft] as const,
  ([scrollTop, scrollLeft]) => {
    const container = bodyContainerRef.value;
    if (container === null) return;
    if (scrollTop === null && scrollLeft === null) return;
    // A programmatic scroll wins over any in-flight synthetic fling.
    touchScroll.stop();
    if (scrollTop !== null) container.scrollTop = scrollTop;
    if (scrollLeft !== null) container.scrollLeft = toPhysicalX(scrollLeft, rtl.value);
  },
  { flush: "post" },
);

// Switch layout mode without recreating the core.
watch(
  () => props.columnLayout,
  (mode) => {
    coreRef.value?.columns.setLayout(mode ?? "fit");
  },
);

// Apply a new freeze configuration without recreating the core; the setter is
// silent for an equal request, and creation already received the prop.
watch(
  () => props.freezeRows,
  (config) => {
    coreRef.value?.frozenRows.set(config);
  },
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

// Reconcile a replacement `columns` array without recreating the core.
watch(
  () => props.columns,
  (columns) => {
    coreRef.value?.columns.set(columns as unknown as CoreColumnDefinition[]);
  },
);

// Apply a controlled column-state input whenever it changes.
watch(
  () => props.columnState,
  (columnState) => {
    if (columnState) coreRef.value?.columns.setState(columnState);
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
    role="grid"
    :aria-colcount="displayedColumnCount"
    :aria-rowcount="state.totalRows"
    tabindex="0"
    @keydown="handleKeyDown"
    @paste="handlePaste"
  >
    <GridHeader
      :header-height="totalHeaderHeight"
      :scroll-left="scrollLeft"
      :content-width="state.contentWidth"
      :total-width="totalWidth"
      :viewport-width="state.viewportWidth"
      :is-loading="state.isLoading"
      :column-window="columnWindow"
      :displayed-index-of="displayedIndexOf"
      :headers="state.headers"
      :sorting-enabled="sortingEnabled"
      :rtl="rtl"
      :labels="resolvedLabels"
      :on-header-mouse-down="handleHeaderMouseDown"
      :on-header-resize-mouse-down="handleHeaderResizeMouseDown"
      :core-ref="coreRef"
      :outer-container-ref="outerContainerRef"
      :header-renderers="headerRenderers ?? {}"
      :global-header-renderer="headerRenderer"
      :pin-icon="pinIcon"
    />

    <GridBody
      ref="gridBodyComp"
      :row-height="rowHeight"
      :total-header-height="totalHeaderHeight"
      :content-width="state.contentWidth"
      :content-height="state.contentHeight"
      :total-width="totalWidth"
      :rows-wrapper-offset="state.rowsWrapperOffset"
      :row-regions="state.rowRegions"
      :announcement="state.announcement"
      :active-cell="state.activeCell"
      :selection-range="state.selectionRange"
      :editing-cell="state.editingCell"
      :hover-position="state.hoverPosition"
      :error="state.error"
      :is-loading="state.isLoading"
      :total-rows="state.totalRows"
      :labels="resolvedLabels"
      :slots-array="slotsArray"
      :column-window="columnWindow"
      :displayed-index-of="displayedIndexOf"
      :render-token="renderToken"
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
      :labels="resolvedLabels"
      @apply="handleFilterApply"
      @close="handleFilterPopupClose"
    />

    <!-- Cell Peek (read-only multi-line overlay on dblclick of non-editable cell) -->
    <CellPeek
      v-if="peekContext"
      :peek-cell="peekContext.peek"
      :column="peekContext.column"
      :row-data="peekContext.rowData"
      :core="coreRef"
      :container-ref="bodyContainerRef"
      :cell-renderers="cellRenderers ?? {}"
      :global-cell-renderer="cellRenderer"
      @close="handlePeekClose"
    />

    <!-- Column resize line -->
    <div
      v-if="dragState.dragType === 'column-resize' && dragState.columnResize"
      class="gp-grid-column-resize-line"
      :style="{
        insetInlineStart: `${dragState.columnResize!.lineX}px`,
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
          insetInlineStart: `${dragState.columnMove.dropIndicatorX}px`,
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
