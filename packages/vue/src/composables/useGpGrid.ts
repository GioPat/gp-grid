// packages/vue/src/composables/useGpGrid.ts

import { ref, computed, onMounted, onUnmounted, watch, type Ref, type ComputedRef } from "vue";
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
  const columnPositions = computed(() => calculateColumnPositions(options.columns));
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

  // Calculate fill handle position
  const fillHandlePosition = computed(() => {
    const { activeCell, selectionRange, slots } = state;
    if (!activeCell && !selectionRange) return null;

    let row: number, col: number;
    let minCol: number, maxCol: number;

    if (selectionRange) {
      row = Math.max(selectionRange.startRow, selectionRange.endRow);
      col = Math.max(selectionRange.startCol, selectionRange.endCol);
      minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
      maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);
    } else if (activeCell) {
      row = activeCell.row;
      col = activeCell.col;
      minCol = col;
      maxCol = col;
    } else {
      return null;
    }

    // Check if ALL columns in the selection are editable
    for (let c = minCol; c <= maxCol; c++) {
      const column = options.columns[c];
      if (!column || column.editable !== true) {
        return null;
      }
    }

    // Find the slot for this row and use its actual translateY
    let cellTop: number | null = null;
    for (const slot of slots.values()) {
      if (slot.rowIndex === row) {
        cellTop = slot.translateY;
        break;
      }
    }

    if (cellTop === null) return null;

    const cellLeft = columnPositions.value[col] ?? 0;
    const cellWidth = options.columns[col]?.width ?? 0;

    return {
      top: cellTop + options.rowHeight - 5,
      left: cellLeft + cellWidth - 20,
    };
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
