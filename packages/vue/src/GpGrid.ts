// packages/vue/src/GpGrid.ts

import {
  defineComponent,
  ref,
  shallowRef,
  computed,
  onMounted,
  onUnmounted,
  watch,
  h,
  type PropType,
  type VNode,
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
import { renderCell } from "./renderers/cellRenderer";
import { renderEditCell } from "./renderers/editRenderer";
import { renderHeader } from "./renderers/headerRenderer";
import type { VueCellRenderer, VueEditRenderer, VueHeaderRenderer } from "./types";
import { FilterPopup } from "./components/FilterPopup";

export const GpGrid = defineComponent({
  name: "GpGrid",

  props: {
    columns: {
      type: Array as PropType<ColumnDefinition[]>,
      required: true,
    },
    dataSource: {
      type: Object as PropType<DataSource<Row>>,
      default: undefined,
    },
    rowData: {
      type: Array as PropType<Row[]>,
      default: undefined,
    },
    rowHeight: {
      type: Number,
      required: true,
    },
    headerHeight: {
      type: Number,
      default: undefined,
    },
    overscan: {
      type: Number,
      default: 3,
    },
    sortingEnabled: {
      type: Boolean,
      default: true,
    },
    darkMode: {
      type: Boolean,
      default: false,
    },
    wheelDampening: {
      type: Number,
      default: 0.1,
    },
    cellRenderers: {
      type: Object as PropType<Record<string, VueCellRenderer>>,
      default: () => ({}),
    },
    editRenderers: {
      type: Object as PropType<Record<string, VueEditRenderer>>,
      default: () => ({}),
    },
    headerRenderers: {
      type: Object as PropType<Record<string, VueHeaderRenderer>>,
      default: () => ({}),
    },
    cellRenderer: {
      type: Function as PropType<VueCellRenderer>,
      default: undefined,
    },
    editRenderer: {
      type: Function as PropType<VueEditRenderer>,
      default: undefined,
    },
    headerRenderer: {
      type: Function as PropType<VueHeaderRenderer>,
      default: undefined,
    },
  },

  setup(props) {
    // Inject styles on first render
    injectStyles();

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
      const dataSource = props.dataSource ??
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
        const column = props.columns[c];
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
      const cellWidth = props.columns[col]?.width ?? 0;

      return {
        top: cellTop + props.rowHeight - 5,
        left: cellLeft + cellWidth - 20,
      };
    });

    return {
      containerRef,
      coreRef,
      state,
      totalHeaderHeight,
      columnPositions,
      totalWidth,
      slotsArray,
      handleCellMouseDown,
      handleCellDoubleClick,
      handleFillHandleMouseDown,
      handleHeaderClick,
      handleKeyDown,
      handleWheel,
      handleScroll,
      handleFilterApply,
      handleFilterPopupClose,
      dragState,
      fillHandlePosition,
    };
  },

  render() {
    const {
      columns,
      rowHeight,
      darkMode,
      wheelDampening,
      cellRenderers,
      editRenderers,
      headerRenderers,
      cellRenderer,
      editRenderer,
      headerRenderer,
    } = this.$props;

    // Access setup return values - Vue auto-unwraps refs/computed in render()
    // Use explicit typing for TypeScript
    const core = this.coreRef as GridCore | null;
    const container = this.containerRef as HTMLDivElement | null;
    const state = this.state as ReturnType<typeof useGridState>["state"];
    const totalHeaderHeight = this.totalHeaderHeight as number;
    const columnPositions = this.columnPositions as number[];
    const totalWidth = this.totalWidth as number;
    const slotsArray = this.slotsArray as Array<{ slotId: string; rowIndex: number; rowData: Row; translateY: number }>;
    const handleCellMouseDown = this.handleCellMouseDown as (rowIndex: number, colIndex: number, e: MouseEvent) => void;
    const handleCellDoubleClick = this.handleCellDoubleClick as (rowIndex: number, colIndex: number) => void;
    const handleFillHandleMouseDown = this.handleFillHandleMouseDown as (e: MouseEvent) => void;
    const handleHeaderClick = this.handleHeaderClick as (colIndex: number, e: MouseEvent) => void;
    const handleKeyDown = this.handleKeyDown as (e: KeyboardEvent) => void;
    const handleWheel = this.handleWheel as (e: WheelEvent, wheelDampening: number) => void;
    const handleScroll = this.handleScroll as () => void;
    // Note: Vue auto-unwraps refs, so dragState is already the unwrapped DragState object
    const dragState = this.dragState as { isDragging: boolean; dragType: string | null; fillSourceRange: CellRange | null; fillTarget: { row: number; col: number } | null };
    const fillHandlePosition = this.fillHandlePosition as { top: number; left: number } | null;

    // Build header cells
    const headerCells = columns.map((column, colIndex) => {
      const headerInfo = state.headers.get(colIndex);
      return h(
        "div",
        {
          key: column.colId ?? column.field,
          class: "gp-grid-header-cell",
          "data-col-index": colIndex,
          style: {
            position: "absolute",
            left: `${columnPositions[colIndex]}px`,
            top: 0,
            width: `${column.width}px`,
            height: `${totalHeaderHeight}px`,
            background: "transparent",
          },
          onClick: (e: MouseEvent) => handleHeaderClick(colIndex, e),
        },
        [
          renderHeader({
            column,
            colIndex,
            sortDirection: headerInfo?.sortDirection,
            sortIndex: headerInfo?.sortIndex,
            sortable: headerInfo?.sortable ?? true,
            filterable: headerInfo?.filterable ?? true,
            hasFilter: headerInfo?.hasFilter ?? false,
            core,
            container,
            headerRenderers: headerRenderers ?? {},
            globalHeaderRenderer: headerRenderer,
          }),
        ],
      );
    });

    // Build row slots
    const rowSlots = slotsArray
      .filter((slot) => slot.rowIndex >= 0)
      .map((slot) => {
        const isEvenRow = slot.rowIndex % 2 === 0;

        const cells = columns.map((column, colIndex) => {
          const isEditing = isCellEditing(slot.rowIndex, colIndex, state.editingCell);
          const active = isCellActive(slot.rowIndex, colIndex, state.activeCell);
          const selected = isCellSelected(slot.rowIndex, colIndex, state.selectionRange);
          const inFillPreview = isCellInFillPreview(
            slot.rowIndex,
            colIndex,
            dragState.dragType === "fill",
            dragState.fillSourceRange,
            dragState.fillTarget,
          );

          const cellClasses = buildCellClasses(active, selected, isEditing, inFillPreview);

          let cellContent: VNode | string;
          if (isEditing && state.editingCell) {
            cellContent = renderEditCell({
              column,
              rowData: slot.rowData,
              rowIndex: slot.rowIndex,
              colIndex,
              initialValue: state.editingCell.initialValue,
              core,
              editRenderers: editRenderers ?? {},
              globalEditRenderer: editRenderer,
            }) ?? "";
          } else {
            cellContent = renderCell({
              column,
              rowData: slot.rowData,
              rowIndex: slot.rowIndex,
              colIndex,
              isActive: active,
              isSelected: selected,
              isEditing,
              cellRenderers: cellRenderers ?? {},
              globalCellRenderer: cellRenderer,
            });
          }

          return h(
            "div",
            {
              key: `${slot.slotId}-${colIndex}`,
              class: cellClasses,
              style: {
                position: "absolute",
                left: `${columnPositions[colIndex]}px`,
                top: 0,
                width: `${column.width}px`,
                height: `${rowHeight}px`,
              },
              onMousedown: (e: MouseEvent) => handleCellMouseDown(slot.rowIndex, colIndex, e),
              onDblclick: () => handleCellDoubleClick(slot.rowIndex, colIndex),
            },
            [cellContent],
          );
        });

        return h(
          "div",
          {
            key: slot.slotId,
            class: `gp-grid-row${isEvenRow ? " gp-grid-row--even" : ""}`,
            style: {
              position: "absolute",
              top: 0,
              left: 0,
              transform: `translateY(${slot.translateY}px)`,
              width: `${Math.max(state.contentWidth, totalWidth)}px`,
              height: `${rowHeight}px`,
            },
          },
          cells,
        );
      });

    // Build content
    const contentChildren: VNode[] = [
      // Headers
      h(
        "div",
        {
          class: "gp-grid-header",
          style: {
            position: "sticky",
            top: 0,
            left: 0,
            height: `${totalHeaderHeight}px`,
            width: `${Math.max(state.contentWidth, totalWidth)}px`,
            minWidth: "100%",
            zIndex: 100,
          },
        },
        headerCells,
      ),
      // Row slots
      ...rowSlots,
    ];

    // Fill handle
    if (fillHandlePosition && !state.editingCell) {
      contentChildren.push(
        h("div", {
          class: "gp-grid-fill-handle",
          style: {
            position: "absolute",
            top: `${fillHandlePosition.top}px`,
            left: `${fillHandlePosition.left}px`,
            zIndex: 200,
          },
          onMousedown: handleFillHandleMouseDown,
        }),
      );
    }

    // Loading indicator
    if (state.isLoading) {
      contentChildren.push(
        h("div", { class: "gp-grid-loading" }, [
          h("div", { class: "gp-grid-loading-spinner" }),
          "Loading...",
        ]),
      );
    }

    // Error message
    if (state.error) {
      contentChildren.push(h("div", { class: "gp-grid-error" }, `Error: ${state.error}`));
    }

    // Empty state
    if (!state.isLoading && !state.error && state.totalRows === 0) {
      contentChildren.push(h("div", { class: "gp-grid-empty" }, "No data to display"));
    }

    // Main container
    return h(
      "div",
      {
        ref: "containerRef",
        class: `gp-grid-container${darkMode ? " gp-grid-container--dark" : ""}`,
        style: {
          width: "100%",
          height: "100%",
          overflow: "auto",
          position: "relative",
        },
        tabindex: 0,
        onScroll: handleScroll,
        onWheel: (e: WheelEvent) => handleWheel(e, wheelDampening),
        onKeydown: handleKeyDown,
      },
      [
        // Content sizer
        h(
          "div",
          {
            style: {
              width: `${Math.max(state.contentWidth, totalWidth)}px`,
              height: `${Math.max(state.contentHeight, totalHeaderHeight)}px`,
              position: "relative",
              minWidth: "100%",
            },
          },
          contentChildren,
        ),
        // Filter Popup
        state.filterPopup?.isOpen && state.filterPopup.column && state.filterPopup.anchorRect
          ? h(FilterPopup, {
              column: state.filterPopup.column,
              colIndex: state.filterPopup.colIndex,
              anchorRect: state.filterPopup.anchorRect,
              distinctValues: state.filterPopup.distinctValues,
              currentFilter: state.filterPopup.currentFilter,
              onApply: (colId: string, filter: unknown) => {
                if (core) {
                  core.setFilter(colId, filter as import("gp-grid-core").ColumnFilterModel | null);
                }
              },
              onClose: () => {
                if (core) {
                  core.closeFilterPopup();
                }
              },
            })
          : null,
      ],
    );
  },
});

export default GpGrid;
