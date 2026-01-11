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
} from "gp-grid-core";
import type { Row, ColumnFilterModel, DataSource } from "gp-grid-core";
import { FilterPopup } from "./components";
import { gridReducer, createInitialState } from "./gridState";
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
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<GridCore<TData> | null>(null);
  const prevDataSourceRef = useRef<DataSource<TData> | null>(null);
  const [state, dispatch] = useReducer(
    gridReducer,
    { initialWidth, initialHeight },
    createInitialState,
  );

  // Computed heights
  const totalHeaderHeight = headerHeight;

  // Create data source from rowData if not provided
  // Track whether we own the dataSource (created internally vs provided as prop)
  const { dataSource, ownsDataSource } = useMemo(() => {
    if (providedDataSource) {
      return { dataSource: providedDataSource, ownsDataSource: false };
    }
    if (rowData) {
      return { dataSource: createDataSourceFromArray(rowData), ownsDataSource: true };
    }
    // Empty data source
    return { dataSource: createClientDataSource<TData>([]), ownsDataSource: true };
  }, [providedDataSource, rowData]);

  // Handle data source changes: reset state early (before GridCore recreates)
  // Cleanup responsibilities:
  // - This effect: reset state on dataSource change
  // - GridCore effect: destroy old core AND old dataSource in cleanup
  useEffect(() => {
    const prevDataSource = prevDataSourceRef.current;

    // On change (not initial mount), reset state to clear slot rowData references
    if (prevDataSource && prevDataSource !== dataSource) {
      dispatch({ type: "RESET" });
    }

    // Track current data source
    prevDataSourceRef.current = dataSource;
  }, [dataSource]);

  // Compute column positions (scaled to fill container when wider)
  const { positions: columnPositions, widths: columnWidths } = useMemo(
    () => calculateScaledColumnPositions(columns, state.viewportWidth),
    [columns, state.viewportWidth],
  );
  const totalWidth = getTotalWidth(columnPositions);

  // Unified input handling (replaces useFillDrag, useSelectionDrag, useKeyboardNavigation)
  const {
    handleCellMouseDown,
    handleCellDoubleClick,
    handleFillHandleMouseDown,
    handleHeaderClick,
    handleKeyDown,
    handleWheel,
    dragState,
  } = useInputHandler(coreRef, containerRef, columns, {
    activeCell: state.activeCell,
    selectionRange: state.selectionRange,
    editingCell: state.editingCell,
    filterPopupOpen: state.filterPopup?.isOpen ?? false,
    rowHeight,
    headerHeight: totalHeaderHeight,
    columnPositions,
    slots: state.slots,
  });

  // Initialize GridCore
  useEffect(() => {
    const core = new GridCore<TData>({
      columns,
      dataSource,
      rowHeight,
      headerHeight: totalHeaderHeight,
      overscan,
      sortingEnabled,
    });

    coreRef.current = core;

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

    return () => {
      unsubscribe();
      // Destroy core to release cached row data
      core.destroy();
      // Only destroy dataSource if we created it internally
      // Don't destroy user-provided dataSources (they may be reused)
      if (ownsDataSource) {
        dataSource.destroy?.();
      }
      coreRef.current = null;
      if (gridRef) {
        gridRef.current = null;
      }
    };
  }, [
    columns,
    dataSource,
    ownsDataSource,
    rowHeight,
    totalHeaderHeight,
    overscan,
    sortingEnabled,
    gridRef,
  ]);

  // Subscribe to data source changes (for MutableDataSource)
  useEffect(() => {
    const mutableDataSource = dataSource as {
      subscribe?: (listener: () => void) => () => void;
    };
    if (mutableDataSource.subscribe) {
      const unsubscribe = mutableDataSource.subscribe(() => {
        coreRef.current?.refresh();
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

    // Check if ALL columns in the selection are editable
    for (let c = minCol; c <= maxCol; c++) {
      const column = columns[c];
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

    const cellLeft = columnPositions[col] ?? 0;
    const cellWidth = columnWidths[col] ?? 0;

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
    columns,
  ]);

  return (
    <div
      ref={containerRef}
      className={`gp-grid-container${darkMode ? " gp-grid-container--dark" : ""}`}
      style={{
        width: "100%",
        height: "100%",
        overflow: "auto",
        position: "relative",
      }}
      onScroll={handleScroll}
      onWheel={(e) => handleWheel(e, wheelDampening)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Content sizer */}
      <div
        style={{
          width: Math.max(state.contentWidth, totalWidth),
          height: Math.max(state.contentHeight, totalHeaderHeight),
          position: "relative",
          minWidth: "100%",
        }}
      >
        {/* Headers */}
        <div
          className="gp-grid-header"
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            height: headerHeight,
            width: Math.max(state.contentWidth, totalWidth),
            minWidth: "100%",
          }}
        >
          {columns.map((column, colIndex) => {
            const headerInfo = state.headers.get(colIndex);
            return (
              <div
                key={column.colId ?? column.field}
                className="gp-grid-header-cell"
                data-col-index={colIndex}
                style={{
                  position: "absolute",
                  left: `${columnPositions[colIndex]}px`,
                  top: 0,
                  width: `${columnWidths[colIndex]}px`,
                  height: `${headerHeight}px`,
                  background: "transparent",
                }}
                onClick={(e) => handleHeaderClick(colIndex, e)}
              >
                {renderHeader({
                  column,
                  colIndex,
                  sortDirection: headerInfo?.sortDirection,
                  sortIndex: headerInfo?.sortIndex,
                  sortable: headerInfo?.sortable ?? true,
                  filterable: headerInfo?.filterable ?? true,
                  hasFilter: headerInfo?.hasFilter ?? false,
                  coreRef,
                  containerRef,
                  headerRenderers,
                  globalHeaderRenderer: headerRenderer,
                })}
              </div>
            );
          })}
        </div>

        {/* Row slots */}
        {slotsArray.map((slot) => {
          if (slot.rowIndex < 0) return null;

          const isEvenRow = slot.rowIndex % 2 === 0;

          return (
            <div
              key={slot.slotId}
              className={`gp-grid-row ${isEvenRow ? "gp-grid-row--even" : ""}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `translateY(${slot.translateY}px)`,
                width: `${Math.max(state.contentWidth, totalWidth)}px`,
                height: `${rowHeight}px`,
              }}
            >
              {columns.map((column, colIndex) => {
                const isEditing = isCellEditing(
                  slot.rowIndex,
                  colIndex,
                  state.editingCell,
                );
                const active = isCellActive(
                  slot.rowIndex,
                  colIndex,
                  state.activeCell,
                );
                const selected = isCellSelected(
                  slot.rowIndex,
                  colIndex,
                  state.selectionRange,
                );
                const inFillPreview = isCellInFillPreview(
                  slot.rowIndex,
                  colIndex,
                  dragState.dragType === "fill",
                  dragState.fillSourceRange,
                  dragState.fillTarget,
                );

                const cellClasses = buildCellClasses(
                  active,
                  selected,
                  isEditing,
                  inFillPreview,
                );

                return (
                  <div
                    key={`${slot.slotId}-${colIndex}`}
                    className={cellClasses}
                    style={{
                      position: "absolute",
                      left: `${columnPositions[colIndex]}px`,
                      top: 0,
                      width: `${columnWidths[colIndex]}px`,
                      height: `${rowHeight}px`,
                    }}
                    onMouseDown={(e) =>
                      handleCellMouseDown(slot.rowIndex, colIndex, e)
                    }
                    onDoubleClick={() =>
                      handleCellDoubleClick(slot.rowIndex, colIndex)
                    }
                  >
                    {isEditing && state.editingCell
                      ? renderEditCell({
                          column,
                          rowData: slot.rowData,
                          rowIndex: slot.rowIndex,
                          colIndex,
                          initialValue: state.editingCell.initialValue,
                          coreRef,
                          editRenderers,
                          globalEditRenderer: editRenderer,
                        })
                      : renderCell({
                          column,
                          rowData: slot.rowData,
                          rowIndex: slot.rowIndex,
                          colIndex,
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

        {/* Fill handle (drag to fill) */}
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

        {/* Loading indicator */}
        {state.isLoading && (
          <div className="gp-grid-loading">
            <div className="gp-grid-loading-spinner" />
            Loading...
          </div>
        )}

        {/* Error message */}
        {state.error && (
          <div className="gp-grid-error">Error: {state.error}</div>
        )}

        {/* Empty state */}
        {!state.isLoading && !state.error && state.totalRows === 0 && (
          <div className="gp-grid-empty">No data to display</div>
        )}
      </div>

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
    </div>
  );
}
