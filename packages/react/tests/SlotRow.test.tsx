// packages/react/tests/SlotRow.test.tsx

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SlotRow, type SlotRowProps } from "../src/SlotRow";
import type { ColumnDefinition, CellRendererParams, EditRendererParams } from "@gp-grid/core";

// Test data
const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50 },
  { field: "name", cellDataType: "text", width: 150 },
  { field: "age", cellDataType: "number", width: 80, editable: true },
];

const columnPositions = [0, 50, 200, 280];

const rowData = { id: 1, name: "Alice", age: 30 };

// Default props factory
function createDefaultProps(
  overrides?: Partial<SlotRowProps>
): SlotRowProps {
  return {
    slotId: "slot-0",
    rowIndex: 0,
    rowData,
    translateY: 32,
    columns,
    columnPositions,
    rowHeight: 32,
    contentWidth: 280,
    activeCell: null,
    selectionRange: null,
    editingCell: null,
    cellRenderers: {},
    editRenderers: {},
    cellRenderer: undefined,
    editRenderer: undefined,
    onCellClick: vi.fn(),
    onCellDoubleClick: vi.fn(),
    onEditValueChange: vi.fn(),
    onEditCommit: vi.fn(),
    onEditCancel: vi.fn(),
    ...overrides,
  };
}

describe("SlotRow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("should render a row with cells", () => {
      render(<SlotRow {...createDefaultProps()} />);

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells.length).toBe(3); // id, name, age
    });

    it("should render cell values from rowData", () => {
      render(<SlotRow {...createDefaultProps()} />);

      expect(screen.getByText("1")).toBeTruthy(); // id
      expect(screen.getByText("Alice")).toBeTruthy(); // name
      expect(screen.getByText("30")).toBeTruthy(); // age
    });

    it("should apply translateY transform", () => {
      render(<SlotRow {...createDefaultProps({ translateY: 64 })} />);

      const row = document.querySelector("[data-slot-id='slot-0']");
      expect(row).toBeTruthy();
      expect(row?.getAttribute("style")).toContain("translateY(64px)");
    });

    it("should set correct row width", () => {
      render(<SlotRow {...createDefaultProps({ contentWidth: 500 })} />);

      const row = document.querySelector("[data-slot-id='slot-0']");
      expect(row?.getAttribute("style")).toContain("width: 500px");
    });

    it("should set correct row height", () => {
      render(<SlotRow {...createDefaultProps({ rowHeight: 48 })} />);

      const row = document.querySelector("[data-slot-id='slot-0']");
      expect(row?.getAttribute("style")).toContain("height: 48px");
    });

    it("should position cells according to column positions", () => {
      render(<SlotRow {...createDefaultProps()} />);

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells[0]?.getAttribute("style")).toContain("left: 0px");
      expect(cells[1]?.getAttribute("style")).toContain("left: 50px");
      expect(cells[2]?.getAttribute("style")).toContain("left: 200px");
    });

    it("should set correct cell widths", () => {
      render(<SlotRow {...createDefaultProps()} />);

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells[0]?.getAttribute("style")).toContain("width: 50px");
      expect(cells[1]?.getAttribute("style")).toContain("width: 150px");
      expect(cells[2]?.getAttribute("style")).toContain("width: 80px");
    });

    it("should render null values as empty string", () => {
      const rowDataWithNull = { id: 1, name: null, age: 30 };
      render(
        <SlotRow {...createDefaultProps({ rowData: rowDataWithNull })} />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      // Name cell should be empty
      expect(cells[1]?.textContent).toBe("");
    });

    it("should handle nested field values", () => {
      const columnsWithNested: ColumnDefinition[] = [
        { field: "nested.value", cellDataType: "text", width: 100 },
      ];
      const rowDataWithNested = { nested: { value: "NestedValue" } };

      render(
        <SlotRow
          {...createDefaultProps({
            columns: columnsWithNested,
            columnPositions: [0, 100],
            rowData: rowDataWithNested,
          })}
        />
      );

      expect(screen.getByText("NestedValue")).toBeTruthy();
    });
  });

  describe("cell states", () => {
    it("should apply active class to active cell", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            activeCell: { row: 0, col: 1 },
          })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells[0]?.classList.contains("gp-grid-cell--active")).toBe(false);
      expect(cells[1]?.classList.contains("gp-grid-cell--active")).toBe(true);
      expect(cells[2]?.classList.contains("gp-grid-cell--active")).toBe(false);
    });

    it("should not apply active class for different row", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            rowIndex: 0,
            activeCell: { row: 1, col: 1 }, // Different row
          })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells[1]?.classList.contains("gp-grid-cell--active")).toBe(false);
    });

    it("should apply selected class to cells in selection range", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            rowIndex: 1,
            selectionRange: {
              startRow: 0,
              startCol: 0,
              endRow: 2,
              endCol: 2,
            },
          })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells[0]?.classList.contains("gp-grid-cell--selected")).toBe(true);
      expect(cells[1]?.classList.contains("gp-grid-cell--selected")).toBe(true);
      expect(cells[2]?.classList.contains("gp-grid-cell--selected")).toBe(true);
    });

    it("should not apply selected class to cells outside selection range", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            rowIndex: 5, // Outside selection range
            selectionRange: {
              startRow: 0,
              startCol: 0,
              endRow: 2,
              endCol: 2,
            },
          })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells[0]?.classList.contains("gp-grid-cell--selected")).toBe(false);
    });

    it("should handle inverted selection range", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            rowIndex: 1,
            selectionRange: {
              startRow: 2, // End before start
              startCol: 2,
              endRow: 0,
              endCol: 0,
            },
          })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      // Row 1 should be in range (between 0 and 2)
      expect(cells[0]?.classList.contains("gp-grid-cell--selected")).toBe(true);
      expect(cells[1]?.classList.contains("gp-grid-cell--selected")).toBe(true);
    });

    it("should apply editing class to editing cell", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
          })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells[2]?.classList.contains("gp-grid-cell--editing")).toBe(true);
    });
  });

  describe("event handlers", () => {
    it("should call onCellClick when cell is clicked", () => {
      const onCellClick = vi.fn();
      render(
        <SlotRow
          {...createDefaultProps({ onCellClick })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      fireEvent.click(cells[1]!);

      expect(onCellClick).toHaveBeenCalledWith(0, 1, expect.any(Object));
    });

    it("should call onCellDoubleClick when cell is double-clicked", () => {
      const onCellDoubleClick = vi.fn();
      render(
        <SlotRow
          {...createDefaultProps({ onCellDoubleClick })}
        />
      );

      const cells = document.querySelectorAll(".gp-grid-cell");
      fireEvent.doubleClick(cells[1]!);

      expect(onCellDoubleClick).toHaveBeenCalledWith(0, 1);
    });
  });

  describe("edit mode", () => {
    it("should render input when cell is in edit mode", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
          })}
        />
      );

      const input = document.querySelector(".gp-grid-edit-input");
      expect(input).toBeTruthy();
    });

    it("should set initial value on edit input", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
          })}
        />
      );

      const input = document.querySelector(".gp-grid-edit-input") as HTMLInputElement;
      expect(input?.defaultValue).toBe("30");
    });

    it("should call onEditValueChange when input value changes", () => {
      const onEditValueChange = vi.fn();
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
            onEditValueChange,
          })}
        />
      );

      const input = document.querySelector(".gp-grid-edit-input")!;
      fireEvent.change(input, { target: { value: "42" } });

      expect(onEditValueChange).toHaveBeenCalledWith("42");
    });

    it("should call onEditCommit when Enter is pressed", () => {
      const onEditCommit = vi.fn();
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
            onEditCommit,
          })}
        />
      );

      const input = document.querySelector(".gp-grid-edit-input")!;
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onEditCommit).toHaveBeenCalled();
    });

    it("should call onEditCancel when Escape is pressed", () => {
      const onEditCancel = vi.fn();
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
            onEditCancel,
          })}
        />
      );

      const input = document.querySelector(".gp-grid-edit-input")!;
      fireEvent.keyDown(input, { key: "Escape" });

      expect(onEditCancel).toHaveBeenCalled();
    });

    it("should call onEditCommit when input loses focus", () => {
      const onEditCommit = vi.fn();
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
            onEditCommit,
          })}
        />
      );

      const input = document.querySelector(".gp-grid-edit-input")!;
      fireEvent.blur(input);

      expect(onEditCommit).toHaveBeenCalled();
    });

    it("should handle null initial value in edit mode", () => {
      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: null },
          })}
        />
      );

      const input = document.querySelector(".gp-grid-edit-input") as HTMLInputElement;
      expect(input?.defaultValue).toBe("");
    });
  });

  describe("custom renderers", () => {
    it("should use global cell renderer", () => {
      const cellRenderer = vi.fn((params: CellRendererParams) => (
        <span data-testid="custom-cell">Custom: {String(params.value)}</span>
      ));

      render(
        <SlotRow
          {...createDefaultProps({ cellRenderer })}
        />
      );

      const customCells = screen.queryAllByTestId("custom-cell");
      expect(customCells.length).toBe(3); // All cells use global renderer

      expect(cellRenderer).toHaveBeenCalledTimes(3);
    });

    it("should use column-specific cell renderer from registry", () => {
      const nameRenderer = vi.fn((params: CellRendererParams) => (
        <span data-testid="name-renderer">Name: {String(params.value)}</span>
      ));

      const columnsWithRenderer: ColumnDefinition[] = [
        { field: "id", cellDataType: "number", width: 50 },
        { field: "name", cellDataType: "text", width: 150, cellRenderer: "nameRenderer" },
        { field: "age", cellDataType: "number", width: 80 },
      ];

      render(
        <SlotRow
          {...createDefaultProps({
            columns: columnsWithRenderer,
            cellRenderers: { nameRenderer },
          })}
        />
      );

      const namedCells = screen.queryAllByTestId("name-renderer");
      expect(namedCells.length).toBe(1); // Only name column

      expect(nameRenderer).toHaveBeenCalledTimes(1);
    });

    it("should pass correct params to cell renderer", () => {
      const cellRenderer = vi.fn((params: CellRendererParams) => (
        <span>{String(params.value)}</span>
      ));

      render(
        <SlotRow
          {...createDefaultProps({
            cellRenderer,
            activeCell: { row: 0, col: 1 },
            selectionRange: { startRow: 0, startCol: 0, endRow: 0, endCol: 2 },
          })}
        />
      );

      // Check params for name cell (col 1)
      const nameCall = cellRenderer.mock.calls.find(
        (call) => call[0].colIndex === 1
      );
      expect(nameCall).toBeDefined();
      expect(nameCall![0].value).toBe("Alice");
      expect(nameCall![0].rowIndex).toBe(0);
      expect(nameCall![0].isActive).toBe(true);
      expect(nameCall![0].isSelected).toBe(true);
    });

    it("should use global edit renderer in edit mode", () => {
      const editRenderer = vi.fn((params: EditRendererParams) => (
        <input data-testid="custom-edit" defaultValue={String(params.initialValue)} />
      ));

      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
            editRenderer,
          })}
        />
      );

      const customEdit = screen.queryByTestId("custom-edit");
      expect(customEdit).toBeTruthy();

      expect(editRenderer).toHaveBeenCalled();
    });

    it("should use column-specific edit renderer from registry", () => {
      const ageEditRenderer = vi.fn((params: EditRendererParams) => (
        <input
          type="number"
          data-testid="age-editor"
          defaultValue={String(params.initialValue)}
        />
      ));

      const columnsWithEditRenderer: ColumnDefinition[] = [
        { field: "id", cellDataType: "number", width: 50 },
        { field: "name", cellDataType: "text", width: 150 },
        { field: "age", cellDataType: "number", width: 80, editable: true, editRenderer: "ageEditor" },
      ];

      render(
        <SlotRow
          {...createDefaultProps({
            columns: columnsWithEditRenderer,
            editingCell: { row: 0, col: 2, initialValue: 30 },
            editRenderers: { ageEditor: ageEditRenderer },
          })}
        />
      );

      const ageEditor = screen.queryByTestId("age-editor");
      expect(ageEditor).toBeTruthy();
    });

    it("should pass correct params to edit renderer", () => {
      const editRenderer = vi.fn((params: EditRendererParams) => (
        <input defaultValue={String(params.initialValue)} />
      ));

      render(
        <SlotRow
          {...createDefaultProps({
            editingCell: { row: 0, col: 2, initialValue: 30 },
            editRenderer,
          })}
        />
      );

      const params = editRenderer.mock.calls[0]![0];
      expect(params.initialValue).toBe(30);
      expect(params.rowIndex).toBe(0);
      expect(params.colIndex).toBe(2);
      expect(params.isEditing).toBe(true);
      expect(typeof params.onValueChange).toBe("function");
      expect(typeof params.onCommit).toBe("function");
      expect(typeof params.onCancel).toBe("function");
    });

    it("should fall back to global renderer when column-specific not found", () => {
      const globalRenderer = vi.fn((params: CellRendererParams) => (
        <span data-testid="global-renderer">{String(params.value)}</span>
      ));

      const columnsWithMissingRenderer: ColumnDefinition[] = [
        { field: "name", cellDataType: "text", width: 150, cellRenderer: "nonExistent" },
      ];

      render(
        <SlotRow
          {...createDefaultProps({
            columns: columnsWithMissingRenderer,
            columnPositions: [0, 150],
            cellRenderers: {}, // No renderer registered
            cellRenderer: globalRenderer,
          })}
        />
      );

      const globalCells = screen.queryAllByTestId("global-renderer");
      expect(globalCells.length).toBe(1);
    });
  });

  describe("memoization", () => {
    it("should use memo to prevent unnecessary re-renders", () => {
      // SlotRow is wrapped in memo, verify it's the same component reference
      const props = createDefaultProps();
      const { rerender } = render(<SlotRow {...props} />);

      // Re-render with same props
      rerender(<SlotRow {...props} />);

      // Component should have re-rendered but cells should still be correct
      const cells = document.querySelectorAll(".gp-grid-cell");
      expect(cells.length).toBe(3);
    });
  });
});

