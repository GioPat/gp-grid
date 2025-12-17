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

/** React cell renderer: A function that renders a cell */
export type ReactCellRenderer = (params: CellRendererParams) => React.ReactNode;
/** React edit renderer: A function that renders the cell while in edit mode */
export type ReactEditRenderer = (params: EditRendererParams) => React.ReactNode;
/** React header renderer: A function that renders a header cell */
export type ReactHeaderRenderer = (params: HeaderRendererParams) => React.ReactNode;

/** Grid component props */
export interface GridProps<TData extends Row = Row> {
  /** Column definitions */
  columns: ColumnDefinition[];
  /** Data source for the grid */
  dataSource?: DataSource<TData>;
  /** Legacy: Raw row data (will be wrapped in a client data source) */
  rowData?: TData[];
  /** Row height in pixels */
  rowHeight: number;
  /** Header height in pixels: Default to row height */
  headerHeight?: number;
  /** Overscan: How many rows to render outside the viewport */
  overscan?: number;
  /** Show filter row below headers: Default to false */
  showFilters?: boolean;
  /** Debounce time for filter input (ms): Default to 300 */
  filterDebounce?: number;
  /** Enable dark mode styling: Default to false */
  darkMode?: boolean;
  /** Wheel scroll dampening factor when virtual scrolling is active (0-1): Default 0.1 */
  wheelDampening?: number;

  /** Renderer registries */
  cellRenderers?: Record<string, ReactCellRenderer>;
  /** Edit renderer registries */
  editRenderers?: Record<string, ReactEditRenderer>;
  /** Header renderer registries */
  headerRenderers?: Record<string, ReactHeaderRenderer>;

  /** Global cell renderer */
  cellRenderer?: ReactCellRenderer;
  /** Global edit renderer */
  editRenderer?: ReactEditRenderer;
  /** Global header renderer */
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

/**
 * Grid component
 * @param props - Grid component props
 * @returns Grid React component
 */
export function Grid<TData extends Row = Row>(props: GridProps<TData>): React.ReactNode {
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
    wheelDampening = 0.1,
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
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [fillTarget, setFillTarget] = useState<{ row: number; col: number } | null>(null);
  const [fillSourceRange, setFillSourceRange] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);

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

  // Handle wheel with reduced sensitivity for large datasets
  const handleWheel = useCallback((e: React.WheelEvent) => {
    const container = containerRef.current;
    const core = coreRef.current;
    if (!container || !core) return;

    // Only apply dampening when scaling is active (large datasets)
    if (!core.isScalingActive()) return;

    // Prevent default scroll and apply dampened scroll
    e.preventDefault();
    container.scrollTop += e.deltaY * wheelDampening;
    container.scrollLeft += e.deltaX * wheelDampening;
  }, [wheelDampening]);

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
    // Skip scrolling when editing - the user just clicked on the cell so it's already visible
    if (!state.activeCell || !containerRef.current || state.editingCell) return;

    const { row, col } = state.activeCell;
    const container = containerRef.current;
    const core = coreRef.current;
    if (!core) return;

    // Get actually visible rows (not including overscan)
    const { start: visibleStart, end: visibleEnd } = core.getVisibleRowRange();

    // Only scroll if row is outside visible range
    if (row < visibleStart) {
      // Row is above viewport - scroll to put it at TOP
      container.scrollTop = core.getScrollTopForRow(row);
    } else if (row > visibleEnd) {
      // Row is below viewport - scroll to put it at BOTTOM
      // We want the row to be the last visible row
      // visibleEnd - visibleStart = number of fully visible rows
      const visibleRows = Math.max(1, visibleEnd - visibleStart);
      // The first row that makes 'row' the last visible is (row - visibleRows)
      const targetFirstRow = Math.max(0, row - visibleRows);
      container.scrollTop = core.getScrollTopForRow(targetFirstRow);
    }

    // Horizontal scrolling (unchanged - no scaling on X axis)
    const cellLeft = columnPositions[col] ?? 0;
    const cellRight = cellLeft + (columns[col]?.width ?? 0);
    const visibleLeft = container.scrollLeft;
    const visibleRight = container.scrollLeft + container.clientWidth;

    if (cellLeft < visibleLeft) {
      container.scrollLeft = cellLeft;
    } else if (cellRight > visibleRight) {
      container.scrollLeft = cellRight - container.clientWidth;
    }
  }, [state.activeCell, state.editingCell, columnPositions, columns]);

  // Cell mouse down handler (starts selection and drag)
  const handleCellMouseDown = useCallback(
    (rowIndex: number, colIndex: number, e: React.MouseEvent) => {
      // console.log("[GP-Grid] Cell mousedown:", { rowIndex, colIndex, coreExists: !!coreRef.current });
      const core = coreRef.current;
      if (!core || core.getEditState() !== null) {
        // console.warn("[GP-Grid] Core not initialized on cell mousedown");
        return;
      }

      // Only handle left mouse button
      if (e.button !== 0) return;

      // Focus the container to enable keyboard navigation
      containerRef.current?.focus();

      core.selection.startSelection(
        { row: rowIndex, col: colIndex },
        { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }
      );

      // Start drag selection (unless shift is held - that's a one-time extend)
      if (!e.shiftKey) {
        setIsDraggingSelection(true);
      }
    },
    []
  );

  // Cell double-click handler
  const handleCellDoubleClick = useCallback(
    (rowIndex: number, colIndex: number) => {
      const core = coreRef.current;
      if (!core) return;

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

  // Fill handle drag handlers
  const handleFillHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // console.log("[GP-Grid] Fill handle mousedown triggered");
      e.preventDefault();
      e.stopPropagation();

      const core = coreRef.current;
      if (!core) return;

      const { activeCell, selectionRange } = state;
      if (!activeCell && !selectionRange) return;

      // Create source range from selection or active cell
      const sourceRange = selectionRange ?? {
        startRow: activeCell!.row,
        startCol: activeCell!.col,
        endRow: activeCell!.row,
        endCol: activeCell!.col,
      };

      // console.log("[GP-Grid] Starting fill drag with source range:", sourceRange);
      core.fill.startFillDrag(sourceRange);
      setFillSourceRange(sourceRange);
      setFillTarget({ 
        row: Math.max(sourceRange.startRow, sourceRange.endRow),
        col: Math.max(sourceRange.startCol, sourceRange.endCol)
      });
      setIsDraggingFill(true);
    },
    [state.activeCell, state.selectionRange]
  );

  // Handle mouse move during fill drag
  useEffect(() => {
    if (!isDraggingFill) return;

    // Auto-scroll configuration
    const SCROLL_THRESHOLD = 40; // pixels from edge to trigger scroll
    const SCROLL_SPEED = 10; // pixels per frame

    const handleMouseMove = (e: MouseEvent) => {
      const core = coreRef.current;
      const container = containerRef.current;
      if (!core || !container) return;

      // Get container bounds
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      // Calculate mouse position relative to grid content
      const mouseX = e.clientX - rect.left + scrollLeft;
      const mouseY = e.clientY - rect.top + scrollTop - totalHeaderHeight;

      // Find the row under the mouse (use core method to handle scaling)
      const targetRow = Math.max(0, core.getRowIndexAtDisplayY(mouseY, scrollTop));

      // Find column by checking column positions
      let targetCol = 0;
      for (let i = 0; i < columnPositions.length - 1; i++) {
        if (mouseX >= columnPositions[i]! && mouseX < columnPositions[i + 1]!) {
          targetCol = i;
          break;
        }
        if (mouseX >= columnPositions[columnPositions.length - 1]!) {
          targetCol = columnPositions.length - 2;
        }
      }

      core.fill.updateFillDrag(targetRow, targetCol);
      setFillTarget({ row: targetRow, col: targetCol });

      // Auto-scroll logic
      const mouseYInContainer = e.clientY - rect.top;
      const mouseXInContainer = e.clientX - rect.left;

      // Clear any existing auto-scroll
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }

      // Check if we need to auto-scroll
      let scrollDeltaX = 0;
      let scrollDeltaY = 0;

      // Vertical scrolling
      if (mouseYInContainer < SCROLL_THRESHOLD + totalHeaderHeight) {
        scrollDeltaY = -SCROLL_SPEED;
      } else if (mouseYInContainer > rect.height - SCROLL_THRESHOLD) {
        scrollDeltaY = SCROLL_SPEED;
      }

      // Horizontal scrolling
      if (mouseXInContainer < SCROLL_THRESHOLD) {
        scrollDeltaX = -SCROLL_SPEED;
      } else if (mouseXInContainer > rect.width - SCROLL_THRESHOLD) {
        scrollDeltaX = SCROLL_SPEED;
      }

      // Start auto-scroll if needed
      if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop += scrollDeltaY;
            containerRef.current.scrollLeft += scrollDeltaX;
          }
        }, 16); // ~60fps
      }
    };

    const handleMouseUp = () => {
      // Clear auto-scroll
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }

      const core = coreRef.current;
      if (core) {
        core.fill.commitFillDrag();
        // Refresh slots to show updated values
        core.refreshSlotData();
      }
      setIsDraggingFill(false);
      setFillTarget(null);
      setFillSourceRange(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      // Clear auto-scroll on cleanup
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFill, totalHeaderHeight, rowHeight, columnPositions]);

  // Handle mouse move/up during selection drag
  useEffect(() => {
    if (!isDraggingSelection) return;

    // Auto-scroll configuration
    const SCROLL_THRESHOLD = 40;
    const SCROLL_SPEED = 10;

    const handleMouseMove = (e: MouseEvent) => {
      const core = coreRef.current;
      const container = containerRef.current;
      if (!core || !container) return;

      // Get container bounds
      const rect = container.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;

      // Calculate mouse position relative to grid content
      const mouseX = e.clientX - rect.left + scrollLeft;
      const mouseY = e.clientY - rect.top + scrollTop - totalHeaderHeight;

      // Find the row under the mouse (use core method to handle scaling)
      const targetRow = Math.max(0, Math.min(core.getRowIndexAtDisplayY(mouseY, scrollTop), core.getRowCount() - 1));

      // Find column by checking column positions
      let targetCol = 0;
      for (let i = 0; i < columnPositions.length - 1; i++) {
        if (mouseX >= columnPositions[i]! && mouseX < columnPositions[i + 1]!) {
          targetCol = i;
          break;
        }
        if (mouseX >= columnPositions[columnPositions.length - 1]!) {
          targetCol = columnPositions.length - 2;
        }
      }
      targetCol = Math.max(0, Math.min(targetCol, columns.length - 1));

      // Extend selection to target cell (like shift+click)
      core.selection.startSelection(
        { row: targetRow, col: targetCol },
        { shift: true }
      );

      // Auto-scroll logic
      const mouseYInContainer = e.clientY - rect.top;
      const mouseXInContainer = e.clientX - rect.left;

      // Clear any existing auto-scroll
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }

      // Check if we need to auto-scroll
      let scrollDeltaX = 0;
      let scrollDeltaY = 0;

      // Vertical scrolling
      if (mouseYInContainer < SCROLL_THRESHOLD + totalHeaderHeight) {
        scrollDeltaY = -SCROLL_SPEED;
      } else if (mouseYInContainer > rect.height - SCROLL_THRESHOLD) {
        scrollDeltaY = SCROLL_SPEED;
      }

      // Horizontal scrolling
      if (mouseXInContainer < SCROLL_THRESHOLD) {
        scrollDeltaX = -SCROLL_SPEED;
      } else if (mouseXInContainer > rect.width - SCROLL_THRESHOLD) {
        scrollDeltaX = SCROLL_SPEED;
      }

      // Start auto-scroll if needed
      if (scrollDeltaX !== 0 || scrollDeltaY !== 0) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop += scrollDeltaY;
            containerRef.current.scrollLeft += scrollDeltaX;
          }
        }, 16); // ~60fps
      }
    };

    const handleMouseUp = () => {
      // Clear auto-scroll
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
      setIsDraggingSelection(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSelection, totalHeaderHeight, columnPositions, columns.length]);

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

  // Check if cell is in fill preview range
  const isInFillPreview = useCallback(
    (row: number, col: number): boolean => {
      if (!isDraggingFill || !fillSourceRange || !fillTarget) return false;

      const srcMinRow = Math.min(fillSourceRange.startRow, fillSourceRange.endRow);
      const srcMaxRow = Math.max(fillSourceRange.startRow, fillSourceRange.endRow);
      const srcMinCol = Math.min(fillSourceRange.startCol, fillSourceRange.endCol);
      const srcMaxCol = Math.max(fillSourceRange.startCol, fillSourceRange.endCol);

      // Determine fill direction and range
      const fillDown = fillTarget.row > srcMaxRow;
      const fillUp = fillTarget.row < srcMinRow;
      const fillRight = fillTarget.col > srcMaxCol;
      const fillLeft = fillTarget.col < srcMinCol;

      // Check if cell is in the fill preview area (not the source area)
      if (fillDown) {
        return row > srcMaxRow && row <= fillTarget.row && col >= srcMinCol && col <= srcMaxCol;
      }
      if (fillUp) {
        return row < srcMinRow && row >= fillTarget.row && col >= srcMinCol && col <= srcMaxCol;
      }
      if (fillRight) {
        return col > srcMaxCol && col <= fillTarget.col && row >= srcMinRow && row <= srcMaxRow;
      }
      if (fillLeft) {
        return col < srcMinCol && col >= fillTarget.col && row >= srcMinRow && row <= srcMaxRow;
      }

      return false;
    },
    [isDraggingFill, fillSourceRange, fillTarget]
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

  // Calculate fill handle position (only show for editable columns)
  const fillHandlePosition = useMemo(() => {
    const { activeCell, selectionRange, slots } = state;
    if (!activeCell && !selectionRange) return null;

    // Get the bottom-right corner and column range of selection or active cell
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
        return null; // Don't show fill handle if any column is not editable
      }
    }

    // Find the slot for this row and use its actual translateY
    // This ensures the fill handle stays in sync with the rendered slot
    let cellTop: number | null = null;
    for (const slot of slots.values()) {
      if (slot.rowIndex === row) {
        cellTop = slot.translateY;
        break;
      }
    }

    // If row isn't in a visible slot, don't show the fill handle
    if (cellTop === null) return null;

    const cellLeft = columnPositions[col] ?? 0;
    const cellWidth = columns[col]?.width ?? 0;

    return {
      top: cellTop + rowHeight - 5,
      left: cellLeft + cellWidth - 20, // Move significantly left to avoid scrollbar overlap
    };
  }, [state.activeCell, state.selectionRange, state.slots, rowHeight, columnPositions, columns]);

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
      onWheel={handleWheel}
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
                const inFillPreview = isInFillPreview(slot.rowIndex, colIndex);

                const cellClasses = [
                  "gp-grid-cell",
                  active && "gp-grid-cell--active",
                  selected && !active && "gp-grid-cell--selected",
                  isEditing && "gp-grid-cell--editing",
                  inFillPreview && "gp-grid-cell--fill-preview",
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
                    onMouseDown={(e) => handleCellMouseDown(slot.rowIndex, colIndex, e)}
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
    </div>
  );
}
