// packages/react/src/Grid.tsx

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useReducer,
  useCallback,
  useMemo,
} from "react";
import {
  GridCore,
  createClientDataSource,
  createDataSourceFromArray,
  injectStyles,
  calculateScaledColumnPositions,
  getTotalWidth,
  calculateFillHandlePosition,
} from "@gp-grid/core";
import type { Row, ColumnFilterModel, DataSource } from "@gp-grid/core";
import { FilterPopup, GridHeader, GridBody } from "./components";
import { gridReducer, createInitialState } from "./gridState";
import type { GridState, GridAction } from "./gridState/types";
import { useInputHandler } from "./hooks/useInputHandler";
import type { GridProps } from "./types";

// Re-export types for backwards compatibility
export type {
  ReactCellRenderer,
  ReactEditRenderer,
  ReactHeaderRenderer,
  GridProps,
} from "./types";

/**
 * Grid component
 * @param props - Grid component props
 * @returns Grid React component
 */
export function Grid<TData extends Row = Row>(
  props: GridProps<TData>,
): React.ReactNode {
  // Inject styles on first render (safe to call multiple times)
  injectStyles();

  const {
    columns,
    dataSource: providedDataSource,
    rowData,
    rowHeight,
    headerHeight = rowHeight,
    overscan = 3,
    sortingEnabled = true,
    darkMode = false,
    wheelDampening = 0.1,
    cellRenderers = {},
    editRenderers = {},
    headerRenderers = {},
    cellRenderer,
    editRenderer,
    headerRenderer,
    initialWidth,
    initialHeight,
    gridRef,
    highlighting,
    getRowId,
    onCellValueChanged,
    loadingComponent,
    rowDragEntireRow = false,
    onRowDragEnd,
    onColumnResized,
    onColumnMoved,
  } = props;

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<GridCore<TData> | null>(null);
  const prevDataSourceRef = useRef<DataSource<TData> | null>(null);
  const hasInitializedRef = useRef(false);
  const [state, dispatch] = useReducer(
    gridReducer,
    { initialWidth, initialHeight },
    createInitialState,
  ) as [GridState<TData>, React.Dispatch<GridAction>];

  // Computed heights
  const totalHeaderHeight = headerHeight;

  // Create data source from rowData if not provided
  // Use a ref to cache the created data source and avoid recreating on StrictMode remounts
  const dataSourceCacheRef = useRef<{
    dataSource: DataSource<TData>;
    ownsDataSource: boolean;
    // Track the inputs that created this data source
    providedDataSource: DataSource<TData> | undefined;
    rowData: TData[] | undefined;
  } | null>(null);

  // Determine if we need to create a new data source
  const cache = dataSourceCacheRef.current;
  const needsNewDataSource = !cache ||
    cache.providedDataSource !== providedDataSource ||
    cache.rowData !== rowData;

  if (needsNewDataSource) {
    // Dev warning: rowData prop changed with large dataset
    if (cache && rowData && rowData.length > 10_000) {
      console.warn(
        `[gp-grid] rowData prop changed with ${rowData.length} rows — this triggers a full rebuild. Use useGridData() for efficient updates.`,
      );
    }

    // Cleanup previous owned data source
    if (cache?.ownsDataSource) {
      cache.dataSource.destroy?.();
    }

    // Create new data source
    if (providedDataSource) {
      dataSourceCacheRef.current = {
        dataSource: providedDataSource,
        ownsDataSource: false,
        providedDataSource,
        rowData,
      };
    } else if (rowData) {
      dataSourceCacheRef.current = {
        dataSource: createDataSourceFromArray(rowData),
        ownsDataSource: true,
        providedDataSource,
        rowData,
      };
    } else {
      dataSourceCacheRef.current = {
        dataSource: createClientDataSource<TData>([]),
        ownsDataSource: true,
        providedDataSource,
        rowData,
      };
    }
  }

  const { dataSource } = dataSourceCacheRef.current!;

  // Cleanup owned data source on unmount
  useEffect(() => {
    return () => {
      if (dataSourceCacheRef.current?.ownsDataSource) {
        dataSourceCacheRef.current.dataSource.destroy?.();
        dataSourceCacheRef.current = null;
      }
    };
  }, []);

  // Refs for callback props to avoid triggering core re-creation on identity changes
  const getRowIdRef = useRef(getRowId);
  getRowIdRef.current = getRowId;
  const onCellValueChangedRef = useRef(onCellValueChanged);
  onCellValueChangedRef.current = onCellValueChanged;
  const onRowDragEndRef = useRef(onRowDragEnd);
  onRowDragEndRef.current = onRowDragEnd;
  const onColumnResizedRef = useRef(onColumnResized);
  onColumnResizedRef.current = onColumnResized;
  const onColumnMovedRef = useRef(onColumnMoved);
  onColumnMovedRef.current = onColumnMoved;
  const highlightingRef = useRef(highlighting);
  highlightingRef.current = highlighting;

  // Ref for dataSource so initial core gets the right one without being in the dep array
  const dataSourceRef = useRef(dataSource);
  dataSourceRef.current = dataSource;

  // Effective columns: use core-updated columns (after resize/move) or fall back to props
  const effectiveColumns = state.columns ?? columns;

  // Create visible columns with original index tracking (for hidden column support)
  const visibleColumnsWithIndices = useMemo(
    () =>
      effectiveColumns
        .map((col, index) => ({ column: col, originalIndex: index }))
        .filter(({ column }) => !column.hidden),
    [effectiveColumns],
  );

  // Compute column positions (scaled to fill container when wider) - only for visible columns
  const { positions: columnPositions, widths: columnWidths } = useMemo(
    () =>
      calculateScaledColumnPositions(
        visibleColumnsWithIndices.map((v) => v.column),
        state.viewportWidth,
      ),
    [visibleColumnsWithIndices, state.viewportWidth],
  );
  const totalWidth = getTotalWidth(columnPositions);

  // Unified input handling (replaces useFillDrag, useSelectionDrag, useKeyboardNavigation)
  const {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderMouseDown,
    handleHeaderResizeMouseDown,
    handleKeyDown,
    handleWheel,
    dragState,
  } = useInputHandler(coreRef, containerRef, effectiveColumns, {
    activeCell: state.activeCell,
    selectionRange: state.selectionRange,
    editingCell: state.editingCell,
    filterPopupOpen: state.filterPopup?.isOpen ?? false,
    rowHeight,
    headerHeight: totalHeaderHeight,
    columnPositions,
    visibleColumnsWithIndices,
    slots: state.slots,
    rowsWrapperOffset: state.rowsWrapperOffset,
  });

  // Initialize GridCore
  useEffect(() => {
    // Reset state on re-initialization to clear stale slots from previous core
    // Skip on first initialization (nothing to reset)
    if (hasInitializedRef.current) {
      dispatch({ type: "RESET" });
    }
    hasInitializedRef.current = true;

    const core = new GridCore<TData>({
      columns,
      dataSource: dataSourceRef.current,
      rowHeight,
      headerHeight: totalHeaderHeight,
      overscan,
      sortingEnabled,
      highlighting: highlightingRef.current,
      getRowId: getRowIdRef.current,
      onCellValueChanged: onCellValueChangedRef.current
        ? (event) => onCellValueChangedRef.current?.(event)
        : undefined,
      rowDragEntireRow,
      onRowDragEnd: (src, tgt) => onRowDragEndRef.current?.(src, tgt),
      onColumnResized: (col, w) => onColumnResizedRef.current?.(col, w),
      onColumnMoved: (from, to) => onColumnMovedRef.current?.(from, to),
    });

    coreRef.current = core;

    // Set input handler deps immediately after creation
    // This ensures scaled column positions are used even when the core is recreated
    // (e.g., when highlighting options change)
    core.input.updateDeps({
      getHeaderHeight: () => totalHeaderHeight,
      getRowHeight: () => rowHeight,
      getColumnPositions: () => columnPositions,
      getColumnCount: () => visibleColumnsWithIndices.length,
      getOriginalColumnIndex: (visibleIndex: number) => {
        const info = visibleColumnsWithIndices[visibleIndex];
        return info ? info.originalIndex : visibleIndex;
      },
    });

    // Expose core via gridRef prop
    if (gridRef) {
      gridRef.current = { core };
    }

    // Subscribe to batched instructions for efficient state updates
    const unsubscribe = core.onBatchInstruction((instructions) => {
      dispatch({ type: "BATCH_INSTRUCTIONS", instructions });
    });

    // Initialize
    core.initialize();

    // Immediately set viewport if container is available
    // This ensures column scaling happens before first paint
    const container = containerRef.current;
    if (container) {
      core.setViewport(
        container.scrollTop,
        container.scrollLeft,
        container.clientWidth,
        container.clientHeight,
      );
    }

    return () => {
      unsubscribe();
      // Destroy core to release cached row data
      core.destroy();
      // Note: dataSource cleanup is handled separately via ownedDataSourceRef
      // to avoid issues with React StrictMode double-mounting
      coreRef.current = null;
      if (gridRef) {
        gridRef.current = null;
      }
    };
  }, [
    columns,
    rowHeight,
    totalHeaderHeight,
    overscan,
    sortingEnabled,
    gridRef,
    rowDragEntireRow,
  ]);

  // Handle reactive data source changes without re-creating core
  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    const prev = prevDataSourceRef.current;
    if (!prev || prev === dataSource) {
      prevDataSourceRef.current = dataSource;
      return;
    }
    prevDataSourceRef.current = dataSource;
    core.setDataSource(dataSource);
  }, [dataSource]);

  // Subscribe to data source changes (for MutableDataSource)
  useEffect(() => {
    const mutableDataSource = dataSource as {
      subscribe?: (listener: () => void) => () => void;
    };
    if (mutableDataSource.subscribe) {
      const unsubscribe = mutableDataSource.subscribe(() => {
        coreRef.current?.refreshFromTransaction();
      });
      return unsubscribe;
    }
  }, [dataSource]);

  // Handle reactive highlighting changes without re-creating core
  useEffect(() => {
    const core = coreRef.current;
    if (!core?.highlight || !highlighting) return;
    core.highlight.updateOptions(highlighting);
  }, [highlighting]);

  // Handle scroll - just pass DOM values to core, which emits UPDATE_VISIBLE_RANGE instruction
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    const core = coreRef.current;
    if (!container || !core) return;

    core.setViewport(
      container.scrollTop,
      container.scrollLeft,
      container.clientWidth,
      container.clientHeight,
    );
  }, []);

  // Initial measurement and resize handling
  useEffect(() => {
    const container = containerRef.current;
    const core = coreRef.current;
    if (!container || !core) return;

    // Guard for SSR - ResizeObserver not available in Node.js
    if (typeof ResizeObserver === "undefined") {
      handleScroll();
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      core.setViewport(
        container.scrollTop,
        container.scrollLeft,
        container.clientWidth,
        container.clientHeight,
      );
    });

    resizeObserver.observe(container);
    handleScroll();

    return () => resizeObserver.disconnect();
  }, [handleScroll]);

  // Attach wheel event listener with { passive: false } to allow preventDefault
  // React's onWheel uses passive listeners by default, which prevents dampening
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => {
      handleWheel(e as unknown as React.WheelEvent, wheelDampening);
    };

    container.addEventListener("wheel", wheelHandler, { passive: false });
    return () => container.removeEventListener("wheel", wheelHandler);
  }, [handleWheel, wheelDampening]);

  // Apply programmatic scroll from SCROLL_TO instruction (e.g., after filter/sort).
  // useLayoutEffect runs before paint, ensuring container.scrollTop matches
  // the core's expectation before the browser renders the frame.
  useLayoutEffect(() => {
    if (state.pendingScrollTop !== null) {
      const container = containerRef.current;
      if (container) {
        container.scrollTop = state.pendingScrollTop;
      }
    }
  }, [state.pendingScrollTop]);

  // Handle filter apply (from popup)
  const handleFilterApply = useCallback(
    (colId: string, filter: ColumnFilterModel | null) => {
      const core = coreRef.current;
      if (core) {
        core.setFilter(colId, filter);
      }
    },
    [],
  );

  // Handle filter popup close
  const handleFilterPopupClose = useCallback(() => {
    const core = coreRef.current;
    if (core) {
      core.closeFilterPopup();
    }
  }, []);

  // Handle cell mouse enter (for highlighting)
  const handleCellMouseEnter = useCallback(
    (rowIndex: number, colIndex: number) => {
      coreRef.current?.input.handleCellMouseEnter(rowIndex, colIndex);
    },
    [],
  );

  // Handle cell mouse leave (for highlighting)
  const handleCellMouseLeave = useCallback(() => {
    coreRef.current?.input.handleCellMouseLeave();
  }, []);

  // Convert slots map to array for rendering
  const slotsArray = useMemo(
    () => Array.from(state.slots.values()),
    [state.slots],
  );

  // Calculate fill handle position (only show for editable columns)
  const fillHandlePosition = useMemo(
    () =>
      calculateFillHandlePosition({
        activeCell: state.activeCell,
        selectionRange: state.selectionRange,
        slots: state.slots,
        columns: effectiveColumns,
        visibleColumnsWithIndices,
        columnPositions,
        columnWidths,
        rowHeight,
      }),
    [
      state.activeCell,
      state.selectionRange,
      state.slots,
      rowHeight,
      columnPositions,
      columnWidths,
      effectiveColumns,
      visibleColumnsWithIndices,
    ],
  );

  // Track scroll position for header sync
  const [scrollLeft, setScrollLeft] = React.useState(0);

  // Enhanced scroll handler that also syncs header
  const handleScrollWithHeaderSync = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setScrollLeft(container.scrollLeft);
    handleScroll();
  }, [handleScroll]);

  return (
    <div
      ref={outerContainerRef}
      className={`gp-grid-container${darkMode ? " gp-grid-container--dark" : ""}`}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <GridHeader
        headerHeight={headerHeight}
        scrollLeft={scrollLeft}
        contentWidth={state.contentWidth}
        totalWidth={totalWidth}
        isLoading={state.isLoading}
        visibleColumnsWithIndices={visibleColumnsWithIndices}
        columnPositions={columnPositions}
        columnWidths={columnWidths}
        headers={state.headers}
        sortingEnabled={sortingEnabled}
        onHeaderMouseDown={handleHeaderMouseDown}
        onHeaderResizeMouseDown={handleHeaderResizeMouseDown}
        coreRef={coreRef}
        outerContainerRef={outerContainerRef}
        headerRenderers={headerRenderers}
        globalHeaderRenderer={headerRenderer}
      />

      <GridBody
        ref={containerRef}
        rowHeight={rowHeight}
        totalHeaderHeight={totalHeaderHeight}
        contentWidth={state.contentWidth}
        contentHeight={state.contentHeight}
        totalWidth={totalWidth}
        rowsWrapperOffset={state.rowsWrapperOffset}
        activeCell={state.activeCell}
        selectionRange={state.selectionRange}
        editingCell={state.editingCell}
        error={state.error}
        isLoading={state.isLoading}
        totalRows={state.totalRows}
        slotsArray={slotsArray}
        visibleColumnsWithIndices={visibleColumnsWithIndices}
        columnPositions={columnPositions}
        columnWidths={columnWidths}
        fillHandlePosition={fillHandlePosition}
        dragState={dragState}
        onScroll={handleScrollWithHeaderSync}
        onCellMouseDown={handleCellMouseDown}
        onCellDoubleClick={handleCellDoubleClick}
        onCellMouseEnter={handleCellMouseEnter}
        onCellMouseLeave={handleCellMouseLeave}
        onFillHandleMouseDown={handleFillHandleMouseDown}
        coreRef={coreRef}
        cellRenderers={cellRenderers}
        editRenderers={editRenderers}
        globalCellRenderer={cellRenderer}
        globalEditRenderer={editRenderer}
      />

      {/* Loading overlay - positioned outside scrollable area to avoid Firefox sticky issues */}
      {state.isLoading && (
        <div
          style={{
            position: "absolute",
            top: headerHeight,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          <div className="gp-grid-loading-overlay" />
          {loadingComponent ? (
            React.createElement(loadingComponent, { isLoading: true })
          ) : (
            <div className="gp-grid-loading">
              <div className="gp-grid-loading-spinner" />
            </div>
          )}
        </div>
      )}

      {/* Filter Popup */}
      {state.filterPopup?.isOpen &&
        state.filterPopup.column &&
        state.filterPopup.anchorRect && (
          <FilterPopup
            column={state.filterPopup.column}
            colIndex={state.filterPopup.colIndex}
            anchorRect={state.filterPopup.anchorRect}
            distinctValues={state.filterPopup.distinctValues}
            currentFilter={state.filterPopup.currentFilter}
            onApply={handleFilterApply}
            onClose={handleFilterPopupClose}
          />
        )}

      {/* Column resize line */}
      {dragState.dragType === "column-resize" && dragState.columnResize && (() => {
        const visibleIndex = visibleColumnsWithIndices.findIndex(
          (v) => v.originalIndex === dragState.columnResize!.colIndex,
        );
        if (visibleIndex === -1) return null;
        const lineLeft = (columnPositions[visibleIndex] ?? 0) + dragState.columnResize.currentWidth;
        return (
          <div
            className="gp-grid-column-resize-line"
            style={{ left: lineLeft }}
          />
        );
      })()}

      {/* Column move ghost */}
      {dragState.dragType === "column-move" && dragState.columnMove && (() => {
        const cm = dragState.columnMove;
        const column = effectiveColumns[cm.sourceColIndex];
        const headerText = column?.headerName ?? column?.field ?? "";
        return (
          <>
            <div
              className="gp-grid-column-move-ghost"
              style={{
                left: cm.currentX - cm.ghostWidth / 2,
                top: cm.currentY - cm.ghostHeight / 2,
                width: cm.ghostWidth,
                height: cm.ghostHeight,
              }}
            >
              {headerText}
            </div>
            {cm.dropTargetIndex !== null && (
              <div
                className="gp-grid-column-drop-indicator"
                style={{
                  position: "absolute",
                  top: 0,
                  left: columnPositions[cm.dropTargetIndex] ?? 0,
                  height: headerHeight,
                }}
              />
            )}
          </>
        );
      })()}

      {/* Row drag ghost (fixed position, follows cursor) */}
      {dragState.dragType === "row-drag" && dragState.rowDrag && (
        <div
          className="gp-grid-row-drag-ghost"
          style={{
            left: dragState.rowDrag.currentX + 12,
            top: dragState.rowDrag.currentY - rowHeight / 2,
            width: Math.min(300, totalWidth),
            height: rowHeight,
          }}
        />
      )}
    </div>
  );
}
