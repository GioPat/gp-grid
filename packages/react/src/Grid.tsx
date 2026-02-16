// packages/react/src/Grid.tsx

import React, {
  useEffect,
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
  isCellSelected,
  isCellActive,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
} from "@gp-grid/core";
import type { Row, ColumnFilterModel, DataSource } from "@gp-grid/core";
import { FilterPopup } from "./components";
import { gridReducer, createInitialState } from "./gridState";
import type { GridState, GridAction } from "./gridState/types";
import { useInputHandler } from "./hooks/useInputHandler";
import { renderCell } from "./renderers/cellRenderer";
import { renderEditCell } from "./renderers/editRenderer";
import { renderHeader } from "./renderers/headerRenderer";
import type { GridProps } from "./types";

// Re-export types for backwards compatibility
export type {
  ReactCellRenderer,
  ReactEditRenderer,
  ReactHeaderRenderer,
  GridProps,
} from "./types";

// =============================================================================
// Grid Component
// =============================================================================

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

  const { dataSource, ownsDataSource } = dataSourceCacheRef.current!;

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
    handleHeaderClick,
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
      highlighting,
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
    highlighting,
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
  const fillHandlePosition = useMemo(() => {
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

    // Check if ALL columns in the selection are editable (skip hidden columns)
    for (let c = minCol; c <= maxCol; c++) {
      const column = effectiveColumns[c];
      if (!column || column.hidden) continue; // Skip hidden columns
      if (column.editable !== true) {
        return null;
      }
    }

    // Find the visible index for the target column
    const visibleIndex = visibleColumnsWithIndices.findIndex(
      (v) => v.originalIndex === col,
    );
    if (visibleIndex === -1) return null; // Column is hidden

    // Find the slot for this row and use its actual translateY
    let cellTop: number | null = null;
    for (const slot of slots.values()) {
      if (slot.rowIndex === row) {
        cellTop = slot.translateY;
        break;
      }
    }

    if (cellTop === null) return null;

    const cellLeft = columnPositions[visibleIndex] ?? 0;
    const cellWidth = columnWidths[visibleIndex] ?? 0;

    return {
      top: cellTop + rowHeight - 5,
      left: cellLeft + cellWidth - 20,
    };
  }, [
    state.activeCell,
    state.selectionRange,
    state.slots,
    rowHeight,
    columnPositions,
    columnWidths,
    effectiveColumns,
    visibleColumnsWithIndices,
  ]);

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
      {/* Header container - fixed height, horizontal scroll synced with body */}
      <div
        className={`gp-grid-header${state.isLoading ? " gp-grid-header--loading" : ""}`}
        style={{
          flexShrink: 0,
          height: headerHeight,
          overflow: "hidden",
          position: "relative",
          zIndex: 100,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translateX(${-scrollLeft}px)`,
            width: Math.max(state.contentWidth, totalWidth),
            height: headerHeight,
          }}
        >
          {visibleColumnsWithIndices.map(({ column, originalIndex }, visibleIndex) => {
            const headerInfo = state.headers.get(originalIndex);
            const colW = columnWidths[visibleIndex] ?? 0;
            return (
              <div
                key={column.colId ?? column.field}
                className="gp-grid-header-cell"
                data-col-index={originalIndex}
                style={{
                  position: "absolute",
                  left: `${columnPositions[visibleIndex]}px`,
                  top: 0,
                  width: `${colW}px`,
                  height: `${headerHeight}px`,
                  background: "transparent",
                }}
                onMouseDown={(e) =>
                  handleHeaderMouseDown(originalIndex, colW, headerHeight, e)
                }
              >
                {renderHeader({
                  column,
                  colIndex: originalIndex,
                  sortDirection: headerInfo?.sortDirection,
                  sortIndex: headerInfo?.sortIndex,
                  sortable: (column.sortable !== false) && sortingEnabled,
                  filterable: column.filterable !== false,
                  hasFilter: headerInfo?.hasFilter ?? false,
                  coreRef,
                  containerRef: outerContainerRef,
                  headerRenderers,
                  globalHeaderRenderer: headerRenderer,
                })}
                {/* Resize handle */}
                {column.resizable !== false && (
                  <div
                    className="gp-grid-header-resize-handle"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleHeaderResizeMouseDown(originalIndex, colW, e);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable body container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: "auto",
          position: "relative",
        }}
        onScroll={handleScrollWithHeaderSync}
      >
        {/* Content sizer - provides scroll range */}
        <div
          style={{
            width: Math.max(state.contentWidth, totalWidth),
            height: Math.max(state.contentHeight - totalHeaderHeight, 0),
            position: "relative",
            minWidth: "100%",
          }}
        >
        {/* Rows wrapper - uses transform to position rows with small translateY values */}
        {/* This prevents browser rendering issues at extreme pixel positions (millions of px) */}
        <div
          className="gp-grid-rows-wrapper"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: `${Math.max(state.contentWidth, totalWidth)}px`,
            transform: `translateY(${state.rowsWrapperOffset}px)`,
            willChange: "transform",
          }}
        >
          {/* Row slots */}
          {slotsArray.map((slot) => {
            if (slot.rowIndex < 0) return null;

            // Compute row highlight classes (pass rowData for content-based rules)
            const highlightRowClasses =
              coreRef.current?.highlight?.computeRowClasses(slot.rowIndex, slot.rowData) ?? [];
            const rowClassName = ["gp-grid-row", ...highlightRowClasses]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={slot.slotId}
                className={rowClassName}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `translateY(${slot.translateY}px)`,
                  width: `${Math.max(state.contentWidth, totalWidth)}px`,
                  height: `${rowHeight}px`,
                }}
              >
                {visibleColumnsWithIndices.map(({ column, originalIndex }, visibleIndex) => {
                  const isEditing = isCellEditing(
                    slot.rowIndex,
                    originalIndex,
                    state.editingCell,
                  );
                  const active = isCellActive(
                    slot.rowIndex,
                    originalIndex,
                    state.activeCell,
                  );
                  const selected = isCellSelected(
                    slot.rowIndex,
                    originalIndex,
                    state.selectionRange,
                  );
                  const inFillPreview = isCellInFillPreview(
                    slot.rowIndex,
                    originalIndex,
                    dragState.dragType === "fill",
                    dragState.fillSourceRange,
                    dragState.fillTarget,
                  );

                  // Build base cell classes
                  const baseCellClasses = buildCellClasses(
                    active,
                    selected,
                    isEditing,
                    inFillPreview,
                  );

                  // Compute highlight cell classes
                  const highlightCellClasses =
                    coreRef.current?.highlight?.computeCombinedCellClasses(
                      slot.rowIndex,
                      originalIndex,
                      column,
                      slot.rowData,
                    ) ?? [];

                  const isRowDragHandle = column.rowDrag === true;

                  const cellClasses = [
                    baseCellClasses,
                    ...highlightCellClasses,
                    isRowDragHandle ? "gp-grid-cell--row-drag-handle" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div
                      key={`${slot.slotId}-${originalIndex}`}
                      className={cellClasses}
                      style={{
                        position: "absolute",
                        left: `${columnPositions[visibleIndex]}px`,
                        top: 0,
                        width: `${columnWidths[visibleIndex]}px`,
                        height: `${rowHeight}px`,
                      }}
                      onMouseDown={(e) =>
                        handleCellMouseDown(slot.rowIndex, originalIndex, e)
                      }
                      onDoubleClick={() =>
                        handleCellDoubleClick(slot.rowIndex, originalIndex)
                      }
                      onMouseEnter={() =>
                        handleCellMouseEnter(slot.rowIndex, originalIndex)
                      }
                      onMouseLeave={handleCellMouseLeave}
                    >
                      {isEditing && state.editingCell
                        ? renderEditCell({
                          column,
                          rowData: slot.rowData,
                          rowIndex: slot.rowIndex,
                          colIndex: originalIndex,
                          initialValue: state.editingCell.initialValue,
                          coreRef,
                          editRenderers,
                          globalEditRenderer: editRenderer,
                        })
                        : renderCell({
                          column,
                          rowData: slot.rowData,
                          rowIndex: slot.rowIndex,
                          colIndex: originalIndex,
                          isActive: active,
                          isSelected: selected,
                          isEditing,
                          cellRenderers,
                          globalCellRenderer: cellRenderer,
                        })}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Fill handle (drag to fill) - inside wrapper so it moves with rows */}
          {fillHandlePosition && !state.editingCell && (
            <div
              className="gp-grid-fill-handle"
              style={{
                position: "absolute",
                top: fillHandlePosition.top,
                left: fillHandlePosition.left,
                zIndex: 200,
              }}
              onMouseDown={handleFillHandleMouseDown}
            />
          )}

          {/* Row drop indicator - inside wrapper so it scrolls with rows */}
          {dragState.dragType === "row-drag" && dragState.rowDrag?.dropTargetIndex !== null && (
            <div
              className="gp-grid-row-drop-indicator"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `translateY(${dragState.rowDrag!.dropIndicatorY}px)`,
                width: `${Math.max(state.contentWidth, totalWidth)}px`,
              }}
            />
          )}
        </div>

        {/* Error message */}
        {state.error && (
          <div className="gp-grid-error">Error: {state.error}</div>
        )}

        {/* Empty state */}
        {!state.isLoading && !state.error && state.totalRows === 0 && (
          <div className="gp-grid-empty">No data to display</div>
        )}
      </div>
      {/* End content sizer */}
    </div>
    {/* End scrollable body container */}

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
        <div
          className="gp-grid-loading-overlay"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
        {loadingComponent ? (
          React.createElement(loadingComponent, { isLoading: true })
        ) : (
          <div
            className="gp-grid-loading"
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              pointerEvents: "auto",
            }}
          >
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
          style={{
            position: "absolute",
            top: 0,
            left: lineLeft,
            height: "100%",
          }}
        />
      );
    })()}

    {/* Column move ghost */}
    {dragState.dragType === "column-move" && dragState.columnMove && (() => {
      const cm = dragState.columnMove;
      const visibleIndex = visibleColumnsWithIndices.findIndex(
        (v) => v.originalIndex === cm.sourceColIndex,
      );
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
