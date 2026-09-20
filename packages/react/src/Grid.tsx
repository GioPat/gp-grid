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
  calculateFillHandlePosition,
  TouchScrollController,
  resolveGridLabels,
} from "@gp-grid/core";
import type { ColumnFilterModel, DataSource, GridLabels } from "@gp-grid/core";
import { CellPeek, FilterPopup, GridHeader, GridBody } from "./components";
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
export function Grid<TData = unknown>(
  props: GridProps<TData>,
): React.ReactNode {
  const {
    columns,
    columnState,
    dataSource: providedDataSource,
    rowData,
    rowHeight,
    headerHeight = rowHeight,
    overscan = 3,
    columnLayout = "fit",
    rowLoading,
    sortingEnabled = true,
    darkMode = false,
    wheelDampening = 0.1,
    maxFlingVelocity,
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
    onWriteRejected,
    loadingComponent,
    rowDragEntireRow = false,
    onRowDragEnd,
    onColumnResized,
    onColumnMoved,
    labels,
  } = props;

  const resolvedLabels = useMemo<GridLabels>(
    () => resolveGridLabels(labels),
    [labels],
  );

  const outerContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<GridCore<TData> | null>(null);
  const touchScrollRef = useRef<TouchScrollController<TData> | null>(null);
  const prevDataSourceRef = useRef<DataSource<TData> | null>(null);
  const hasInitializedRef = useRef(false);
  const [state, dispatch] = useReducer(
    gridReducer,
    {
      initialWidth,
      initialHeight,
      initialColumns: columns,
      initialColumnLayout: columnLayout,
    },
    createInitialState,
  ) as [GridState<TData>, React.Dispatch<GridAction>];

  // Computed heights
  const totalHeaderHeight = headerHeight;

  const stopTouchScroll = useCallback(() => {
    touchScrollRef.current?.stop();
  }, []);

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
  const appliedColumnsRef = useRef(columns);
  const columnStateRef = useRef(columnState);
  columnStateRef.current = columnState;
  const onWriteRejectedRef = useRef(onWriteRejected);
  onWriteRejectedRef.current = onWriteRejected;
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

  // Effective columns come from the core's resolved layout only; the columns
  // prop is schema input and is never rendered directly after mount.
  const effectiveColumns = state.columns;

  // Displayed geometry: the core resolves offsets/widths and publishes them.
  const layoutColumns = state.layout?.columns ?? [];
  const totalWidth = state.contentWidth;

  // Unified input handling (replaces useFillDrag, useSelectionDrag, useKeyboardNavigation)
  const {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderMouseDown,
    handleHeaderResizeMouseDown,
    handleKeyDown,
    handlePaste,
    handleWheel,
    dragState,
  } = useInputHandler(coreRef, containerRef, effectiveColumns, {
    activeCell: state.activeCell,
    selectionRange: state.selectionRange,
    editingCell: state.editingCell,
    filterPopupOpen: state.filterPopup?.isOpen ?? false,
    onBeforeProgrammaticScroll: stopTouchScroll,
  });

  // Initialize GridCore
  useEffect(() => {
    // Reset state on re-initialization to clear stale slots from previous core
    // Skip on first initialization (nothing to reset)
    if (hasInitializedRef.current) {
      dispatch({ type: "RESET", columns, columnLayout });
    }
    hasInitializedRef.current = true;

    appliedColumnsRef.current = columns;
    const core = new GridCore<TData>({
      columns,
      dataSource: dataSourceRef.current,
      rowHeight,
      headerHeight: totalHeaderHeight,
      overscan,
      columnLayout,
      maxFlingVelocity,
      rowLoading,
      sortingEnabled,
      highlighting: highlightingRef.current,
      getRowId: getRowIdRef.current,
      onCellValueChanged: onCellValueChangedRef.current
        ? (event) => onCellValueChangedRef.current?.(event)
        : undefined,
      onWriteRejected: (event) => onWriteRejectedRef.current?.(event),
      rowDragEntireRow,
      onRowDragEnd: (event) => onRowDragEndRef.current?.(event),
      onColumnResized: (event) => onColumnResizedRef.current?.(event),
      onColumnMoved: (event) => onColumnMovedRef.current?.(event),
    });

    // A recreated core starts from definition defaults; re-apply controlled state.
    if (columnStateRef.current) core.setColumnState(columnStateRef.current);
    coreRef.current = core;
    touchScrollRef.current?.syncCore();

    // Expose core via gridRef prop. React treats a `{ current }` object by
    // identity, so updating the payload would detach the ref; mutate the
    // existing handle instead.
    if (gridRef) {
      if (gridRef.current) {
        gridRef.current.core = core;
      } else {
        gridRef.current = { core };
      }
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
    rowHeight,
    totalHeaderHeight,
    overscan,
    maxFlingVelocity,
    rowLoading,
    sortingEnabled,
    gridRef,
    rowDragEntireRow,
  ]);

  // Push a new `columns` prop into the core without recreating it. The core
  // reconciles by ColumnId and keeps retained user state, sort, filter and scroll.
  useEffect(() => {
    if (appliedColumnsRef.current === columns) return;
    appliedColumnsRef.current = columns;
    coreRef.current?.setColumns(columns);
  }, [columns]);

  // Apply a controlled column-state input whenever it changes.
  useEffect(() => {
    if (columnState === undefined) return;
    coreRef.current?.setColumnState(columnState);
  }, [columnState]);

  // Switch layout mode without recreating the core; it republishes the
  // resolved layout and wrappers render the new widths.
  useEffect(() => {
    coreRef.current?.setColumnLayout(columnLayout);
  }, [columnLayout]);

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

  // Synthetic touch scrolling: when scroll virtualization compresses the DOM
  // scroll space, the controller takes over touch gestures so content tracks
  // the finger 1:1 with a consistent fling. Inert for non-scaled grids.
  useEffect(() => {
    const controller = new TouchScrollController<TData>({
      getCore: () => coreRef.current,
      getScrollEl: () => containerRef.current,
      isBrowser: typeof window !== "undefined",
    });
    touchScrollRef.current = controller;
    controller.attach();
    return () => {
      controller.detach();
      touchScrollRef.current = null;
    };
  }, []);

  // Apply programmatic scroll from SCROLL_TO instruction (e.g., after
  // filter/sort or a clamp correction). useLayoutEffect runs before paint, so
  // the container matches the core's expectation for the first frame.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (state.pendingScrollTop === null && state.pendingScrollLeft === null) return;
    touchScrollRef.current?.stop();
    if (state.pendingScrollTop !== null) container.scrollTop = state.pendingScrollTop;
    if (state.pendingScrollLeft !== null) container.scrollLeft = state.pendingScrollLeft;
  }, [state.pendingScrollTop, state.pendingScrollLeft]);

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

  // Handle peek overlay close
  const handlePeekClose = useCallback(() => {
    coreRef.current?.stopPeek();
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

  // Fill handle position, resolved by core geometry in rows space.
  const fillHandlePosition = useMemo(
    () =>
      coreRef.current
        ? calculateFillHandlePosition({
          core: coreRef.current,
          activeCell: state.activeCell,
          selectionRange: state.selectionRange,
        })
        : null,
    [
      state.activeCell,
      state.selectionRange,
      state.slots,
      state.geometryRevision,
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
      onPaste={handlePaste}
      tabIndex={0}
    >
      <GridHeader
        headerHeight={headerHeight}
        scrollLeft={scrollLeft}
        contentWidth={state.contentWidth}
        totalWidth={totalWidth}
        isLoading={state.isLoading}
        layoutColumns={layoutColumns}
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
        labels={resolvedLabels}
        slotsArray={slotsArray}
        layoutColumns={layoutColumns}
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
        state.filterPopup.column && (
          <FilterPopup
            column={state.filterPopup.column}
            colIndex={state.filterPopup.colIndex}
            containerRef={outerContainerRef}
            distinctValues={state.filterPopup.distinctValues}
            currentFilter={state.filterPopup.currentFilter}
            labels={resolvedLabels}
            onApply={handleFilterApply}
            onClose={handleFilterPopupClose}
          />
        )}

      {/* Cell Peek (read-only multi-line overlay on dblclick of non-editable cell) */}
      {state.peekCell && (() => {
        const peekCell = state.peekCell;
        const peekCore = coreRef.current;
        const peekColumn = effectiveColumns[peekCell.col];
        const peekSlot = slotsArray.find((s) => s.rowIndex === peekCell.row);
        if (!peekColumn || !peekSlot) return null;
        return (
          <CellPeek
            peekCell={peekCell}
            column={peekColumn}
            rowData={peekSlot.rowData}
            rawValue={peekCore?.getCellValue(peekCell.row, peekCell.col) ?? null}
            rowId={peekCore?.getRowId(peekCell.row)}
            getValue={(field) =>
              peekCore?.getFieldValue(peekCell.row, field) ?? null
            }
            containerRef={containerRef}
            core={peekCore}
            cellRenderers={cellRenderers}
            globalCellRenderer={cellRenderer}
            onClose={handlePeekClose}
          />
        );
      })()}

      {/* Column resize line */}
      {dragState.dragType === "column-resize" && dragState.columnResize && (
        <div
          className="gp-grid-column-resize-line"
          style={{ left: dragState.columnResize.lineX - scrollLeft }}
        />
      )}

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
                  left: cm.dropIndicatorX - scrollLeft,
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
