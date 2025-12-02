// packages/react/src/Grid.tsx

import React, {
  useEffect,
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
} from "gp-grid-core";
import type {
  GridInstruction,
  ColumnDefinition,
  DataSource,
  Row,
  CellRendererParams,
  EditRendererParams,
  HeaderRendererParams,
  CellPosition,
  CellRange,
  CellValue,
  SortDirection,
} from "gp-grid-core";
import { injectStyles } from "./styles";

// =============================================================================
// Types
// =============================================================================

export type ReactCellRenderer = (params: CellRendererParams) => React.ReactNode;
export type ReactEditRenderer = (params: EditRendererParams) => React.ReactNode;
export type ReactHeaderRenderer = (params: HeaderRendererParams) => React.ReactNode;

export interface GridProps<TData extends Row = Row> {
  columns: ColumnDefinition[];
  /** Data source for the grid */
  dataSource?: DataSource<TData>;
  /** Legacy: Raw row data (will be wrapped in a client data source) */
  rowData?: TData[];
  rowHeight: number;
  headerHeight?: number;
  overscan?: number;
  /** Show filter row below headers */
  showFilters?: boolean;
  /** Debounce time for filter input (ms) */
  filterDebounce?: number;
  /** Enable dark mode styling */
  darkMode?: boolean;

  // Renderer registries
  cellRenderers?: Record<string, ReactCellRenderer>;
  editRenderers?: Record<string, ReactEditRenderer>;
  headerRenderers?: Record<string, ReactHeaderRenderer>;

  // Global fallback renderers
  cellRenderer?: ReactCellRenderer;
  editRenderer?: ReactEditRenderer;
  headerRenderer?: ReactHeaderRenderer;
}

// =============================================================================
// State Types
// =============================================================================

interface SlotData {
  slotId: string;
  rowIndex: number;
  rowData: Row;
  translateY: number;
}

interface GridState {
  slots: Map<string, SlotData>;
  activeCell: CellPosition | null;
  selectionRange: CellRange | null;
  editingCell: { row: number; col: number; initialValue: CellValue } | null;
  contentWidth: number;
  contentHeight: number;
  headers: Map<number, { column: ColumnDefinition; sortDirection?: SortDirection; sortIndex?: number }>;
  isLoading: boolean;
  error: string | null;
  totalRows: number;
}

type GridAction =
  | { type: "BATCH_INSTRUCTIONS"; instructions: GridInstruction[] }
  | { type: "RESET" };

// =============================================================================
// Reducer
// =============================================================================

/**
 * Apply a single instruction to mutable slot maps and return other state changes.
 * This allows batching multiple slot operations efficiently.
 */
function applyInstruction(
  instruction: GridInstruction,
  slots: Map<string, SlotData>,
  headers: Map<number, { column: ColumnDefinition; sortDirection?: SortDirection; sortIndex?: number }>
): Partial<GridState> | null {
  switch (instruction.type) {
    case "CREATE_SLOT":
      slots.set(instruction.slotId, {
        slotId: instruction.slotId,
        rowIndex: -1,
        rowData: {},
        translateY: 0,
      });
      return null; // Slots map is mutated

    case "DESTROY_SLOT":
      slots.delete(instruction.slotId);
      return null;

    case "ASSIGN_SLOT": {
      const existing = slots.get(instruction.slotId);
      if (existing) {
        slots.set(instruction.slotId, {
          ...existing,
          rowIndex: instruction.rowIndex,
          rowData: instruction.rowData,
        });
      }
      return null;
    }

    case "MOVE_SLOT": {
      const existing = slots.get(instruction.slotId);
      if (existing) {
        slots.set(instruction.slotId, {
          ...existing,
          translateY: instruction.translateY,
        });
      }
      return null;
    }

    case "SET_ACTIVE_CELL":
      return { activeCell: instruction.position };

    case "SET_SELECTION_RANGE":
      return { selectionRange: instruction.range };

    case "START_EDIT":
      return {
        editingCell: {
          row: instruction.row,
          col: instruction.col,
          initialValue: instruction.initialValue,
        },
      };

    case "STOP_EDIT":
      return { editingCell: null };

    case "SET_CONTENT_SIZE":
      return {
        contentWidth: instruction.width,
        contentHeight: instruction.height,
      };

    case "UPDATE_HEADER":
      headers.set(instruction.colIndex, {
        column: instruction.column,
        sortDirection: instruction.sortDirection,
        sortIndex: instruction.sortIndex,
      });
      return null;

    case "DATA_LOADING":
      return { isLoading: true, error: null };

    case "DATA_LOADED":
      return { isLoading: false, totalRows: instruction.totalRows };

    case "DATA_ERROR":
      return { isLoading: false, error: instruction.error };

    default:
      return null;
  }
}

function gridReducer(state: GridState, action: GridAction): GridState {
  if (action.type === "RESET") {
    return createInitialState();
  }

  // Process batch of instructions in one state update
  const { instructions } = action;
  // console.log("[GP-Grid Reducer] Processing batch:", instructions.map(i => i.type));
  if (instructions.length === 0) {
    return state;
  }

  // Create mutable copies of Maps to batch updates
  const newSlots = new Map(state.slots);
  const newHeaders = new Map(state.headers);
  let stateChanges: Partial<GridState> = {};

  // Apply all instructions
  for (const instruction of instructions) {
    const changes = applyInstruction(instruction, newSlots, newHeaders);
    if (changes) {
      stateChanges = { ...stateChanges, ...changes };
    }
  }

  // Return new state with all changes applied
  return {
    ...state,
    ...stateChanges,
    slots: newSlots,
    headers: newHeaders,
  };
}

function createInitialState(): GridState {
  return {
    slots: new Map(),
    activeCell: null,
    selectionRange: null,
    editingCell: null,
    contentWidth: 0,
    contentHeight: 0,
    headers: new Map(),
    isLoading: false,
    error: null,
    totalRows: 0,
  };
}

// =============================================================================
// Grid Component
// =============================================================================

export function Grid<TData extends Row = Row>(props: GridProps<TData>) {
  // Inject styles on first render (safe to call multiple times)
  injectStyles();

  const {
    columns,
    dataSource: providedDataSource,
    rowData,
    rowHeight,
    headerHeight = rowHeight,
    overscan = 3,
    showFilters = false,
    filterDebounce = 300,
    darkMode = false,
    cellRenderers = {},
    editRenderers = {},
    headerRenderers = {},
    cellRenderer,
    editRenderer,
    headerRenderer,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<GridCore<TData> | null>(null);
  const [state, dispatch] = useReducer(gridReducer, null, createInitialState);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const filterTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Computed heights
  const filterRowHeight = showFilters ? 40 : 0;
  const totalHeaderHeight = headerHeight + filterRowHeight;

  // Create data source from rowData if not provided
  const dataSource = useMemo(() => {
    if (providedDataSource) {
      return providedDataSource;
    }
    if (rowData) {
      return createDataSourceFromArray(rowData);
    }
    // Empty data source
    return createClientDataSource<TData>([]);
  }, [providedDataSource, rowData]);

  // Compute column positions
  const columnPositions = useMemo(() => {
    const positions = [0];
    let pos = 0;
    for (const col of columns) {
      pos += col.width;
      positions.push(pos);
    }
    return positions;
  }, [columns]);

  const totalWidth = columnPositions[columnPositions.length - 1] ?? 0;

  // Initialize GridCore
  useEffect(() => {
    const core = new GridCore<TData>({
      columns,
      dataSource,
      rowHeight,
      headerHeight: totalHeaderHeight,
      overscan,
    });

    coreRef.current = core;

    // Subscribe to batched instructions for efficient state updates
    const unsubscribe = core.onBatchInstruction((instructions) => {
      dispatch({ type: "BATCH_INSTRUCTIONS", instructions });
    });

    // Initialize
    core.initialize();

    return () => {
      unsubscribe();
      coreRef.current = null;
    };
  }, [columns, dataSource, rowHeight, totalHeaderHeight, overscan]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    const core = coreRef.current;
    if (!container || !core) return;

    core.setViewport(
      container.scrollTop,
      container.scrollLeft,
      container.clientWidth,
      container.clientHeight
    );
  }, []);

  // Initial measurement
  useEffect(() => {
    const container = containerRef.current;
    const core = coreRef.current;
    if (!container || !core) return;

    const resizeObserver = new ResizeObserver(() => {
      core.setViewport(
        container.scrollTop,
        container.scrollLeft,
        container.clientWidth,
        container.clientHeight
      );
    });

    resizeObserver.observe(container);
    handleScroll();

    return () => resizeObserver.disconnect();
  }, [handleScroll]);

  // Handle filter change with debounce
  const handleFilterChange = useCallback(
    (colId: string, value: string) => {
      setFilterValues((prev) => ({ ...prev, [colId]: value }));

      // Clear existing timeout
      if (filterTimeoutRef.current[colId]) {
        clearTimeout(filterTimeoutRef.current[colId]);
      }

      // Debounce the actual filter application
      filterTimeoutRef.current[colId] = setTimeout(() => {
        const core = coreRef.current;
        if (core) {
          core.setFilter(colId, value);
        }
      }, filterDebounce);
    },
    [filterDebounce]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const core = coreRef.current;
      if (!core) return;

      // Don't handle keyboard events when editing
      if (state.editingCell && e.key !== "Enter" && e.key !== "Escape" && e.key !== "Tab") {
        return;
      }

      const { selection } = core;
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          selection.moveFocus("up", isShift);
          break;
        case "ArrowDown":
          e.preventDefault();
          selection.moveFocus("down", isShift);
          break;
        case "ArrowLeft":
          e.preventDefault();
          selection.moveFocus("left", isShift);
          break;
        case "ArrowRight":
          e.preventDefault();
          selection.moveFocus("right", isShift);
          break;
        case "Enter":
          e.preventDefault();
          if (state.editingCell) {
            core.commitEdit();
          } else if (state.activeCell) {
            core.startEdit(state.activeCell.row, state.activeCell.col);
          }
          break;
        case "Escape":
          e.preventDefault();
          if (state.editingCell) {
            core.cancelEdit();
          } else {
            selection.clearSelection();
          }
          break;
        case "Tab":
          e.preventDefault();
          if (state.editingCell) {
            core.commitEdit();
          }
          selection.moveFocus(isShift ? "left" : "right", false);
          break;
        case "a":
          if (isCtrl) {
            e.preventDefault();
            selection.selectAll();
          }
          break;
        case "c":
          if (isCtrl) {
            e.preventDefault();
            selection.copySelectionToClipboard();
          }
          break;
        case "F2":
          e.preventDefault();
          if (state.activeCell && !state.editingCell) {
            core.startEdit(state.activeCell.row, state.activeCell.col);
          }
          break;
        case "Delete":
        case "Backspace":
          // Start editing with empty value on delete/backspace
          if (state.activeCell && !state.editingCell) {
            e.preventDefault();
            core.startEdit(state.activeCell.row, state.activeCell.col);
          }
          break;
        default:
          // Start editing on any printable character
          if (
            state.activeCell &&
            !state.editingCell &&
            !isCtrl &&
            e.key.length === 1
          ) {
            core.startEdit(state.activeCell.row, state.activeCell.col);
          }
          break;
      }
    },
    [state.activeCell, state.editingCell]
  );

  // Scroll active cell into view when navigating with keyboard
  useEffect(() => {
    if (!state.activeCell || !containerRef.current) return;

    const { row, col } = state.activeCell;
    const container = containerRef.current;

    // Calculate cell position
    const cellTop = row * rowHeight + totalHeaderHeight;
    const cellBottom = cellTop + rowHeight;
    const cellLeft = columnPositions[col] ?? 0;
    const cellRight = cellLeft + (columns[col]?.width ?? 0);

    // Get visible area
    const visibleTop = container.scrollTop + totalHeaderHeight;
    const visibleBottom = container.scrollTop + container.clientHeight;
    const visibleLeft = container.scrollLeft;
    const visibleRight = container.scrollLeft + container.clientWidth;

    // Scroll vertically if needed
    if (cellTop < visibleTop) {
      container.scrollTop = cellTop - totalHeaderHeight;
    } else if (cellBottom > visibleBottom) {
      container.scrollTop = cellBottom - container.clientHeight;
    }

    // Scroll horizontally if needed
    if (cellLeft < visibleLeft) {
      container.scrollLeft = cellLeft;
    } else if (cellRight > visibleRight) {
      container.scrollLeft = cellRight - container.clientWidth;
    }
  }, [state.activeCell, rowHeight, totalHeaderHeight, columnPositions, columns]);

  // Cell click handler
  const handleCellClick = useCallback(
    (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
      // console.log("[GP-Grid] Cell click:", { rowIndex, colIndex, coreExists: !!coreRef.current });
      const core = coreRef.current;
      if (!core) {
        // console.warn("[GP-Grid] Core not initialized on cell click");
        return;
      }

      // Focus the container to enable keyboard navigation
      containerRef.current?.focus();

      core.selection.startSelection(
        { row: rowIndex, col: colIndex },
        { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
      );
    },
    []
  );

  // Cell double-click handler
  const handleCellDoubleClick = useCallback(
    (rowIndex: number, colIndex: number) => {
      // console.log("[GP-Grid] Cell double-click:", { rowIndex, colIndex, coreExists: !!coreRef.current });
      const core = coreRef.current;
      if (!core) {
        // console.warn("[GP-Grid] Core not initialized on double-click");
        return;
      }

      core.startEdit(rowIndex, colIndex);
    },
    []
  );

  // Header click handler (sort)
  const handleHeaderClick = useCallback(
    (colIndex: number, e: React.MouseEvent) => {
      // console.log("[GP-Grid] Header click:", { colIndex, coreExists: !!coreRef.current });
      const core = coreRef.current;
      if (!core) {
        // console.warn("[GP-Grid] Core not initialized on header click");
        return;
      }

      const column = columns[colIndex];
      if (!column) {
        // console.warn("[GP-Grid] Column not found for index:", colIndex);
        return;
      }

      const colId = column.colId ?? column.field;
      const headerInfo = state.headers.get(colIndex);
      const currentDirection = headerInfo?.sortDirection;

      // Cycle: none -> asc -> desc -> none
      let newDirection: SortDirection | null;
      if (!currentDirection) {
        newDirection = "asc";
      } else if (currentDirection === "asc") {
        newDirection = "desc";
      } else {
        newDirection = null;
      }

      // console.log("[GP-Grid] Setting sort:", { colId, newDirection });
      core.setSort(colId, newDirection, e.shiftKey);
    },
    [columns, state.headers]
  );

  // Render helpers
  const isSelected = useCallback(
    (row: number, col: number): boolean => {
      const { selectionRange } = state;
      if (!selectionRange) return false;

      const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
      const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
      const minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
      const maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);

      return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
    },
    [state.selectionRange]
  );

  const isActiveCell = useCallback(
    (row: number, col: number): boolean => {
      return state.activeCell?.row === row && state.activeCell?.col === col;
    },
    [state.activeCell]
  );

  const isEditingCell = useCallback(
    (row: number, col: number): boolean => {
      return state.editingCell?.row === row && state.editingCell?.col === col;
    },
    [state.editingCell]
  );

  // Get cell value from row data
  const getCellValue = useCallback((rowData: Row, field: string): CellValue => {
    const parts = field.split(".");
    let value: unknown = rowData;

    for (const part of parts) {
      if (value == null || typeof value !== "object") {
        return null;
      }
      value = (value as Record<string, unknown>)[part];
    }

    return (value ?? null) as CellValue;
  }, []);

  // Render cell content
  const renderCell = useCallback(
    (
      column: ColumnDefinition,
      rowData: Row,
      rowIndex: number,
      colIndex: number
    ): React.ReactNode => {
      const value = getCellValue(rowData, column.field);
      const params: CellRendererParams = {
        value,
        rowData,
        column,
        rowIndex,
        colIndex,
        isActive: isActiveCell(rowIndex, colIndex),
        isSelected: isSelected(rowIndex, colIndex),
        isEditing: isEditingCell(rowIndex, colIndex),
      };

      // Check for column-specific renderer
      if (column.cellRenderer && typeof column.cellRenderer === "string") {
        const renderer = cellRenderers[column.cellRenderer];
        if (renderer) {
          return renderer(params);
        }
      }

      // Fall back to global renderer
      if (cellRenderer) {
        return cellRenderer(params);
      }

      // Default text rendering
      return value == null ? "" : String(value);
    },
    [getCellValue, isActiveCell, isSelected, isEditingCell, cellRenderers, cellRenderer]
  );

  // Render edit cell
  const renderEditCell = useCallback(
    (
      column: ColumnDefinition,
      rowData: Row,
      rowIndex: number,
      colIndex: number,
      initialValue: CellValue
    ): React.ReactNode => {
      const core = coreRef.current;
      if (!core) return null;

      const value = getCellValue(rowData, column.field);
      const params: EditRendererParams = {
        value,
        rowData,
        column,
        rowIndex,
        colIndex,
        isActive: true,
        isSelected: true,
        isEditing: true,
        initialValue,
        onValueChange: (newValue) => core.updateEditValue(newValue),
        onCommit: () => core.commitEdit(),
        onCancel: () => core.cancelEdit(),
      };

      // Check for column-specific renderer
      if (column.editRenderer && typeof column.editRenderer === "string") {
        const renderer = editRenderers[column.editRenderer];
        if (renderer) {
          return renderer(params);
        }
      }

      // Fall back to global renderer
      if (editRenderer) {
        return editRenderer(params);
      }

      // Default input
      return (
        <input
          className="gp-grid-edit-input"
          type="text"
          defaultValue={initialValue == null ? "" : String(initialValue)}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => core.updateEditValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              core.commitEdit();
            } else if (e.key === "Escape") {
              core.cancelEdit();
            } else if (e.key === "Tab") {
              e.preventDefault();
              core.commitEdit();
              core.selection.moveFocus(e.shiftKey ? "left" : "right", false);
            }
          }}
          onBlur={() => core.commitEdit()}
        />
      );
    },
    [getCellValue, editRenderers, editRenderer]
  );

  // Render header
  const renderHeader = useCallback(
    (
      column: ColumnDefinition,
      colIndex: number,
      sortDirection?: SortDirection,
      sortIndex?: number
    ): React.ReactNode => {
      const core = coreRef.current;
      const params: HeaderRendererParams = {
        column,
        colIndex,
        sortDirection,
        sortIndex,
        onSort: (direction, addToExisting) => {
          if (core) {
            core.setSort(column.colId ?? column.field, direction, addToExisting);
          }
        },
      };

      // Check for column-specific renderer
      if (column.headerRenderer && typeof column.headerRenderer === "string") {
        const renderer = headerRenderers[column.headerRenderer];
        if (renderer) {
          return renderer(params);
        }
      }

      // Fall back to global renderer
      if (headerRenderer) {
        return headerRenderer(params);
      }

      // Default header
      return (
        <>
          <span className="gp-grid-header-text">
            {column.headerName ?? column.field}
          </span>
          {sortDirection && (
            <span className="gp-grid-sort-indicator">
              {sortDirection === "asc" ? "▲" : "▼"}
              {sortIndex !== undefined && sortIndex > 0 && (
                <span className="gp-grid-sort-index">{sortIndex}</span>
              )}
            </span>
          )}
        </>
      );
    },
    [headerRenderers, headerRenderer]
  );

  // Convert slots map to array for rendering
  const slotsArray = useMemo(() => Array.from(state.slots.values()), [state.slots]);

  // Calculate fill handle position
  const fillHandlePosition = useMemo(() => {
    const { activeCell, selectionRange } = state;
    if (!activeCell && !selectionRange) return null;

    // Get the bottom-right corner of selection or active cell
    let row: number, col: number;
    if (selectionRange) {
      row = Math.max(selectionRange.startRow, selectionRange.endRow);
      col = Math.max(selectionRange.startCol, selectionRange.endCol);
    } else if (activeCell) {
      row = activeCell.row;
      col = activeCell.col;
    } else {
      return null;
    }

    const cellTop = row * rowHeight + totalHeaderHeight;
    const cellLeft = columnPositions[col] ?? 0;
    const cellWidth = columns[col]?.width ?? 0;

    return {
      top: cellTop + rowHeight - 4, // 4px offset for the handle
      left: cellLeft + cellWidth - 4,
    };
  }, [state.activeCell, state.selectionRange, rowHeight, totalHeaderHeight, columnPositions, columns]);

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
            zIndex: 100,
          }}
        >
          {columns.map((column, colIndex) => {
            const headerInfo = state.headers.get(colIndex);
            return (
              <div
                key={column.colId ?? column.field}
                className="gp-grid-header-cell"
                style={{
                  position: "absolute",
                  left: `${columnPositions[colIndex]}px`,
                  top: 0,
                  width: `${column.width}px`,
                  height: `${headerHeight}px`,
                  background: "transparent",
                }}
                onClick={(e) => handleHeaderClick(colIndex, e)}
              >
                {renderHeader(
                  column,
                  colIndex,
                  headerInfo?.sortDirection,
                  headerInfo?.sortIndex
                )}
              </div>
            );
          })}
        </div>

        {/* Filter Row */}
        {showFilters && (
          <div
            className="gp-grid-filter-row"
            style={{
              position: "sticky",
              top: headerHeight,
              left: 0,
              height: filterRowHeight,
              width: Math.max(state.contentWidth, totalWidth),
              minWidth: "100%",
              background: "#f5f5f5",
              zIndex: 99,
            }}
          >
            {columns.map((column, colIndex) => {
              const colId = column.colId ?? column.field;
              return (
                <div
                  key={`filter-${colId}`}
                  className="gp-grid-filter-cell"
                  style={{
                    position: "absolute",
                    left: `${columnPositions[colIndex]}px`,
                    top: 0,
                    width: `${column.width}px`,
                    height: `${filterRowHeight}px`,
                    background: "#f5f5f5",
                  }}
                >
                  <input
                    className="gp-grid-filter-input"
                    type="text"
                    placeholder={`Filter ${column.headerName ?? column.field}...`}
                    value={filterValues[colId] ?? ""}
                    onChange={(e) => handleFilterChange(colId, e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>
        )}

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
                const isEditing = isEditingCell(slot.rowIndex, colIndex);
                const active = isActiveCell(slot.rowIndex, colIndex);
                const selected = isSelected(slot.rowIndex, colIndex);

                const cellClasses = [
                  "gp-grid-cell",
                  active && "gp-grid-cell--active",
                  selected && !active && "gp-grid-cell--selected",
                  isEditing && "gp-grid-cell--editing",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div
                    key={`${slot.slotId}-${colIndex}`}
                    className={cellClasses}
                    style={{
                      position: "absolute",
                      left: `${columnPositions[colIndex]}px`,
                      top: 0,
                      width: `${column.width}px`,
                      height: `${rowHeight}px`,
                    }}
                    onClick={(e) => handleCellClick(slot.rowIndex, colIndex, e)}
                    onDoubleClick={() => handleCellDoubleClick(slot.rowIndex, colIndex)}
                  >
                    {isEditing && state.editingCell
                      ? renderEditCell(
                          column,
                          slot.rowData,
                          slot.rowIndex,
                          colIndex,
                          state.editingCell.initialValue
                        )
                      : renderCell(column, slot.rowData, slot.rowIndex, colIndex)}
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
            }}
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
    </div>
  );
}
