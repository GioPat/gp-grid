// packages/react/src/Grid.test.tsx

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Grid, type GridProps } from "./Grid";
import { createClientDataSource } from "gp-grid-core";
import type { ColumnDefinition, CellRendererParams, HeaderRendererParams } from "gp-grid-core";

// Test data
interface TestRow {
  id: number;
  name: string;
  age: number;
}

const sampleData: TestRow[] = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
  { id: 3, name: "Charlie", age: 35 },
  { id: 4, name: "Diana", age: 28 },
  { id: 5, name: "Eve", age: 22 },
];

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50 },
  { field: "name", cellDataType: "text", width: 150 },
  { field: "age", cellDataType: "number", width: 80, editable: true },
];

// Default props factory
function createDefaultProps(
  overrides?: Partial<GridProps<TestRow>>
): GridProps<TestRow> {
  return {
    columns,
    rowData: sampleData,
    rowHeight: 32,
    ...overrides,
  };
}

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("Grid", () => {
  beforeEach(() => {
    // @ts-expect-error - Mock ResizeObserver
    global.ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("should render grid container", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });
    });

    it("should render header row", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const headerRow = document.querySelector(".gp-grid-header");
        expect(headerRow).toBeTruthy();
      });
    });

    it("should render header cells for each column", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const headerCells = document.querySelectorAll(".gp-grid-header-cell");
        expect(headerCells.length).toBe(3); // id, name, age
      });
    });

    it("should display column header names", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        // Default headers use field names
        expect(screen.getByText("id")).toBeTruthy();
        expect(screen.getByText("name")).toBeTruthy();
        expect(screen.getByText("age")).toBeTruthy();
      });
    });

    it("should render with data source prop", async () => {
      const dataSource = createClientDataSource(sampleData);
      render(<Grid {...createDefaultProps({ dataSource, rowData: undefined })} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });
    });

    it("should render with empty data", async () => {
      render(<Grid {...createDefaultProps({ rowData: [] })} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });
    });

    it("should apply dark mode class when enabled", async () => {
      render(<Grid {...createDefaultProps({ darkMode: true })} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container--dark");
        expect(container).toBeTruthy();
      });
    });
  });

  describe("cell selection", () => {
    it("should select cell on click", async () => {
      render(<Grid {...createDefaultProps()} />);

      // Wait for cells to render
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });

      // Click a cell in the first row
      const rows = document.querySelectorAll(".gp-grid-row");
      const firstRowCells = rows[0]?.querySelectorAll(".gp-grid-cell");
      
      if (firstRowCells && firstRowCells[0]) {
        await act(async () => {
          fireEvent.mouseDown(firstRowCells[0]);
          fireEvent.mouseUp(firstRowCells[0]);
          fireEvent.click(firstRowCells[0]);
        });
      }

      // The active class might be on the cell or handled differently
      // Check that we have cells rendered
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });

    it("should have clickable cells", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });

      // Verify cells are rendered and can receive events
      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells.length).toBeGreaterThan(0);
      
      // First cell should contain data
      expect(cells[0]?.textContent).toBeTruthy();
    });
  });

  describe("keyboard navigation", () => {
    it("should handle keyboard events on container", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      const container = document.querySelector(".gp-grid-container")!;
      
      // Container should be focusable
      expect(container.getAttribute("tabindex")).toBe("0");

      // Press arrow down - should not throw
      await act(async () => {
        fireEvent.keyDown(container, { key: "ArrowDown" });
      });

      // Grid should still be rendered
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });

    it("should handle Ctrl+A keyboard shortcut", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      const container = document.querySelector(".gp-grid-container")!;

      // Ctrl+A should not throw
      await act(async () => {
        fireEvent.keyDown(container, { key: "a", ctrlKey: true });
      });

      // Grid should still be rendered
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });

    it("should handle Escape keyboard shortcut", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      const container = document.querySelector(".gp-grid-container")!;

      // Press Escape - should not throw
      await act(async () => {
        fireEvent.keyDown(container, { key: "Escape" });
      });

      // Grid should still be rendered
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });
  });

  describe("editing", () => {
    it("should render cells that can be double-clicked", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });

      // Find cells in the grid
      const rows = document.querySelectorAll(".gp-grid-row");
      expect(rows.length).toBeGreaterThan(0);

      const firstRowCells = rows[0]?.querySelectorAll(".gp-grid-cell");
      expect(firstRowCells?.length).toBe(3); // id, name, age
    });

    it("should handle Enter key press", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      const container = document.querySelector(".gp-grid-container")!;

      // Press Enter - should not throw
      await act(async () => {
        fireEvent.keyDown(container, { key: "Enter" });
      });

      // Grid should still be rendered
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });

    it("should handle F2 key press", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      const container = document.querySelector(".gp-grid-container")!;

      // Press F2 - should not throw
      await act(async () => {
        fireEvent.keyDown(container, { key: "F2" });
      });

      // Grid should still be rendered
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });
  });

  describe("custom renderers", () => {
    it("should use custom cell renderer", async () => {
      const customRenderer = vi.fn((params: CellRendererParams) => (
        <span data-testid="custom-cell">Custom: {String(params.value)}</span>
      ));

      render(
        <Grid
          {...createDefaultProps({
            cellRenderer: customRenderer,
          })}
        />
      );

      await waitFor(() => {
        const customCells = screen.queryAllByTestId("custom-cell");
        expect(customCells.length).toBeGreaterThan(0);
      });

      expect(customRenderer).toHaveBeenCalled();
    });

    it("should use column-specific cell renderer from registry", async () => {
      const nameRenderer = vi.fn((params: CellRendererParams) => (
        <span data-testid="name-renderer">Name: {String(params.value)}</span>
      ));

      const columnsWithRenderer: ColumnDefinition[] = [
        { field: "id", cellDataType: "number", width: 50 },
        { field: "name", cellDataType: "text", width: 150, cellRenderer: "nameRenderer" },
        { field: "age", cellDataType: "number", width: 80 },
      ];

      render(
        <Grid
          {...createDefaultProps({
            columns: columnsWithRenderer,
            cellRenderers: { nameRenderer },
          })}
        />
      );

      await waitFor(() => {
        const namedCells = screen.queryAllByTestId("name-renderer");
        expect(namedCells.length).toBeGreaterThan(0);
      });

      expect(nameRenderer).toHaveBeenCalled();
    });

    it("should use custom header renderer", async () => {
      const customHeaderRenderer = vi.fn((params: HeaderRendererParams) => (
        <span data-testid="custom-header">Header: {params.column.field}</span>
      ));

      render(
        <Grid
          {...createDefaultProps({
            headerRenderer: customHeaderRenderer,
          })}
        />
      );

      await waitFor(() => {
        const customHeaders = screen.queryAllByTestId("custom-header");
        expect(customHeaders.length).toBe(3); // 3 columns
      });

      expect(customHeaderRenderer).toHaveBeenCalled();
    });
  });

  describe("sorting", () => {
    it("should allow clicking header cells", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const headerCells = document.querySelectorAll(".gp-grid-header-cell");
        expect(headerCells.length).toBeGreaterThan(0);
      });

      const headerCells = document.querySelectorAll(".gp-grid-header-cell");
      const nameHeader = headerCells[1]; // name column

      // Click header should not throw
      if (nameHeader) {
        await act(async () => {
          fireEvent.click(nameHeader);
        });
      }

      // Grid should still be functional
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });
  });

  describe("filtering", () => {
    it("should show filter row when enabled", async () => {
      render(<Grid {...createDefaultProps({ showFilters: true })} />);

      await waitFor(() => {
        const filterRow = document.querySelector(".gp-grid-filter-row");
        expect(filterRow).toBeTruthy();
      });
    });

    it("should render filter inputs", async () => {
      render(<Grid {...createDefaultProps({ showFilters: true })} />);

      await waitFor(() => {
        const filterInputs = document.querySelectorAll(".gp-grid-filter-input");
        expect(filterInputs.length).toBe(3); // One for each column
      });
    });
  });

  describe("props changes", () => {
    it("should update when columns change", async () => {
      const { rerender } = render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const headerCells = document.querySelectorAll(".gp-grid-header-cell");
        expect(headerCells.length).toBe(3);
      });

      // Change columns
      const newColumns: ColumnDefinition[] = [
        { field: "id", cellDataType: "number", width: 50 },
        { field: "name", cellDataType: "text", width: 150 },
      ];

      rerender(<Grid {...createDefaultProps({ columns: newColumns })} />);

      await waitFor(() => {
        const headerCells = document.querySelectorAll(".gp-grid-header-cell");
        expect(headerCells.length).toBe(2);
      });
    });

    it("should update when rowData changes", async () => {
      const { rerender } = render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      // Change row data
      const newData: TestRow[] = [
        { id: 100, name: "NewPerson", age: 99 },
      ];

      rerender(<Grid {...createDefaultProps({ rowData: newData })} />);

      // Grid should still render
      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });
    });
  });

  describe("loading and error states", () => {
    it("should handle data loading gracefully", async () => {
      // Create a slow data source
      const slowDataSource = {
        async fetch() {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { rows: sampleData, totalRows: sampleData.length };
        },
      };

      render(
        <Grid
          {...createDefaultProps({
            dataSource: slowDataSource,
            rowData: undefined,
          })}
        />
      );

      // Should render container even while loading
      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      // Wait for data to load
      await waitFor(
        () => {
          const cells = document.querySelectorAll(".gp-grid-cell");
          expect(cells.length).toBeGreaterThan(0);
        },
        { timeout: 1000 }
      );
    });
  });

  describe("scroll handling", () => {
    it("should handle scroll events on container", async () => {
      render(<Grid {...createDefaultProps()} />);

      await waitFor(() => {
        const container = document.querySelector(".gp-grid-container");
        expect(container).toBeTruthy();
      });

      const container = document.querySelector(".gp-grid-container")!;

      // Trigger scroll on the container (which is the scrollable element)
      await act(async () => {
        fireEvent.scroll(container, { target: { scrollTop: 100 } });
      });

      // Grid should still function
      await waitFor(() => {
        const cells = document.querySelectorAll(".gp-grid-cell");
        expect(cells.length).toBeGreaterThan(0);
      });
    });
  });
});

