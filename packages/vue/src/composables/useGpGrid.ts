// packages/vue/src/composables/useGpGrid.ts

import { ref, computed, onMounted, onUnmounted, watch, type Ref, type ComputedRef } from "vue";
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
} from "gp-grid-core";
import type {
  Row,
  ColumnDefinition,
  ColumnFilterModel,
  DataSource,
  GridState,
  SlotData,
} from "gp-grid-core";
import { useGridState } from "../gridState";
import { useInputHandler } from "./useInputHandler";
import { useFillHandle } from "./useFillHandle";
import type { VueCellRenderer, VueEditRenderer, VueHeaderRenderer } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface UseGpGridOptions<TData extends Row = Row> {
  columns: ColumnDefinition[];
  dataSource?: DataSource<TData>;
  rowData?: TData[];
  rowHeight: number;
  headerHeight?: number;
  overscan?: number;
  sortingEnabled?: boolean;
  darkMode?: boolean;
  wheelDampening?: number;
  cellRenderers?: Record<string, VueCellRenderer<TData>>;
  editRenderers?: Record<string, VueEditRenderer<TData>>;
  headerRenderers?: Record<string, VueHeaderRenderer>;
  cellRenderer?: VueCellRenderer<TData>;
  editRenderer?: VueEditRenderer<TData>;
  headerRenderer?: VueHeaderRenderer;
}

export interface UseGpGridResult<TData extends Row = Row> {
  // Refs
  containerRef: Ref<HTMLDivElement | null>;
  coreRef: Ref<GridCore<TData> | null>;

  // State
  state: GridState;
  slotsArray: ComputedRef<SlotData[]>;

  // Computed
  totalHeaderHeight: ComputedRef<number>;
  columnPositions: ComputedRef<number[]>;
  columnWidths: ComputedRef<number[]>;
  totalWidth: ComputedRef<number>;
  fillHandlePosition: ComputedRef<{ top: number; left: number } | null>;

  // Event handlers
  handleScroll: () => void;
  handleCellMouseDown: (rowIndex: number, colIndex: number, e: MouseEvent) => void;
  handleCellDoubleClick: (rowIndex: number, colIndex: number) => void;
  handleFillHandleMouseDown: (e: MouseEvent) => void;
  handleHeaderClick: (colIndex: number, e: MouseEvent) => void;
  handleKeyDown: (e: KeyboardEvent) => void;
  handleWheel: (e: WheelEvent, wheelDampening: number) => void;
  handleFilterApply: (colId: string, filter: ColumnFilterModel | null) => void;
  handleFilterPopupClose: () => void;

  // Drag state
  dragState: Ref<{
    isDragging: boolean;
    dragType: "selection" | "fill" | null;
    fillSourceRange: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
    fillTarget: { row: number; col: number } | null;
  }>;

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
export function useGpGrid<TData extends Row = Row>(
  options: UseGpGridOptions<TData>,
): UseGpGridResult<TData> {
  // Inject styles on first use
  injectStyles();

  // Refs
  const containerRef = ref<HTMLDivElement | null>(null);
  const coreRef = ref<GridCore<TData> | null>(null);

  // State
  const { state, applyInstructions } = useGridState();

  // Computed values
  const totalHeaderHeight = computed(() => options.headerHeight ?? options.rowHeight);
  const scaledColumns = computed(() =>
    calculateScaledColumnPositions(options.columns, state.viewportWidth),
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
  } = useInputHandler<TData>(
    coreRef as Ref<GridCore<TData> | null>,
    containerRef,
    computed(() => options.columns),
    {
      activeCell: computed(() => state.activeCell),
      selectionRange: computed(() => state.selectionRange),
      editingCell: computed(() => state.editingCell),
      filterPopupOpen: computed(() => state.filterPopup?.isOpen ?? false),
      rowHeight: options.rowHeight,
      headerHeight: totalHeaderHeight.value,
      columnPositions,
      slots: computed(() => state.slots),
    },
  );

  // Handle scroll
  const handleScroll = (): void => {
    const container = containerRef.value;
    const core = coreRef.value;
    if (!container || !core) return;

    core.setViewport(
      container.scrollTop,
      container.scrollLeft,
      container.clientWidth,
      container.clientHeight,
    );
  };

  // Handle filter apply
  const handleFilterApply = (colId: string, filter: ColumnFilterModel | null): void => {
    const core = coreRef.value;
    if (core) {
      core.setFilter(colId, filter);
    }
  };

  // Handle filter popup close
  const handleFilterPopupClose = (): void => {
    const core = coreRef.value;
    if (core) {
      core.closeFilterPopup();
    }
  };

  // Initialize GridCore
  onMounted(() => {
    const dataSource = options.dataSource ??
      (options.rowData
        ? createDataSourceFromArray(options.rowData)
        : createClientDataSource<TData>([]));

    const core = new GridCore<TData>({
      columns: options.columns,
      dataSource,
      rowHeight: options.rowHeight,
      headerHeight: totalHeaderHeight.value,
      overscan: options.overscan ?? 3,
      sortingEnabled: options.sortingEnabled ?? true,
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
    () => options.dataSource,
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

  // Calculate fill handle position using composable
  const { fillHandlePosition } = useFillHandle({
    activeCell: computed(() => state.activeCell),
    selectionRange: computed(() => state.selectionRange),
    slots: computed(() => state.slots),
    columns: computed(() => options.columns),
    columnPositions,
    columnWidths,
    rowHeight: options.rowHeight,
  });

  return {
    // Refs
    containerRef,
    coreRef: coreRef as Ref<GridCore<TData> | null>,

    // State
    state,
    slotsArray,

    // Computed
    totalHeaderHeight,
    columnPositions,
    columnWidths,
    totalWidth,
    fillHandlePosition,

    // Event handlers
    handleScroll,
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderClick,
    handleKeyDown,
    handleWheel,
    handleFilterApply,
    handleFilterPopupClose,

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
