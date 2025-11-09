// src/renderers/domRenderer.ts
import type { GridEngine, CellInfo, HeaderCellInfo, ColumnDefinition, GridOptions, HeaderRenderer, CellRenderer, EditRenderer } from "../GridEngine";

// Debounce helper: delays function execution until after wait time has elapsed
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => func.apply(this, args), wait);
  };
}

// Renderer resolution helpers: priority is column inline > column key > global
function resolveHeaderRenderer(column: ColumnDefinition, opts: GridOptions): HeaderRenderer | undefined {
  if (typeof column.headerRenderer === 'function') {
    return column.headerRenderer; // Column inline renderer
  }
  if (typeof column.headerRenderer === 'string' && opts.headerRenderers) {
    return opts.headerRenderers[column.headerRenderer]; // Column key → registry lookup
  }
  return opts.headerRenderer; // Global default
}

function resolveCellRenderer(column: ColumnDefinition, opts: GridOptions): CellRenderer | undefined {
  if (typeof column.cellRenderer === 'function') {
    return column.cellRenderer; // Column inline renderer
  }
  if (typeof column.cellRenderer === 'string' && opts.cellRenderers) {
    return opts.cellRenderers[column.cellRenderer]; // Column key → registry lookup
  }
  return opts.cellRenderer; // Global default
}

function resolveEditRenderer(column: ColumnDefinition, opts: GridOptions): EditRenderer | undefined {
  if (typeof column.editRenderer === 'function') {
    return column.editRenderer; // Column inline renderer
  }
  if (typeof column.editRenderer === 'string' && opts.editRenderers) {
    return opts.editRenderers[column.editRenderer]; // Column key → registry lookup
  }
  return opts.editRenderer; // Global default
}

export function attachDomRenderer(container: HTMLElement, engine: GridEngine) {
  // Inject CSS classes for cell styling (fixes Firefox border rendering issues)
  const style = document.createElement("style");
  style.textContent = `
    .gp-grid-cell {
      position: absolute;
      box-sizing: border-box;
      padding: 0 8px;
      display: flex;
      align-items: center;
      cursor: cell;
      color: #000;
      overflow: hidden;
    }
    .gp-grid-cell-default {
      border: 1px solid #ddd;
      background-color: #FAFAFA;
    }
    .gp-grid-cell-active {
      border: 2px solid #0078D4;
      background-color: #F0F8FF;
      outline: none;
    }
    .gp-grid-cell-selected {
      border: 1px solid #0078D4;
      background-color: #E6F2FF;
    }
    .gp-grid-cell-fill-range {
      border: 1px solid #0078D4;
      background-color: #B3D9FF;
    }
  `;
  container.appendChild(style);

  // style container
  container.style.position = "relative";
  container.style.overflow = "auto";
  container.tabIndex = 0; // Make container focusable for keyboard events
  container.style.outline = "none"; // Remove focus outline

  // Header container (sticky position, stays at top when scrolling)
  const totalHeaderHeight = engine.showFilters
    ? engine.headerHeight * 2
    : engine.headerHeight;
  const headerContainer = document.createElement("div");
  headerContainer.style.position = "sticky";
  headerContainer.style.top = "0";
  headerContainer.style.left = "0";
  headerContainer.style.width = "100%"; // Take full width of parent container
  headerContainer.style.height = totalHeaderHeight + "px";
  headerContainer.style.overflow = "hidden"; // Hide overflow for horizontal scrolling
  headerContainer.style.backgroundColor = "#f5f5f5";
  headerContainer.style.color = "#000";
  headerContainer.style.borderBottom = "2px solid #ccc";
  headerContainer.style.zIndex = "100";
  headerContainer.style.isolation = "isolate"; // Create new stacking context
  headerContainer.style.pointerEvents = "auto"; // Ensure header captures all pointer events
  container.appendChild(headerContainer);

  // Inner header content container - this will be scrolled
  const headerInner = document.createElement("div");
  headerInner.style.position = "relative";
  headerInner.style.width = engine.totalWidth + "px"; // Match total grid width
  headerInner.style.height = totalHeaderHeight + "px";
  headerContainer.appendChild(headerInner);

  // big inner content to make scrollbar correct
  const inner = document.createElement("div");
  inner.style.position = "relative";
  inner.style.width = engine.totalWidth + "px";
  inner.style.height = engine.totalHeight + "px";
  inner.style.zIndex = "1"; // Ensure cells stay below header (z-index: 100)
  inner.style.isolation = "isolate"; // Create separate stacking context for cells
  container.appendChild(inner);

  const cellPool: HTMLDivElement[] = [];
  const headerPool: HTMLDivElement[] = [];
  const filterPool: HTMLInputElement[] = [];

  // Track cleanup functions for custom renderers
  const cellCleanupMap = new Map<string, () => void>();
  const headerCleanupMap = new Map<number, () => void>();

  // Edit input overlay
  let editInput: HTMLInputElement | null = null;

  // Fill handle element (Excel-like drag handle)
  let fillHandle: HTMLDivElement | null = null;
  let isDraggingFillHandle = false;

  // Auto-scroll state for fill handle drag
  let autoScrollAnimationId: number | null = null;
  let lastMouseYClient = 0; // Track last mouse Y position (clientY) for auto-scroll
  let accumulatedScroll = 0; // Virtual scroll that accumulates beyond physical boundaries

  // Auto-scroll constants
  const AUTO_SCROLL_ZONE = 50; // pixels from edge to trigger auto-scroll
  const MAX_SCROLL_SPEED = 20; // max pixels per frame

  engine.onRender((cells: CellInfo[], headers: HeaderCellInfo[]) => {
    // Update header cells
    while (headerPool.length < headers.length) {
      const headerCell = document.createElement("div");
      headerCell.style.position = "absolute";
      headerCell.style.border = "1px solid #ccc";
      headerCell.style.boxSizing = "border-box";
      headerCell.style.fontWeight = "bold";
      headerCell.style.cursor = "pointer";
      headerCell.style.userSelect = "none";
      headerCell.style.display = "flex";
      headerCell.style.alignItems = "center";
      headerCell.style.padding = "0 8px";
      headerCell.style.backgroundColor = "#f5f5f5";
      headerCell.style.color = "#000";
      headerCell.style.overflow = "hidden";

      // Attach click handler ONCE when creating the cell
      headerCell.onclick = async (event: MouseEvent) => {
        const colId = headerCell.dataset.colId;
        if (!colId) return;

        const currentSort = engine
          .getSortModel()
          .find((s) => s.colId === colId);
        const currentDirection = currentSort?.direction;
        const newDirection =
          currentDirection === "asc"
            ? "desc"
            : currentDirection === "desc"
              ? null
              : "asc";

        await engine.setSort(colId, newDirection, event.shiftKey);
        // update() is now called automatically by engine.onRefresh callback
      };

      headerInner.appendChild(headerCell);
      headerPool.push(headerCell);
    }

    headers.forEach((h, i) => {
      const headerCell = headerPool[i]!;
      headerCell.style.left = h.x + "px";
      headerCell.style.top = "0px";
      headerCell.style.width = h.width + "px";
      headerCell.style.height = h.height + "px";
      headerCell.style.display = "flex"; // Ensure visible headers are shown

      // Store colId in dataset so click handler can access it
      headerCell.dataset.colId = h.column.colId || h.column.field;

      // Resolve header renderer with priority: column inline > column key > global
      const opts = engine.getOptions();
      const headerRenderer = resolveHeaderRenderer(h.column, opts);

      // Clean up previous custom render if exists
      const cleanup = headerCleanupMap.get(h.col);
      if (cleanup) {
        cleanup();
        headerCleanupMap.delete(h.col);
      }

      if (headerRenderer) {
        // Use custom renderer
        headerCell.textContent = ""; // Clear default content
        const cleanupFn = headerRenderer(headerCell, {
          column: h.column,
          colIndex: h.col,
          sortDirection: h.sortDirection,
          sortIndex: h.sortIndex,
        });
        if (cleanupFn) {
          headerCleanupMap.set(h.col, cleanupFn);
        }
      } else {
        // Build sort indicator with priority number for multi-sort
        let sortIndicator = "";
        if (h.sortDirection) {
          const arrow = h.sortDirection === "asc" ? "▲" : "▼";
          // Show priority number only when sorting by multiple columns
          const sortModel = engine.getSortModel();
          const priority =
            sortModel.length > 1 && h.sortIndex ? String(h.sortIndex) : "";
          sortIndicator = ` ${priority}${arrow}`;
        }
        headerCell.textContent =
          (h.column.headerName || h.column.field) + sortIndicator;
      }
    });

    // Hide unused headers in the pool
    for (let i = headers.length; i < headerPool.length; i++) {
      headerPool[i]!.style.display = "none";
    }

    // Update filter inputs if showFilters is enabled
    if (engine.showFilters) {
      while (filterPool.length < headers.length) {
        const filterInput = document.createElement("input");
        filterInput.type = "text";
        filterInput.style.position = "absolute";
        filterInput.style.boxSizing = "border-box";
        filterInput.style.border = "1px solid #ccc";
        filterInput.style.padding = "0 8px";
        filterInput.placeholder = "Filter...";

        // Attach debounced handler ONCE when creating the input
        // Use filterDebounce option with default of 500ms for large datasets
        const debounceDelay = (engine as any).opts.filterDebounce ?? 500;
        const debouncedFilter = debounce(async () => {
          const colId = filterInput.dataset.colId;
          if (!colId) return;
          await engine.setFilter(colId, filterInput.value);
          // update() is now called automatically by engine.onRefresh callback
        }, debounceDelay);

        filterInput.oninput = debouncedFilter;
        headerInner.appendChild(filterInput);
        filterPool.push(filterInput);
      }

      headers.forEach((h, i) => {
        const filterInput = filterPool[i]!;
        filterInput.style.left = h.x + "px";
        filterInput.style.top = engine.headerHeight + "px";
        filterInput.style.width = h.width + "px";
        filterInput.style.height = engine.headerHeight + "px";
        filterInput.style.display = "block"; // Ensure visible filters are shown

        // Store colId in dataset so handler can access it
        filterInput.dataset.colId = h.column.colId || h.column.field;
      });

      // Hide unused filter inputs in the pool
      for (let i = headers.length; i < filterPool.length; i++) {
        filterPool[i]!.style.display = "none";
      }
    }

    // ensure pool size for data cells
    while (cellPool.length < cells.length) {
      const cell = document.createElement("div");
      cell.className = "gp-grid-cell gp-grid-cell-default";
      cell.tabIndex = -1; // Make focusable for keyboard navigation
      // Enforce strict clipping of child content
      cell.style.maxWidth = "100%";

      // Attach click handler ONCE when creating the cell
      cell.onclick = () => {
        const row = parseInt(cell.dataset.row ?? "0", 10);
        const col = parseInt(cell.dataset.col ?? "0", 10);
        engine.setActiveCell(row, col);
        update();
      };

      // Attach double-click handler to start editing
      cell.ondblclick = () => {
        const row = parseInt(cell.dataset.row ?? "0", 10);
        const col = parseInt(cell.dataset.col ?? "0", 10);
        engine.startEdit(row, col);
        update();
      };

      inner.appendChild(cell);
      cellPool.push(cell);
    }
    // Check if we're in fill drag mode and get the fill range
    const fillHandleState = engine.getFillHandleState();
    const isFillDragging = fillHandleState !== null;

    // Get options and processed data
    const opts = engine.getOptions();
    const processedData = engine.getProcessedData();

    // update cell positions & content
    cells.forEach((c, i) => {
      const cell = cellPool[i];
      cell!.style.left = c.x + "px";
      cell!.style.top = c.y + "px";
      cell!.style.width = c.width + "px";
      cell!.style.height = c.height + "px";

      // Get OLD position from dataset BEFORE updating (for cleanup)
      const oldRow = cell!.dataset.row;
      const oldCol = cell!.dataset.col;
      const oldCellKey = oldRow !== undefined && oldCol !== undefined
        ? `${oldRow}-${oldCol}`
        : null;

      // Generate NEW cell key
      const newCellKey = `${c.row}-${c.col}`;

      // Check if cell position actually changed
      const positionChanged = oldCellKey !== null && oldCellKey !== newCellKey;

      // Debug logging
      // Clean up old position if this cell moved to a new position
      if (oldCellKey && positionChanged) {
        const oldCleanup = cellCleanupMap.get(oldCellKey);
        if (oldCleanup) {
          oldCleanup();
          cellCleanupMap.delete(oldCellKey);
        }
      }

      // NOW update dataset to NEW position (only if changed)
      if (positionChanged) {
        cell!.dataset.row = String(c.row);
        cell!.dataset.col = String(c.col);
      }

      // Check if cell is in fill range
      let isInFillRange = false;
      if (isFillDragging && fillHandleState) {
        const minRow = Math.min(
          fillHandleState.sourceRow,
          fillHandleState.targetRow,
        );
        const maxRow = Math.max(
          fillHandleState.sourceRow,
          fillHandleState.targetRow,
        );
        isInFillRange =
          c.row >= minRow &&
          c.row <= maxRow &&
          c.col === fillHandleState.sourceCol;
      }

      // Apply selection styling with priority: fill range > active > selected > default
      if (isInFillRange) {
        cell!.className = "gp-grid-cell gp-grid-cell-fill-range";
        cell!.style.zIndex = "3";
      } else if (c.isActive) {
        cell!.className = "gp-grid-cell gp-grid-cell-active";
        cell!.style.zIndex = "5";
      } else if (c.isSelected) {
        cell!.className = "gp-grid-cell gp-grid-cell-selected";
        cell!.style.zIndex = "1";
      } else {
        cell!.className = "gp-grid-cell gp-grid-cell-default";
        cell!.style.zIndex = "0";
      }
      cell!.id = `gp-grid-cell-${c.row}-${c.col}`;
      // Resolve cell renderer with priority: column inline > column key > global
      const cellRenderer = resolveCellRenderer(c.column, opts);

      // Show/hide content based on edit state
      if (c.isEditing) {
        cell!.innerHTML = ""; // Use innerHTML to clear safely
        cell!.style.padding = "0"; // Remove padding when editing
      } else {
        if (cellRenderer) {
          // Use custom renderer - always call it
          cell!.style.padding = "0 8px";

          // Clean up existing renderer for this position if it exists
          const existingCleanup = cellCleanupMap.get(newCellKey);
          if (existingCleanup) {
            existingCleanup();
            cellCleanupMap.delete(newCellKey);
          }

          // Clear text content if present
          if (cell!.textContent && !cell!.hasChildNodes()) {
            cell!.textContent = "";
          }

          // Get full row data for custom renderer
          const rowData = processedData[c.row];
          const cleanupFn = cellRenderer(cell!, {
            value: c.value,
            rowData,
            column: c.column,
            rowIndex: c.row,
            colIndex: c.col,
          });
          
          if (cleanupFn) {
            cellCleanupMap.set(newCellKey, cleanupFn);
          }
        } else {
          // Default text rendering
          cell!.textContent = String(c.value ?? "");
          cell!.style.padding = "0 8px";
        }
      }

      cell!.style.display = "flex"; // Ensure visible cells are shown
    });

    // Hide unused cells in the pool and clean up their renderers
    for (let i = cells.length; i < cellPool.length; i++) {
      const cell = cellPool[i]!;
      cell.style.display = "none";

      // Clean up any custom renderer for this hidden cell
      // Use dataset to find the cleanup key
      const row = cell.dataset.row;
      const col = cell.dataset.col;
      if (row !== undefined && col !== undefined) {
        const cellKey = `${row}-${col}`;
        const cleanup = cellCleanupMap.get(cellKey);
        if (cleanup) {
          cleanup();
          cellCleanupMap.delete(cellKey);
        }
      }
    }

    // Handle edit input
    const editState = engine.getEditState();

    if (editState) {
      const editCell = cells.find(
        (c) => c.row === editState.row && c.col === editState.col,
      );

      if (editCell) {
        // Resolve edit renderer with priority: column inline > column key > global
        const editRenderer = resolveEditRenderer(editCell.column, opts);

        if (editRenderer) {
          // Use custom edit renderer
          if (!editInput) {
            editInput = document.createElement("input");
            editInput.type = "text";
            editInput.style.position = "absolute";
            editInput.style.boxSizing = "border-box";
            editInput.style.border = "2px solid #0078D4";
            editInput.style.padding = "0 8px";
            editInput.style.outline = "none";
            editInput.style.zIndex = "10";
            editInput.style.fontSize = "inherit";
            editInput.style.fontFamily = "inherit";
            inner.appendChild(editInput);
          }

          editInput.style.left = editCell.x + "px";
          editInput.style.top = editCell.y + "px";
          editInput.style.width = editCell.width + "px";
          editInput.style.height = editCell.height + "px";
          editInput.style.display = "block";
          editInput.textContent = ""; // Clear default content

          // Get full row data
          const rowData = processedData[editState.row];
          const cleanupFn = editRenderer(editInput, {
            value: editCell.value,
            rowData,
            column: editCell.column,
            rowIndex: editState.row,
            colIndex: editState.col,
            initialValue: editState.value,
            onValueChange: (newValue: any) => {
              engine.updateEditValue(String(newValue));
            },
            onCommit: async () => {
              await engine.commitEdit();
              update();
            },
            onCancel: () => {
              engine.cancelEdit();
              update();
            },
          });

          // Store cleanup for later
          if (cleanupFn) {
            const editCleanupKey = 'edit';
            const prevCleanup = cellCleanupMap.get(editCleanupKey);
            if (prevCleanup) prevCleanup();
            cellCleanupMap.set(editCleanupKey, cleanupFn);
          }
        } else {
          // Show default edit input
          if (!editInput) {
            editInput = document.createElement("input");
            editInput.type = "text";
            editInput.style.position = "absolute";
            editInput.style.boxSizing = "border-box";
            editInput.style.border = "2px solid #0078D4";
            editInput.style.padding = "0 8px";
            editInput.style.outline = "none";
            editInput.style.zIndex = "10";
            editInput.style.fontSize = "inherit";
            editInput.style.fontFamily = "inherit";

            editInput.onkeydown = async (e: KeyboardEvent) => {
              if (e.key === "Enter") {
                await engine.commitEdit();
                update();
                e.preventDefault();
                e.stopPropagation();
              } else if (e.key === "Escape") {
                engine.cancelEdit();
                update();
                e.preventDefault();
                e.stopPropagation();
              } else if (e.key.startsWith("Arrow")) {
                // Allow arrow keys for cursor navigation in edit mode
                e.stopPropagation();
              }
            };

            editInput.oninput = () => {
              engine.updateEditValue(editInput!.value);
            };

            inner.appendChild(editInput);
          }

          editInput.style.left = editCell.x + "px";
          editInput.style.top = editCell.y + "px";
          editInput.style.width = editCell.width + "px";
          editInput.style.height = editCell.height + "px";
          editInput.value = editState.value;
          editInput.style.display = "block";

          // Focus and select all text
          requestAnimationFrame(() => {
            editInput?.focus();
            editInput?.select();
          });
        }
      } else {
        // Edit cell not visible, hide input
        if (editInput) {
          editInput.style.display = "none";
        }
      }
    } else {
      // No edit state, hide input and cleanup
      if (editInput) {
        editInput.style.display = "none";
        const editCleanupKey = 'edit';
        const prevCleanup = cellCleanupMap.get(editCleanupKey);
        if (prevCleanup) {
          prevCleanup();
          cellCleanupMap.delete(editCleanupKey);
        }
      }
    }

    // Handle fill handle (Excel-like drag to fill)
    const activeCell = engine.getActiveCell();
    if (activeCell && !isDraggingFillHandle) {
      const activeCellInfo = cells.find(
        (c) => c.row === activeCell.row && c.col === activeCell.col,
      );

      // Check if active cell's column is editable
      const columns = (engine as any).opts.columns;
      const activeColumn = columns[activeCell.col];
      const isColumnEditable = activeColumn?.editable === true;

      if (activeCellInfo && isColumnEditable) {
        // Create fill handle if it doesn't exist
        if (!fillHandle) {
          fillHandle = document.createElement("div");
          fillHandle.style.position = "absolute";
          fillHandle.style.width = "8px";
          fillHandle.style.height = "8px";
          fillHandle.style.backgroundColor = "#0078D4";
          fillHandle.style.cursor = "crosshair";
          fillHandle.style.zIndex = "15";
          fillHandle.style.border = "1px solid white";

          // Mouse down on fill handle - start dragging
          fillHandle.onmousedown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const cell = engine.getActiveCell();
            if (cell) {
              // Double-check column is editable before starting drag
              const col = columns[cell.col];
              if (col?.editable === true) {
                isDraggingFillHandle = true;
                engine.startFillDrag(cell.row, cell.col);

                // Attach handlers to document so they work even when mouse is outside container
                document.addEventListener('mousemove', handleMousemove);
                document.addEventListener('mouseup', handleMouseup);
              }
            }
          };

          inner.appendChild(fillHandle);
        }

        // Position fill handle at bottom-right corner of active cell
        fillHandle.style.left =
          activeCellInfo.x + activeCellInfo.width - 4 + "px";
        fillHandle.style.top =
          activeCellInfo.y + activeCellInfo.height - 4 + "px";
        fillHandle.style.display = "block";
      } else {
        // Active cell not visible or column not editable, hide fill handle
        if (fillHandle) {
          fillHandle.style.display = "none";
        }
      }
    } else {
      // No active cell, hide fill handle
      if (fillHandle) {
        fillHandle.style.display = "none";
      }
    }
  });

  // Helper function to scroll cell into view
  function scrollToCell(row: number, col: number) {
    const opts = engine.getOptions();
    const rowHeight = opts.rowHeight;
    const columns = opts.columns;

    // Cell position in container coordinates (constant offset = totalHeaderHeight)
    // Cells are always positioned after the header, regardless of sticky state
    const cellTop = totalHeaderHeight + row * rowHeight;
    const cellBottom = cellTop + rowHeight;

    // Get column position from engine's columnPositions
    const columnPositions = engine.getColumnPositions();
    const colLeft = columnPositions[col]!;
    const colRight = colLeft + columns[col]!.width;

    // Visible content range: sticky header covers the top totalHeaderHeight pixels
    const visibleTop = container.scrollTop + totalHeaderHeight;
    const visibleBottom = container.scrollTop + container.clientHeight;

    // Calculate max scrollable position
    const maxScrollTop = container.scrollHeight - container.clientHeight;

    if (cellTop < visibleTop) {
      // Scroll up: position cell top just below sticky header
      container.scrollTop = Math.max(0, cellTop - totalHeaderHeight);
    } else if (cellBottom > visibleBottom) {
      // Scroll down: position cell bottom at viewport bottom
      container.scrollTop = Math.min(
        cellBottom - container.clientHeight,
        maxScrollTop,
      );
    }

    // Horizontal scroll
    const visibleLeft = container.scrollLeft;
    const visibleRight = container.scrollLeft + container.clientWidth;

    if (colLeft < visibleLeft) {
      container.scrollLeft = colLeft;
    } else if (colRight > visibleRight) {
      container.scrollLeft = colRight - container.clientWidth;
    }
  }

  const update = () => {
    const rect = container.getBoundingClientRect();

    // Sync header horizontal scroll by setting scrollLeft directly
    // This ensures pixel-perfect alignment with the body content
    headerContainer.scrollLeft = container.scrollLeft;
    // Update header inner width to match total grid width
    headerInner.style.width = engine.totalWidth + "px";
    // Update inner height to reflect filtered data
    inner.style.height = engine.totalHeight + "px";

    // Convert container scroll to data-relative scroll
    // Data content starts at totalHeaderHeight offset, so subtract it
    const dataScrollTop = Math.max(0, container.scrollTop - totalHeaderHeight);

    engine.computeVisible(
      dataScrollTop,
      container.scrollLeft,
      rect.width,
      rect.height,
    );
  };

  // Register callbacks
  engine.onRefresh(update);
  engine.onSelectionChange(() => {
    const activeCell = engine.getActiveCell();
    if (activeCell) {
      scrollToCell(activeCell.row, activeCell.col);
    }
    update();
  });

  // Auto-scroll helper functions for fill handle drag
  function stopAutoScroll() {
    if (autoScrollAnimationId !== null) {
      cancelAnimationFrame(autoScrollAnimationId);
      autoScrollAnimationId = null;
    }
    accumulatedScroll = 0;
  }

  function startAutoScroll() {
    // Stop any existing auto-scroll first
    stopAutoScroll();

    // Reset accumulated scroll
    accumulatedScroll = 0;

    const opts = engine.getOptions();
    const rowHeight = opts.rowHeight;

    const autoScrollLoop = () => {
      if (!isDraggingFillHandle) {
        stopAutoScroll();
        return;
      }

      const rect = container.getBoundingClientRect();
      const mouseYRelativeToViewport = lastMouseYClient - rect.top;
      const viewportHeight = rect.height;

      // Calculate distance from edges
      const distanceFromTop = mouseYRelativeToViewport - totalHeaderHeight;
      const distanceFromBottom = viewportHeight - mouseYRelativeToViewport;

      let scrollDelta = 0;

      // Check if in auto-scroll zone at top or above viewport
      if (distanceFromTop < AUTO_SCROLL_ZONE) {
        if (distanceFromTop > 0) {
          // Mouse is within the auto-scroll zone near top
          const intensity = 1 - distanceFromTop / AUTO_SCROLL_ZONE;
          scrollDelta = -Math.ceil(intensity * MAX_SCROLL_SPEED);
        } else {
          // Mouse is above viewport - scroll up at max speed
          scrollDelta = -MAX_SCROLL_SPEED;
        }
      }
      // Check if in auto-scroll zone at bottom or below viewport
      else if (distanceFromBottom < AUTO_SCROLL_ZONE) {
        if (distanceFromBottom > 0) {
          // Mouse is within the auto-scroll zone near bottom
          const intensity = 1 - distanceFromBottom / AUTO_SCROLL_ZONE;
          scrollDelta = Math.ceil(intensity * MAX_SCROLL_SPEED);
        } else {
          // Mouse is below viewport - scroll down at max speed
          scrollDelta = MAX_SCROLL_SPEED;
        }
      }

      // Apply scroll if needed
      if (scrollDelta !== 0) {
        const maxScrollTop = container.scrollHeight - container.clientHeight;
        const oldScrollTop = container.scrollTop;
        const newScrollTop = Math.max(
          0,
          Math.min(container.scrollTop + scrollDelta, maxScrollTop),
        );

        // Apply physical scroll (will stop at boundary)
        container.scrollTop = newScrollTop;

        // Calculate how much scroll was actually applied
        const actualScrollDelta = container.scrollTop - oldScrollTop;

        // Accumulate only the scroll that couldn't be applied (hit boundary)
        const unboundedScrollDelta = scrollDelta - actualScrollDelta;
        accumulatedScroll += unboundedScrollDelta;
      }

      // Calculate target row based on mouse position
      // When mouse is within viewport, calculate based on actual position
      // When mouse is outside viewport, keep extending in that direction
      let targetRow: number;
      if (distanceFromBottom < 0) {
        // Mouse is below viewport - calculate row based on how far below
        const mouseDistanceBelowViewport = -distanceFromBottom;
        const rowsBeyondViewport = Math.ceil(mouseDistanceBelowViewport / rowHeight);
        const lastVisibleRow = Math.floor((container.scrollTop + viewportHeight - totalHeaderHeight) / rowHeight);
        targetRow = lastVisibleRow + rowsBeyondViewport;
      } else if (distanceFromTop < 0) {
        // Mouse is above viewport - calculate row based on how far above
        const mouseDistanceAboveViewport = -distanceFromTop;
        const rowsAboveViewport = Math.ceil(mouseDistanceAboveViewport / rowHeight);
        const firstVisibleRow = Math.floor(container.scrollTop / rowHeight);
        targetRow = firstVisibleRow - rowsAboveViewport;
      } else {
        // Mouse is within viewport - use normal calculation
        const mouseY = mouseYRelativeToViewport - totalHeaderHeight + container.scrollTop;
        targetRow = Math.floor(mouseY / rowHeight);
      }

      // Update fill drag state with new target row
      const fillState = engine.getFillHandleState();
      if (fillState) {
        engine.updateFillDrag(targetRow, fillState.sourceCol);
        update();
      }

      // Continue the loop
      autoScrollAnimationId = requestAnimationFrame(autoScrollLoop);
    };

    // Start the loop
    autoScrollAnimationId = requestAnimationFrame(autoScrollLoop);
  }

  // Keyboard navigation handler
  const handleKeydown = (e: KeyboardEvent) => {
    const activeCell = engine.getActiveCell();
    const editState = engine.getEditState();

    // If in edit mode, only handle Esc/Enter (already handled in editInput)
    if (editState) {
      return;
    }

    // Handle navigation keys
    const extend = e.shiftKey;

    switch (e.key) {
      case "ArrowUp":
        engine.moveSelection("up", extend);
        e.preventDefault();
        break;
      case "ArrowDown":
        engine.moveSelection("down", extend);
        e.preventDefault();
        break;
      case "ArrowLeft":
        engine.moveSelection("left", extend);
        e.preventDefault();
        break;
      case "ArrowRight":
        engine.moveSelection("right", extend);
        e.preventDefault();
        break;
      case "Tab":
        engine.moveSelection(e.shiftKey ? "left" : "right", false);
        e.preventDefault();
        break;
      case "Enter":
        if (activeCell) {
          engine.startEdit(activeCell.row, activeCell.col);
          e.preventDefault();
        }
        break;
      default:
        // Printable character - start edit
        if (
          e.key.length === 1 &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          activeCell
        ) {
          engine.startEdit(activeCell.row, activeCell.col);
          // Don't prevent default so the character gets typed
        }
    }
  };

  // Fill handle drag handlers
  const handleMousemove = (e: MouseEvent) => {
    if (!isDraggingFillHandle) return;

    // Track mouse Y position for auto-scroll
    lastMouseYClient = e.clientY;

    // Calculate which cell the mouse is over
    const rect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const scrollLeft = container.scrollLeft;
    const opts = engine.getOptions();
    const rowHeight = opts.rowHeight;
    const columnPositions = engine.getColumnPositions();

    // Check if mouse is near viewport edges for auto-scroll
    const mouseYRelativeToViewport = e.clientY - rect.top;
    const viewportHeight = rect.height;
    const distanceFromTop = mouseYRelativeToViewport - totalHeaderHeight;
    const distanceFromBottom = viewportHeight - mouseYRelativeToViewport;

    // Allow auto-scroll when:
    // - Mouse is near top edge (within AUTO_SCROLL_ZONE pixels below header)
    // - Mouse is near bottom edge (within AUTO_SCROLL_ZONE pixels from bottom)
    // - Mouse is below the viewport (for continuing to scroll down)
    // - Mouse is above the viewport header (for continuing to scroll up)
    const isNearTopEdge =
      distanceFromTop < AUTO_SCROLL_ZONE && distanceFromTop > 0;
    const isNearBottomEdge =
      distanceFromBottom < AUTO_SCROLL_ZONE && distanceFromBottom > 0;
    const isBelowViewport = mouseYRelativeToViewport > viewportHeight;
    const isAboveContent = mouseYRelativeToViewport < totalHeaderHeight;

    // Start or stop auto-scroll based on mouse position
    if (
      isNearTopEdge ||
      isNearBottomEdge ||
      isBelowViewport ||
      isAboveContent
    ) {
      if (autoScrollAnimationId === null) {
        startAutoScroll();
      }
    } else {
      stopAutoScroll();
    }

    // Get mouse position relative to grid content (accounting for scroll and header)
    const mouseX = e.clientX - rect.left + scrollLeft;
    const mouseY = e.clientY - rect.top + scrollTop - totalHeaderHeight;

    // Find column
    let targetCol = 0;
    for (let i = 0; i < columnPositions.length - 1; i++) {
      if (mouseX >= columnPositions[i]! && mouseX < columnPositions[i + 1]!) {
        targetCol = i;
        break;
      }
    }

    // Find row
    const targetRow = Math.floor(mouseY / rowHeight);

    // Update fill drag state (only if not auto-scrolling, otherwise auto-scroll loop handles it)
    if (autoScrollAnimationId === null) {
      engine.updateFillDrag(targetRow, targetCol);
      update();
    }
  };

  const handleMouseup = async (_: MouseEvent) => {
    if (!isDraggingFillHandle) return;

    // Stop auto-scroll if active
    stopAutoScroll();

    isDraggingFillHandle = false;

    // Remove document-level handlers
    document.removeEventListener('mousemove', handleMousemove);
    document.removeEventListener('mouseup', handleMouseup);

    await engine.commitFillDrag();
    update();
  };

  // Store click handler reference for cleanup
  const handleClick = () => {
    if (document.activeElement !== container) {
      container.focus();
    }
  };

  container.addEventListener("keydown", handleKeydown);
  container.addEventListener("mousemove", handleMousemove);
  container.addEventListener("mouseup", handleMouseup);
  container.addEventListener("scroll", update);
  container.addEventListener("click", handleClick);
  window.addEventListener("resize", update);
  update();

  return () => {
    // Stop any active auto-scroll
    stopAutoScroll();

    // Clean up all custom renderers
    cellCleanupMap.forEach((cleanup) => cleanup());
    cellCleanupMap.clear();
    headerCleanupMap.forEach((cleanup) => cleanup());
    headerCleanupMap.clear();

    container.removeEventListener("keydown", handleKeydown);
    container.removeEventListener("mousemove", handleMousemove);
    container.removeEventListener("mouseup", handleMouseup);
    container.removeEventListener("scroll", update);
    container.removeEventListener("click", handleClick);
    window.removeEventListener("resize", update);
    container.innerHTML = "";
  };
}
