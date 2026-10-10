// packages/react/src/Grid.tsx

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useReducer,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  GridCore,
  createClientDataSource,
  createDataSourceFromArray,
  createDomMeasurementHost,
  calculateFillHandlePosition,
  readIsRtl,
  toInlineX,
  toPhysicalX,
  TouchScrollController,
  PendingScrollLatch,
  defaultPinIcon,
  isMutableDataSource,
  resolveGridLabels,
} from "@gp-grid/core";
import type {
  ColumnFilterModel,
  DataSource,
  GridLabels,
  InitialStateArgs,
} from "@gp-grid/core";
import { CellPeek, FilterPopup, GridHeader, GridBody } from "./components";
import type { ResizeHandleActions } from "./components/ResizeHandle";
import { gridReducer, createInitialState } from "./gridState";
import type { GridState, GridAction } from "./gridState/types";
import { useInputHandler } from "./hooks/useInputHandler";
import { useRowGroupCellContext, useRowGroupingSync } from "./hooks/useRowGroups";
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
    headerBandHeights,
    columnGroups,
    columnGroupLimits,
    onColumnSchemaRejected,
    overscan = 3,
    columnLayout = "fit",
    columnOverscan,
    rowLoading,
    freezeRows,
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
    pinIcon = defaultPinIcon,
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
    onRowResized,
    onColumnMoved,
    onColumnPinned,
    onFrozenRowsChanged,
    rowResize = false,
    autoFit,
    rowGrouping,
    groupLabelColumn,
    groupLabelRenderer,
    onRowGroupToggled,
    onRowGroupingRejected,
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
  /** Inline direction, resampled on mount and on every container resize. */
  const rtlRef = useRef(false);
  const [rtl, setRtl] = useState(false);
  const prevDataSourceRef = useRef<DataSource<TData> | null>(null);
  const hasInitializedRef = useRef(false);
  const [pendingScroll] = useState(() => new PendingScrollLatch());
  // Every seed passes `initialHeaderHeight`: without it the bands seed at 0 px.
  const seed: InitialStateArgs = {
    initialColumns: columns,
    initialColumnLayout: columnLayout,
    initialHeaderHeight: headerHeight,
    initialHeaderBandHeights: headerBandHeights,
    initialColumnGroups: columnGroups,
  };
  const [state, dispatch] = useReducer(
    gridReducer,
    { ...seed, initialWidth, initialHeight },
    createInitialState,
  ) as [GridState<TData>, React.Dispatch<GridAction>];

  const totalHeaderHeight = state.headerBands.totalHeight;

  const stopTouchScroll = useCallback(() => {
    touchScrollRef.current?.stop();
  }, []);

  const scrollByWheel = useCallback(
    (domDy: number) => touchScrollRef.current?.scrollByWheel(domDy) ?? false,
    [],
  );

  /** Push the container's client box and inline-relative scroll into the core. */
  const syncViewport = useCallback((core: GridCore<TData>, container: HTMLElement): void => {
    core.setViewport(
      container.scrollTop,
      toInlineX(container.scrollLeft, rtlRef.current),
      container.clientWidth,
      container.clientHeight,
    );
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
  const appliedSchemaRef = useRef({ columns, columnGroups });
  const columnStateRef = useRef(columnState);
  columnStateRef.current = columnState;
  const onWriteRejectedRef = useRef(onWriteRejected);
  onWriteRejectedRef.current = onWriteRejected;
  const onRowDragEndRef = useRef(onRowDragEnd);
  onRowDragEndRef.current = onRowDragEnd;
  const onColumnResizedRef = useRef(onColumnResized);
  onColumnResizedRef.current = onColumnResized;
  const onRowResizedRef = useRef(onRowResized);
  onRowResizedRef.current = onRowResized;
  const onColumnMovedRef = useRef(onColumnMoved);
  onColumnMovedRef.current = onColumnMoved;
  const onColumnPinnedRef = useRef(onColumnPinned);
  onColumnPinnedRef.current = onColumnPinned;
  const onFrozenRowsChangedRef = useRef(onFrozenRowsChanged);
  onFrozenRowsChangedRef.current = onFrozenRowsChanged;
  const onColumnSchemaRejectedRef = useRef(onColumnSchemaRejected);
  onColumnSchemaRejectedRef.current = onColumnSchemaRejected;
  const highlightingRef = useRef(highlighting);
  highlightingRef.current = highlighting;
  const onRowGroupToggledRef = useRef(onRowGroupToggled);
  onRowGroupToggledRef.current = onRowGroupToggled;
  const onRowGroupingRejectedRef = useRef(onRowGroupingRejected);
  onRowGroupingRejectedRef.current = onRowGroupingRejected;
  useRowGroupingSync(coreRef, rowGrouping);

  // Ref for dataSource so initial core gets the right one without being in the dep array
  const dataSourceRef = useRef(dataSource);
  dataSourceRef.current = dataSource;

  // Effective columns come from the core's resolved layout only; the columns
  // prop is schema input and is never rendered directly after mount.
  const effectiveColumns = state.columns;

  // Displayed geometry: the core resolves offsets/widths and publishes them.
  const columnWindow = state.columnWindow;
  const displayedColumnCount = state.layout?.columns.length ?? 0;
  const totalWidth = state.contentWidth;

  // Displayed index per column id, for `aria-colindex`. Keyed on the layout, so
  // scrolling the window never rebuilds it.
  const displayedIndexOf = useMemo(() => {
    const index = new Map<string, number>();
    state.layout?.columns.forEach((column, at) => index.set(column.columnId, at));
    return (columnId: string): number => index.get(columnId) ?? 0;
  }, [state.layout]);

  // Unified input handling (replaces useFillDrag, useSelectionDrag, useKeyboardNavigation)
  const {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderMouseDown,
    handleHeaderResizeMouseDown,
    handleRowResizeMouseDown,
    handleResizeDoubleClick,
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
    scrollByWheel,
  });

  const rowGroupCells = useRowGroupCellContext(coreRef, {
    hierarchical: state.hierarchical,
    layout: state.layout,
    columns: effectiveColumns,
    labels: resolvedLabels,
    groupLabelColumn,
    groupLabelRenderer,
  });

  const resizeActions = useMemo<ResizeHandleActions>(
    () => ({
      onColumnPointerDown: handleHeaderResizeMouseDown,
      onRowPointerDown: handleRowResizeMouseDown,
      onDoubleClick: handleResizeDoubleClick,
    }),
    [handleHeaderResizeMouseDown, handleRowResizeMouseDown, handleResizeDoubleClick],
  );

  // Initialize GridCore
  useEffect(() => {
    // Reset state on re-initialization to clear stale slots from previous core
    // Skip on first initialization (nothing to reset)
    if (hasInitializedRef.current) {
      pendingScroll.clear();
      dispatch({ type: "RESET", seed });
    }
    hasInitializedRef.current = true;

    appliedSchemaRef.current = { columns, columnGroups };
    const core = new GridCore<TData>({
      columns,
      columnGroups,
      columnGroupLimits,
      onColumnSchemaRejected: (error) => onColumnSchemaRejectedRef.current?.(error),
      dataSource: dataSourceRef.current,
      rowHeight,
      headerHeight,
      headerBandHeights,
      overscan,
      columnLayout,
      columnOverscan,
      maxFlingVelocity,
      rowLoading,
      freezeRows,
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
      onRowResized: (event) => onRowResizedRef.current?.(event),
      rowResize,
      autoFit,
      measurementHost: createDomMeasurementHost(() => outerContainerRef.current),
      onColumnMoved: (event) => onColumnMovedRef.current?.(event),
      onColumnPinned: (event) => onColumnPinnedRef.current?.(event),
      onFrozenRowsChanged: (state) => onFrozenRowsChangedRef.current?.(state),
      rowGrouping,
      onRowGroupToggled: (event) => onRowGroupToggledRef.current?.(event),
      onRowGroupingRejected: (rejection) => onRowGroupingRejectedRef.current?.(rejection),
      labels,
    });

    // A recreated core starts from definition defaults; re-apply controlled state.
    if (columnStateRef.current) core.columns.setState(columnStateRef.current);
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
      pendingScroll.collect(instructions);
      dispatch({ type: "BATCH_INSTRUCTIONS", instructions });
    });

    // Initialize
    core.initialize();

    // Immediately set viewport if container is available
    // This ensures column scaling happens before first paint
    const container = containerRef.current;
    if (container) {
      const nextRtl = readIsRtl(container);
      rtlRef.current = nextRtl;
      setRtl(nextRtl);
      syncViewport(core, container);
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
    // `labels`, `autoFit` and `columnGroupLimits` are creation-only, and the
    // schema, `headerBandHeights`, `freezeRows` and `rowResize` have their own
    // runtime effects below, so none may rebuild the core and reset scroll.
  }, [
    rowHeight,
    headerHeight,
    overscan,
    columnOverscan,
    maxFlingVelocity,
    rowLoading,
    sortingEnabled,
    gridRef,
    rowDragEntireRow,
    syncViewport,
  ]);

  // Push new `columns`/`columnGroups` props into the core without recreating
  // it, together so the hierarchy is validated against the new ids. The core
  // reconciles by column id and keeps retained user state, sort, filter and scroll.
  useEffect(() => {
    const applied = appliedSchemaRef.current;
    if (applied.columns === columns && applied.columnGroups === columnGroups) return;
    appliedSchemaRef.current = { columns, columnGroups };
    coreRef.current?.columns.set(columns, columnGroups ?? null);
  }, [columns, columnGroups]);

  useEffect(() => {
    coreRef.current?.header.setBandHeights(headerBandHeights ?? []);
  }, [headerBandHeights]);

  // Apply a controlled column-state input whenever it changes.
  useEffect(() => {
    if (columnState === undefined) return;
    coreRef.current?.columns.setState(columnState);
  }, [columnState]);

  // Switch layout mode without recreating the core; it republishes the
  // resolved layout and wrappers render the new widths.
  useEffect(() => {
    coreRef.current?.columns.setLayout(columnLayout);
  }, [columnLayout]);

  // Apply a new freeze configuration without recreating the core; the setter
  // is silent for an equal request, and creation already received the option.
  useEffect(() => {
    coreRef.current?.frozenRows.set(freezeRows);
  }, [freezeRows]);

  useEffect(() => {
    coreRef.current?.rowHeights.setResizable(rowResize);
  }, [rowResize]);

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
    if (isMutableDataSource(dataSource) === false) return;
    return dataSource.subscribe(() => {
      coreRef.current?.refreshFromTransaction();
    });
  }, [dataSource]);

  // Handle reactive highlighting changes without re-creating core
  useEffect(() => {
    const core = coreRef.current;
    if (!core?.highlight || !highlighting) return;
    core.highlight.updateOptions(highlighting);
  }, [highlighting]);

  // Handle scroll - just pass the client box to core, which emits UPDATE_VISIBLE_RANGE instruction
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    const core = coreRef.current;
    if (!container || !core) return;

    syncViewport(core, container);
  }, [syncViewport]);

  // Initial measurement and resize handling
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !coreRef.current) return;

    // Guard for SSR - ResizeObserver not available in Node.js
    if (typeof ResizeObserver === "undefined") {
      handleScroll();
      return;
    }

    // A recreated core must receive the body height a band change implies.
    const resizeObserver = new ResizeObserver(() => {
      const nextRtl = readIsRtl(container);
      rtlRef.current = nextRtl;
      setRtl(nextRtl);
      touchScrollRef.current?.resetDirection();
      const core = coreRef.current;
      if (core) syncViewport(core, container);
    });

    resizeObserver.observe(container);
    handleScroll();

    return () => resizeObserver.disconnect();
  }, [handleScroll, syncViewport]);

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
    const pending = pendingScroll.take();
    const container = containerRef.current;
    if (pending === null || !container) return;
    touchScrollRef.current?.stop();
    if (pending.top !== null) container.scrollTop = pending.top;
    if (pending.left !== null) {
      container.scrollLeft = toPhysicalX(pending.left, rtlRef.current);
    }
  }, [state, pendingScroll]);

  // Handle filter apply (from popup)
  const handleFilterApply = useCallback(
    (colId: string, filter: ColumnFilterModel | null) => {
      const core = coreRef.current;
      if (core) {
        core.sortFilter.setFilter(colId, filter);
      }
    },
    [],
  );

  // Handle filter popup close
  const handleFilterPopupClose = useCallback(() => {
    const core = coreRef.current;
    if (core) {
      core.sortFilter.closeFilterPopup();
    }
  }, []);

  // Handle peek overlay close
  const handlePeekClose = useCallback(() => {
    coreRef.current?.edit.stopPeek();
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

  // Native scroll position, tracked for the header strip and the fill handle's
  // clip test: the handle hides once a pin covers its anchor.
  const [scrollLeft, setScrollLeft] = React.useState(0);

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
      scrollLeft,
    ],
  );

  // Enhanced scroll handler that also syncs header
  const handleScrollWithHeaderSync = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    // The header strip undoes the native scroll, so it takes the DOM value.
    setScrollLeft(container.scrollLeft);
    handleScroll();
  }, [handleScroll]);

  return (
    <div
      ref={outerContainerRef}
      className={`gp-grid-container${darkMode ? " gp-grid-container--dark" : ""}`}
      role={state.hierarchical ? "treegrid" : "grid"}
      aria-colcount={displayedColumnCount}
      aria-rowcount={state.totalRows + state.headerBands.count}
      data-layout-revision={columnWindow?.layout.revision}
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
        headerBands={state.headerBands}
        scrollLeft={scrollLeft}
        contentWidth={state.contentWidth}
        totalWidth={totalWidth}
        viewportWidth={state.viewportWidth}
        isLoading={state.isLoading}
        columnWindow={columnWindow}
        displayedIndexOf={displayedIndexOf}
        headers={state.headers}
        sortingEnabled={sortingEnabled}
        rtl={rtl}
        labels={resolvedLabels}
        onHeaderMouseDown={handleHeaderMouseDown}
        resizeActions={resizeActions}
        coreRef={coreRef}
        columnGroups={columnGroups}
        outerContainerRef={outerContainerRef}
        headerRenderers={headerRenderers}
        globalHeaderRenderer={headerRenderer}
        pinIcon={pinIcon}
      />

      <GridBody
        ref={containerRef}
        totalHeaderHeight={totalHeaderHeight}
        headerRowCount={state.headerBands.count}
        contentWidth={state.contentWidth}
        contentHeight={state.contentHeight}
        totalWidth={totalWidth}
        rowsWrapperOffset={state.rowsWrapperOffset}
        rowRegions={state.rowRegions}
        activeCell={state.activeCell}
        selectionRange={state.selectionRange}
        editingCell={state.editingCell}
        error={state.error}
        isLoading={state.isLoading}
        totalRows={state.totalRows}
        labels={resolvedLabels}
        slotsArray={slotsArray}
        columnWindow={columnWindow}
        displayedIndexOf={displayedIndexOf}
        fillHandlePosition={fillHandlePosition}
        dragState={dragState}
        onScroll={handleScrollWithHeaderSync}
        onCellMouseDown={handleCellMouseDown}
        onCellDoubleClick={handleCellDoubleClick}
        onCellMouseEnter={handleCellMouseEnter}
        onCellMouseLeave={handleCellMouseLeave}
        onFillHandleMouseDown={handleFillHandleMouseDown}
        resizeActions={resizeActions}
        rowResize={rowResize}
        coreRef={coreRef}
        cellRenderers={cellRenderers}
        editRenderers={editRenderers}
        globalCellRenderer={cellRenderer}
        globalEditRenderer={editRenderer}
        rowGroups={rowGroupCells}
      />

      {/* C13 live region: the revision key remounts it so each message is read once. */}
      {state.announcement !== null && (
        <div
          key={state.announcement.revision}
          className="gp-grid-visually-hidden"
          role="status"
          aria-live="polite"
        >
          {state.announcement.message}
        </div>
      )}

      {/* Loading overlay - positioned outside scrollable area to avoid Firefox sticky issues */}
      {state.isLoading && (
        <div
          style={{
            position: "absolute",
            top: totalHeaderHeight,
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
            rawValue={peekCore?.cells.getValue(peekCell.row, peekCell.col) ?? null}
            rowId={peekCore?.rows.getId(peekCell.row)}
            getValue={(field) =>
              peekCore?.cells.getFieldValue(peekCell.row, field) ?? null
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
          style={{ insetInlineStart: dragState.columnResize.lineX }}
        />
      )}

      {/* Row resize line */}
      {dragState.dragType === "row-resize" && dragState.rowResize && (
        <div
          className="gp-grid-row-resize-line"
          style={{ top: totalHeaderHeight + dragState.rowResize.lineY }}
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
                  insetInlineStart: cm.dropIndicatorX,
                  height: totalHeaderHeight,
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
            top: dragState.rowDrag.currentY - dragState.rowDrag.sourceRowHeight / 2,
            width: Math.min(300, totalWidth),
            height: dragState.rowDrag.sourceRowHeight,
          }}
        />
      )}
    </div>
  );
}
