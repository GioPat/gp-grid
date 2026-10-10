// packages/vue/src/composables/useGpGrid.ts

import { ref, shallowRef, computed, onMounted, onUnmounted, watch, type Ref, type ComputedRef, type ShallowRef } from "vue";
import {
  GridCore,
  createClientDataSource,
  createDataSourceFromArray,
  isCellSelected,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
  readIsRtl,
  toInlineX,
  toPhysicalX,
  TouchScrollController,
  PendingScrollLatch,
  createDomMeasurementHost,
  isMutableDataSource,
  resolveGridLabels,
} from "@gp-grid/core";
import type {
  AutoFitOptions,
  RowId,
  RowResizedEvent,
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupLimits,
  ColumnSchemaError,
  ColumnLayoutMode,
  ColumnLayoutSnapshot,
  ColumnFilterModel,
  ColumnPinnedEvent,
  CellValueChangedEvent,
  DataSource,
  DragState,
  FillHandlePosition,
  FreezeRowsOptions,
  FrozenRowsState,
  GridAnnouncement,
  GridLabelOverrides,
  GridState,
  RowRegionLayout,
  SlotData,
  HighlightingOptions,
  RowGrouping,
  RowGroupingRejection,
  RowGroupToggledEvent,
  RowLoadingOptions,
} from "@gp-grid/core";
import { useGridState } from "../gridState";
import { useInputHandler } from "./useInputHandler";
import { useFillHandle } from "./useFillHandle";
import { useColumnSchemaSync } from "./useColumnSchemaSync";
import {
  createGroupTogglePointerDown,
  useRowGroupCellContext,
  useRowGroupingSync,
  type RowGroupCellContext,
} from "./useRowGroupingSync";
import type {
  VueCellRenderer,
  VueEditRenderer,
  VueGroupLabelRenderer,
  VueHeaderRenderer,
  VueHeaderRendererRegistry,
} from "../types";

// =============================================================================
// Types
// =============================================================================

export interface UseGpGridOptions<TData = unknown> {
  columns: ColumnDefinition[];
  dataSource?: DataSource<TData>;
  rowData?: TData[];
  rowHeight: number;
  /** Header height in pixels, the default height of every band. Default: rowHeight */
  headerHeight?: number;
  /** Height of each header band, indexed by band; a band without one is `headerHeight`. Changeable at runtime. */
  headerBandHeights?: readonly number[];
  /**
   * Nested header groups over the column ids; every column is referenced
   * once, ungrouped ones at the root. Applied together with `columns`.
   */
  columnGroups?: readonly ColumnGroupChild[];
  /** Budgets of `columnGroups`. Read at creation. */
  columnGroupLimits?: ColumnGroupLimits;
  /** Called when a column change is rejected; the previous schema stays. */
  onColumnSchemaRejected?: (error: ColumnSchemaError) => void;
  overscan?: number;
  /** Column overscan in CSS px per side for the mounted center window. */
  columnOverscan?: number;
  /** Displayed-width policy. Default: "fit". */
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
  highlighting?: HighlightingOptions<TData>;
  /** Function to extract unique ID from row. Required when onCellValueChanged is provided. */
  getRowId?: (row: TData) => RowId;
  /** Called when a cell value is changed via editing, fill drag, or paste. Requires getRowId. */
  onCellValueChanged?: (event: CellValueChangedEvent<TData>) => void;
  /** Called when a column is pinned or unpinned. */
  onColumnPinned?: (event: ColumnPinnedEvent) => void;
  /**
   * Whether the user can resize rows: the row edge handle, Alt+ArrowUp/Down
   * and Alt+Shift+Enter. Changeable at runtime. Default: false
   */
  rowResize?: boolean;
  /** Called per row resized by a key or a fit. */
  onRowResized?: (event: RowResizedEvent) => void;
  /** Clamps for the fit commands and the row resize keys. Read at creation. */
  autoFit?: AutoFitOptions;
  /** Groups the resident rows; a new value regroups without recreating the core. */
  rowGrouping?: RowGrouping | null;
  /** Column showing a group's expander and label; the first displayed column when absent or hidden. */
  groupLabelColumn?: string;
  /** Renders the label of a group or total row. */
  groupLabelRenderer?: VueGroupLabelRenderer;
  /** Called per group a pointer or key gesture toggled; commands stay silent. */
  onRowGroupToggled?: (event: RowGroupToggledEvent) => void;
  /** Called when `rowGrouping` cannot apply to the bound source; the grid keeps the source's rows. */
  onRowGroupingRejected?: (rejection: RowGroupingRejection) => void;
  /** Override any user-visible grid label. Unspecified labels fall back to English defaults. */
  labels?: GridLabelOverrides;
  cellRenderers?: Record<string, VueCellRenderer<TData>>;
  editRenderers?: Record<string, VueEditRenderer<TData>>;
  /** Header renderer registry, keyed by a column's or a group's `headerRenderer`. */
  headerRenderers?: VueHeaderRendererRegistry;
  cellRenderer?: VueCellRenderer<TData>;
  editRenderer?: VueEditRenderer<TData>;
  headerRenderer?: VueHeaderRenderer;
}

export interface UseGpGridResult<TData = unknown> {
  // Refs
  /**
   * Scroll container and measurement root of the fit commands: render
   * `data-layout-revision` from `state.columnWindow.layout.revision` on it,
   * or every fit is `"stale"`.
   */
  containerRef: Ref<HTMLDivElement | null>;
  coreRef: ShallowRef<GridCore<TData> | null>;

  // State
  state: ShallowRef<GridState>;
  /** Bumped once per core batch; cells read it so core-backed content updates. */
  renderToken: ShallowRef<number>;
  /** Mounted slots: size each row box from `slot.height`; cells fill the row. */
  slotsArray: ComputedRef<SlotData[]>;

  // Computed
  /** Height of every header band together, from `state.headerBands`. */
  totalHeaderHeight: ComputedRef<number>;
  /** Resolved displayed-column layout published by the core. */
  layout: ComputedRef<ColumnLayoutSnapshot | null>;
  totalWidth: ComputedRef<number>;
  fillHandlePosition: ComputedRef<FillHandlePosition | null>;
  /** C3 frozen/suffix layout published by the core. */
  rowRegions: ComputedRef<RowRegionLayout>;
  /** C13 live-region content, or `null` when there is nothing to announce. */
  announcement: ComputedRef<GridAnnouncement | null>;
  /** Label column, labels and toggles of a hierarchy for `groupCellOf`; `null` while flat. */
  rowGroupCells: ComputedRef<RowGroupCellContext | null>;

  // Event handlers
  handleScroll: () => void;
  handleCellMouseDown: (rowIndex: number, colIndex: number, e: PointerEvent) => void;
  handleCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  handleFillHandleMouseDown: (e: PointerEvent) => void;
  handleHeaderClick: (colIndex: number, e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  handlePaste: (e: ClipboardEvent) => void;
  handleWheel: (e: WheelEvent, wheelDampening: number) => void;
  handleFilterApply: (colId: string, filter: ColumnFilterModel | null) => void;
  handleFilterPopupClose: () => void;
  handleCellMouseEnter: (rowIndex: number, colIndex: number) => void;
  handleCellMouseLeave: () => void;
  /** Pointer down on a group row's expander (`span.gp-grid-group-toggle`): toggles it. */
  handleGroupTogglePointerDown: (rowIndex: number, e: PointerEvent) => void;

  // Drag state
  dragState: Ref<DragState>;

  // Helpers
  isCellSelected: typeof isCellSelected;
  isCellActive: typeof isCellActive;
  isCellEditing: typeof isCellEditing;
  isCellInFillPreview: typeof isCellInFillPreview;
  buildCellClasses: typeof buildCellClasses;
}

// =============================================================================
// Composable
// =============================================================================

/**
 * Nuxt-friendly composable for using gp-grid.
 * Returns all the pieces needed to build a custom grid component.
 */
export function useGpGrid<TData = unknown>(
  options: UseGpGridOptions<TData>,
): UseGpGridResult<TData> {
  // Refs
  const containerRef = ref<HTMLDivElement | null>(null);
  const coreRef = shallowRef<GridCore<TData> | null>(null);
  /** Inline direction, resampled on mount and on every container resize. */
  const rtlRef = ref(false);

  // Synthetic touch scrolling for scaled grids (attached in onMounted)
  const touchScroll = new TouchScrollController<TData>({
    getCore: () => coreRef.value as GridCore<TData> | null,
    getScrollEl: () => containerRef.value,
    isBrowser: typeof window !== "undefined",
  });

  // Seeded so the pre-mount/SSR render shows the definition layout before the
  // core publishes its first resolved snapshot.
  const pendingScroll = new PendingScrollLatch();
  const { state, renderToken, applyInstructions } = useGridState({
    initialColumns: options.columns,
    initialColumnLayout: options.columnLayout ?? "fit",
    initialHeaderHeight: options.headerHeight ?? options.rowHeight,
    initialHeaderBandHeights: options.headerBandHeights,
    initialColumnGroups: options.columnGroups,
  });

  // Computed values
  const totalHeaderHeight = computed(() => state.value.headerBands.totalHeight);

  const layout = computed(() => state.value.layout);
  const totalWidth = computed(() => state.value.contentWidth);
  const slotsArray = computed(() => Array.from(state.value.slots.values()));
  const rowRegions = computed(() => state.value.rowRegions);
  const announcement = computed(() => state.value.announcement);
  const resolvedLabels = computed(() => resolveGridLabels(options.labels));

  const rowGroupCells = useRowGroupCellContext(coreRef, {
    hierarchical: () => state.value.hierarchical,
    layout: () => layout.value,
    columns: () => state.value.columns,
    labels: () => resolvedLabels.value,
    groupLabelColumn: () => options.groupLabelColumn,
    groupLabelRenderer: () => options.groupLabelRenderer,
  });

  // Input handling
  const {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderClick,
    handleKeyDown,
    handlePaste,
    handleWheel,
    dragState,
  } = useInputHandler<TData>(
    coreRef,
    containerRef,
    computed(() => options.columns),
    {
      activeCell: computed(() => state.value.activeCell),
      selectionRange: computed(() => state.value.selectionRange),
      editingCell: computed(() => state.value.editingCell),
      filterPopupOpen: computed(() => state.value.filterPopup?.isOpen ?? false),
      onBeforeProgrammaticScroll: () => touchScroll.stop(),
      scrollByWheel: (domDy) => touchScroll.scrollByWheel(domDy),
    },
  );

  // Handle scroll
  const handleScroll = (): void => {
    const container = containerRef.value;
    const core = coreRef.value;
    if (!container || !core) return;

    core.setViewport(
      container.scrollTop,
      toInlineX(container.scrollLeft, rtlRef.value),
      container.clientWidth,
      container.clientHeight,
    );
  };

  // Handle filter apply
  const handleFilterApply = (colId: string, filter: ColumnFilterModel | null): void => {
    const core = coreRef.value;
    if (core) {
      core.sortFilter.setFilter(colId, filter);
    }
  };

  // Handle filter popup close
  const handleFilterPopupClose = (): void => {
    const core = coreRef.value;
    if (core) {
      core.sortFilter.closeFilterPopup();
    }
  };

  // Handle cell mouse enter (for hover highlighting)
  const handleCellMouseEnter = (rowIndex: number, colIndex: number): void => {
    coreRef.value?.input.handleCellMouseEnter(rowIndex, colIndex);
  };

  // Handle cell mouse leave (for hover highlighting)
  const handleCellMouseLeave = (): void => {
    coreRef.value?.input.handleCellMouseLeave();
  };

  // Initialize GridCore
  onMounted(() => {
    const dataSource = options.dataSource ??
      (options.rowData
        ? createDataSourceFromArray(options.rowData)
        : createClientDataSource<TData>([]));

    const core = new GridCore<TData>({
      columns: options.columns,
      columnGroups: options.columnGroups,
      columnGroupLimits: options.columnGroupLimits,
      onColumnSchemaRejected: (error) => options.onColumnSchemaRejected?.(error),
      dataSource,
      rowHeight: options.rowHeight,
      headerHeight: options.headerHeight ?? options.rowHeight,
      headerBandHeights: options.headerBandHeights,
      overscan: options.overscan ?? 3,
      columnOverscan: options.columnOverscan,
      columnLayout: options.columnLayout ?? "fit",
      maxFlingVelocity: options.maxFlingVelocity,
      rowLoading: options.rowLoading,
      freezeRows: options.freezeRows,
      rowResize: options.rowResize,
      autoFit: options.autoFit,
      // Created on mount only, so a server render never builds a host.
      measurementHost: createDomMeasurementHost(() => containerRef.value),
      sortingEnabled: options.sortingEnabled ?? true,
      highlighting: options.highlighting,
      getRowId: options.getRowId,
      onCellValueChanged: options.onCellValueChanged
        ? (event) => options.onCellValueChanged?.(event)
        : undefined,
      onColumnPinned: (event) => options.onColumnPinned?.(event),
      onRowResized: (event) => options.onRowResized?.(event),
      onFrozenRowsChanged: (state) => options.onFrozenRowsChanged?.(state),
      labels: options.labels,
      rowGrouping: options.rowGrouping,
      onRowGroupToggled: (event) => options.onRowGroupToggled?.(event),
      onRowGroupingRejected: (rejection) => options.onRowGroupingRejected?.(rejection),
    });

    coreRef.value = core;
    touchScroll.syncCore();

    // Subscribe to batched instructions
    pendingScroll.clear();
    const unsubscribe = core.onBatchInstruction((instructions) => {
      pendingScroll.collect(instructions);
      applyInstructions(instructions);
    });

    // Initialize
    core.initialize();

    // Synthetic touch scrolling: when scroll virtualization compresses the
    // DOM scroll space, the controller takes over touch gestures so content
    // tracks the finger 1:1 with a consistent fling. Inert otherwise.
    touchScroll.attach();
    onUnmounted(() => touchScroll.detach());

    // Initial measurement
    const container = containerRef.value;
    if (container) {
      rtlRef.value = readIsRtl(container);
      core.setViewport(
        container.scrollTop,
        toInlineX(container.scrollLeft, rtlRef.value),
        container.clientWidth,
        container.clientHeight,
      );

      // Resize observer
      const resizeObserver = new ResizeObserver(() => {
        rtlRef.value = readIsRtl(container);
        core.setViewport(
          container.scrollTop,
          toInlineX(container.scrollLeft, rtlRef.value),
          container.clientWidth,
          container.clientHeight,
        );
      });
      resizeObserver.observe(container);

      onUnmounted(() => resizeObserver.disconnect());
    }

    onUnmounted(() => {
      unsubscribe();
      core.destroy();
      coreRef.value = null;
      // A provided source belongs to the caller; only the one built from `rowData` is ours.
      if (dataSource !== options.dataSource) dataSource.destroy?.();
    });
  });

  // Apply programmatic scroll from SCROLL_TO. flush: 'post' ensures the DOM
  // has been updated before the scroll positions are written.
  watch(
    renderToken,
    () => {
      const pending = pendingScroll.take();
      const container = containerRef.value;
      if (pending === null || container === null) return;
      touchScroll.stop();
      if (pending.top !== null) container.scrollTop = pending.top;
      if (pending.left !== null) container.scrollLeft = toPhysicalX(pending.left, rtlRef.value);
    },
    { flush: "post" },
  );

  // Subscribe to data source changes
  watch(
    () => options.dataSource,
    (dataSource, _previous, onCleanup) => {
      if (dataSource !== undefined && isMutableDataSource(dataSource)) {
        const unsubscribe = dataSource.subscribe(() => {
          coreRef.value?.refreshFromTransaction();
        });
        onCleanup(unsubscribe);
      }
    },
    { immediate: true },
  );

  // Switch layout mode without recreating the core.
  watch(
    () => options.columnLayout,
    (mode) => {
      coreRef.value?.columns.setLayout(mode ?? "fit");
    },
  );

  // Apply a new freeze configuration without recreating the core; the setter is
  // silent for an equal request, and creation already received the option.
  watch(
    () => options.freezeRows,
    (config) => {
      coreRef.value?.frozenRows.set(config);
    },
  );

  watch(
    () => options.rowResize,
    (enabled) => {
      coreRef.value?.rowHeights.setResizable(enabled ?? false);
    },
  );

  useRowGroupingSync(coreRef, () => options.rowGrouping);

  useColumnSchemaSync(coreRef, {
    columns: () => options.columns,
    columnGroups: () => options.columnGroups,
    headerBandHeights: () => options.headerBandHeights,
  });

  // Watch for highlighting option changes
  watch(
    () => options.highlighting,
    (highlighting) => {
      if (coreRef.value?.highlight && highlighting) {
        coreRef.value.highlight.updateOptions(highlighting);
      }
    },
  );

  // Fill handle position, resolved by core geometry in rows-wrapper space.
  const { fillHandlePosition } = useFillHandle({
    coreRef,
    activeCell: computed(() => state.value.activeCell),
    selectionRange: computed(() => state.value.selectionRange),
    slots: computed(() => state.value.slots),
    geometryRevision: computed(() => state.value.geometryRevision),
  });

  return {
    // Refs
    containerRef,
    coreRef,

    // State
    state,
    renderToken,
    slotsArray,

    // Computed
    totalHeaderHeight,
    layout,
    totalWidth,
    fillHandlePosition,
    rowRegions,
    announcement,
    rowGroupCells,

    // Event handlers
    handleScroll,
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderClick,
    handleKeyDown,
    handlePaste,
    handleWheel,
    handleFilterApply,
    handleFilterPopupClose,
    handleCellMouseEnter,
    handleCellMouseLeave,
    handleGroupTogglePointerDown: createGroupTogglePointerDown(coreRef),

    // Drag state
    dragState,

    // Helpers (re-exported for convenience)
    isCellSelected,
    isCellActive,
    isCellEditing,
    isCellInFillPreview,
    buildCellClasses,
  };
}
