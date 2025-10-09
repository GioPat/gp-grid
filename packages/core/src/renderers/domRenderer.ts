// src/renderers/domRenderer.ts
import type { GridEngine, CellInfo, HeaderCellInfo } from "../GridEngine";

// Debounce helper: delays function execution until after wait time has elapsed
function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;
  return function (this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => func.apply(this, args), wait);
  };
}

export function attachDomRenderer(container: HTMLElement, engine: GridEngine) {
  // style container
  container.style.position = "relative";
  container.style.overflow = "auto";

  // Header container (sticky position, stays at top when scrolling)
  const totalHeaderHeight = engine.showFilters ? engine.headerHeight * 2 : engine.headerHeight;
  const headerContainer = document.createElement("div");
  headerContainer.style.position = "sticky";
  headerContainer.style.top = "0";
  headerContainer.style.left = "0";
  headerContainer.style.height = totalHeaderHeight + "px";
  headerContainer.style.overflow = "hidden";
  headerContainer.style.backgroundColor = "#f5f5f5";
  headerContainer.style.borderBottom = "2px solid #ccc";
  headerContainer.style.zIndex = "10";
  container.appendChild(headerContainer);

  // big inner content to make scrollbar correct
  const inner = document.createElement("div");
  inner.style.position = "relative";
  inner.style.width = engine.totalWidth + "px";
  inner.style.height = engine.totalHeight + "px";
  container.appendChild(inner);

  const cellPool: HTMLDivElement[] = [];
  const headerPool: HTMLDivElement[] = [];
  const filterPool: HTMLInputElement[] = [];

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
      headerCell.style.backgroundColor = "black";

      // Attach click handler ONCE when creating the cell
      headerCell.onclick = (event: MouseEvent) => {
        const colId = headerCell.dataset.colId;
        if (!colId) return;

        const currentSort = engine.getSortModel().find((s) => s.colId === colId);
        const currentDirection = currentSort?.direction;
        const newDirection =
          currentDirection === "asc"
            ? "desc"
            : currentDirection === "desc"
              ? null
              : "asc";

        engine.setSort(colId, newDirection, event.shiftKey);
        update();
      };

      headerContainer.appendChild(headerCell);
      headerPool.push(headerCell);
    }

    headers.forEach((h, i) => {
      const headerCell = headerPool[i]!;
      headerCell.style.left = h.x + "px";
      headerCell.style.top = "0px";
      headerCell.style.width = h.width + "px";
      headerCell.style.height = h.height + "px";

      // Store colId in dataset so click handler can access it
      headerCell.dataset.colId = h.column.colId || h.column.field;

      // Build sort indicator with priority number for multi-sort
      let sortIndicator = "";
      if (h.sortDirection) {
        const arrow = h.sortDirection === "asc" ? "▲" : "▼";
        // Show priority number only when sorting by multiple columns
        const sortModel = engine.getSortModel();
        const priority = sortModel.length > 1 && h.sortIndex ? String(h.sortIndex) : "";
        sortIndicator = ` ${priority}${arrow}`;
      }
      headerCell.textContent =
        (h.column.headerName || h.column.field) + sortIndicator;
    });

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
        const debouncedFilter = debounce(() => {
          const colId = filterInput.dataset.colId;
          if (!colId) return;
          engine.setFilter(colId, filterInput.value);
          update();
        }, 300);

        filterInput.oninput = debouncedFilter;
        headerContainer.appendChild(filterInput);
        filterPool.push(filterInput);
      }

      headers.forEach((h, i) => {
        const filterInput = filterPool[i]!;
        filterInput.style.left = h.x + "px";
        filterInput.style.top = engine.headerHeight + "px";
        filterInput.style.width = h.width + "px";
        filterInput.style.height = engine.headerHeight + "px";

        // Store colId in dataset so handler can access it
        filterInput.dataset.colId = h.column.colId || h.column.field;
      });
    }

    // ensure pool size for data cells
    while (cellPool.length < cells.length) {
      const cell = document.createElement("div");
      cell.style.position = "absolute";
      cell.style.border = "1px solid #ddd";
      cell.style.boxSizing = "border-box";
      cell.style.padding = "0 8px";
      cell.style.display = "flex";
      cell.style.alignItems = "center";
      inner.appendChild(cell);
      cellPool.push(cell);
    }
    // update cell positions & content
    cells.forEach((c, i) => {
      const cell = cellPool[i];
      cell!.style.left = c.x + "px";
      cell!.style.top = c.y + "px";
      cell!.style.width = c.width + "px";
      cell!.style.height = c.height + "px";
      cell!.textContent = String(c.value ?? "");
    });
  });

  const update = () => {
    const rect = container.getBoundingClientRect();
    // Sync header horizontal scroll
    headerContainer.style.transform = `translateX(-${container.scrollLeft}px)`;
    headerContainer.style.width = engine.totalWidth + "px";
    // Update inner height to reflect filtered data
    inner.style.height = engine.totalHeight + "px";
    engine.computeVisible(
      container.scrollTop,
      container.scrollLeft,
      rect.width,
      rect.height,
    );
  };

  container.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  update();

  return () => {
    container.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
    container.innerHTML = "";
  };
}
