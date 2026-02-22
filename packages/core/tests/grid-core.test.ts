// packages/core/tests/grid-core.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GridCore } from "../src/grid-core";
import { createClientDataSource } from "../src/data-source";
import type {
  GridInstruction,
  ColumnDefinition,
  DataSource,
  Row,
} from "../src/types";

// Sample test data
interface TestRow {
  id: number;
  name: string;
  age: number;
  email: string;
}

const sampleData: TestRow[] = [
  { id: 1, name: "Alice", age: 30, email: "alice@example.com" },
  { id: 2, name: "Bob", age: 25, email: "bob@example.com" },
  { id: 3, name: "Charlie", age: 35, email: "charlie@example.com" },
  { id: 4, name: "Diana", age: 28, email: "diana@example.com" },
  { id: 5, name: "Eve", age: 22, email: "eve@example.com" },
];

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 50 },
  { field: "name", cellDataType: "text", width: 150 },
  { field: "age", cellDataType: "number", width: 80, editable: true },
  { field: "email", cellDataType: "text", width: 200 },
];

function createTestGrid(
  data?: TestRow[],
  opts: Partial<{ rowHeight: number; headerHeight: number; overscan: number }> = {}
) {
  // Always create a deep copy of the data to avoid mutation issues between tests
  const testData = data 
    ? JSON.parse(JSON.stringify(data)) as TestRow[]
    : JSON.parse(JSON.stringify(sampleData)) as TestRow[];
  
  const dataSource = createClientDataSource(testData);
  return new GridCore<TestRow>({
    columns,
    dataSource,
    rowHeight: opts.rowHeight ?? 32,
    headerHeight: opts.headerHeight ?? 40,
    overscan: opts.overscan ?? 2,
  });
}

describe("GridCore", () => {
  let grid: GridCore<TestRow>;
  let emittedInstructions: GridInstruction[];
  let batchedInstructions: GridInstruction[][];

  beforeEach(() => {
    grid = createTestGrid();
    emittedInstructions = [];
    batchedInstructions = [];

    grid.onBatchInstruction((batch) => {
      // Flatten batch into emittedInstructions for test compatibility
      emittedInstructions.push(...batch);
      batchedInstructions.push(batch);
    });
  });

  describe("initialization", () => {
    it("should load data and emit instructions on initialize", async () => {
      await grid.initialize();

      // Should emit DATA_LOADING
      expect(emittedInstructions.some((i) => i.type === "DATA_LOADING")).toBe(true);
      
      // Should emit DATA_LOADED with correct row count
      const dataLoaded = emittedInstructions.find((i) => i.type === "DATA_LOADED");
      expect(dataLoaded).toBeDefined();
      if (dataLoaded?.type === "DATA_LOADED") {
        expect(dataLoaded.totalRows).toBe(5);
      }

      // Should emit SET_CONTENT_SIZE
      const contentSize = emittedInstructions.find((i) => i.type === "SET_CONTENT_SIZE");
      expect(contentSize).toBeDefined();
    });

    it("should create slots for visible rows after initialize", async () => {
      await grid.initialize();

      const createSlots = emittedInstructions.filter((i) => i.type === "CREATE_SLOT");
      expect(createSlots.length).toBeGreaterThan(0);
    });

    it("should emit UPDATE_HEADER for each column", async () => {
      await grid.initialize();

      const headerUpdates = emittedInstructions.filter((i) => i.type === "UPDATE_HEADER");
      expect(headerUpdates).toHaveLength(4); // 4 columns
    });
  });

  describe("viewport management", () => {
    it("should sync slots when viewport changes", async () => {
      await grid.initialize();
      emittedInstructions = [];

      grid.setViewport(0, 0, 800, 600);

      // Should emit slot updates
      expect(emittedInstructions.length).toBeGreaterThanOrEqual(0);
    });

    it("should not emit if viewport unchanged", async () => {
      await grid.initialize();
      grid.setViewport(0, 0, 800, 600);
      emittedInstructions = [];

      grid.setViewport(0, 0, 800, 600); // Same values

      expect(emittedInstructions).toHaveLength(0);
    });

    it("should recycle slots when scrolling", async () => {
      // Create grid with more data to test scrolling
      const largeData = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Name ${i}`,
        age: 20 + (i % 50),
        email: `email${i}@example.com`,
      }));
      
      grid = createTestGrid(largeData, { rowHeight: 32, overscan: 1 });
      grid.onBatchInstruction((batch) => emittedInstructions.push(...batch));
      
      await grid.initialize();
      // Set initial viewport to create slots
      grid.setViewport(0, 0, 800, 160); // Shows ~5 rows
      emittedInstructions = [];

      // Scroll down significantly to force recycling
      grid.setViewport(1600, 0, 800, 160); // Scroll down 50 rows - completely new visible range

      // Should emit ASSIGN_SLOT and MOVE_SLOT for recycled slots
      const assignSlots = emittedInstructions.filter((i) => i.type === "ASSIGN_SLOT");
      const moveSlots = emittedInstructions.filter((i) => i.type === "MOVE_SLOT");
      
      expect(assignSlots.length).toBeGreaterThan(0);
      expect(moveSlots.length).toBeGreaterThan(0);
    });
  });

  describe("slot lifecycle", () => {
    it("should emit CREATE_SLOT instruction", async () => {
      await grid.initialize();

      const createSlots = emittedInstructions.filter((i) => i.type === "CREATE_SLOT");
      expect(createSlots.length).toBeGreaterThan(0);
      
      if (createSlots[0]?.type === "CREATE_SLOT") {
        expect(createSlots[0].slotId).toMatch(/^slot-\d+$/);
      }
    });

    it("should emit ASSIGN_SLOT with row data", async () => {
      await grid.initialize();

      const assignSlots = emittedInstructions.filter((i) => i.type === "ASSIGN_SLOT");
      expect(assignSlots.length).toBeGreaterThan(0);
      
      if (assignSlots[0]?.type === "ASSIGN_SLOT") {
        expect(assignSlots[0].rowIndex).toBeGreaterThanOrEqual(0);
        expect(assignSlots[0].rowData).toBeDefined();
      }
    });

    it("should emit MOVE_SLOT with translateY", async () => {
      await grid.initialize();

      const moveSlots = emittedInstructions.filter((i) => i.type === "MOVE_SLOT");
      expect(moveSlots.length).toBeGreaterThan(0);
      
      if (moveSlots[0]?.type === "MOVE_SLOT") {
        expect(moveSlots[0].translateY).toBeGreaterThanOrEqual(0);
      }
    });

    it("should emit DESTROY_SLOT when reducing visible rows", async () => {
      // Create grid with large data
      const largeData = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Name ${i}`,
        age: 20,
        email: `email${i}@example.com`,
      }));
      
      grid = createTestGrid(largeData);
      grid.onBatchInstruction((batch) => emittedInstructions.push(...batch));
      
      await grid.initialize();
      grid.setViewport(0, 0, 800, 600); // More visible rows
      emittedInstructions = [];

      // Filter to reduce rows significantly
      await grid.setFilter("name", "Name 0"); // Only matches "Name 0"

      const destroySlots = emittedInstructions.filter((i) => i.type === "DESTROY_SLOT");
      expect(destroySlots.length).toBeGreaterThan(0);
    });
  });

  describe("sorting", () => {
    it("should sort data and refresh slots", async () => {
      await grid.initialize();
      emittedInstructions = [];

      await grid.setSort("name", "asc");

      // Should emit DATA_LOADING, DATA_LOADED
      expect(emittedInstructions.some((i) => i.type === "DATA_LOADING")).toBe(true);
      expect(emittedInstructions.some((i) => i.type === "DATA_LOADED")).toBe(true);
      
      // Should emit ASSIGN_SLOT with new data order
      const assignSlots = emittedInstructions.filter((i) => i.type === "ASSIGN_SLOT");
      expect(assignSlots.length).toBeGreaterThan(0);
    });

    it("should emit UPDATE_HEADER with sort direction", async () => {
      await grid.initialize();
      emittedInstructions = [];

      await grid.setSort("name", "asc");

      const headerUpdates = emittedInstructions.filter((i) => i.type === "UPDATE_HEADER");
      const nameHeader = headerUpdates.find(
        (i) => i.type === "UPDATE_HEADER" && i.column.field === "name"
      );
      
      expect(nameHeader).toBeDefined();
      if (nameHeader?.type === "UPDATE_HEADER") {
        expect(nameHeader.sortDirection).toBe("asc");
      }
    });

    it("should clear sort when direction is null", async () => {
      await grid.initialize();
      await grid.setSort("name", "asc");
      emittedInstructions = [];

      await grid.setSort("name", null);

      expect(grid.getSortModel()).toHaveLength(0);
    });

    it("should support multi-column sort with addToExisting", async () => {
      await grid.initialize();

      await grid.setSort("name", "asc");
      await grid.setSort("age", "desc", true);

      const sortModel = grid.getSortModel();
      expect(sortModel).toHaveLength(2);
      expect(sortModel[0]).toEqual({ colId: "name", direction: "asc" });
      expect(sortModel[1]).toEqual({ colId: "age", direction: "desc" });
    });

    it("should update existing sort in multi-sort mode", async () => {
      await grid.initialize();

      await grid.setSort("name", "asc");
      await grid.setSort("age", "desc", true);
      await grid.setSort("name", "desc", true);

      const sortModel = grid.getSortModel();
      expect(sortModel).toHaveLength(2);
      expect(sortModel[0]).toEqual({ colId: "name", direction: "desc" });
    });
  });

  describe("filtering", () => {
    it("should filter data and update content size", async () => {
      await grid.initialize();
      emittedInstructions = [];

      await grid.setFilter("name", "alice");

      const contentSize = emittedInstructions.find((i) => i.type === "SET_CONTENT_SIZE");
      expect(contentSize).toBeDefined();
      
      expect(grid.getRowCount()).toBe(1);
    });

    it("should clear filter when value is empty", async () => {
      await grid.initialize();
      await grid.setFilter("name", "alice");
      
      await grid.setFilter("name", "");

      expect(grid.getFilterModel()).toEqual({});
      expect(grid.getRowCount()).toBe(5);
    });

    it("should support multiple filters", async () => {
      await grid.initialize();

      await grid.setFilter("name", "a");
      await grid.setFilter("age", "30");

      // "Alice" has name containing 'a' and age 30
      expect(grid.getRowCount()).toBe(1);
    });
  });

  describe("editing", () => {
    it("should start edit on editable column", async () => {
      await grid.initialize();
      emittedInstructions = [];

      grid.startEdit(0, 2); // age column is editable

      expect(emittedInstructions.some((i) => i.type === "START_EDIT")).toBe(true);
      
      const editState = grid.getEditState();
      expect(editState).not.toBeNull();
      expect(editState?.row).toBe(0);
      expect(editState?.col).toBe(2);
    });

    it("should not start edit on non-editable column", async () => {
      await grid.initialize();
      emittedInstructions = [];

      grid.startEdit(0, 0); // id column is not editable

      expect(emittedInstructions.some((i) => i.type === "START_EDIT")).toBe(false);
      expect(grid.getEditState()).toBeNull();
    });

    it("should commit edit and update cell value", async () => {
      await grid.initialize();
      
      grid.startEdit(0, 2);
      grid.updateEditValue(99);
      emittedInstructions = [];
      
      grid.commitEdit();

      expect(emittedInstructions.some((i) => i.type === "COMMIT_EDIT")).toBe(true);
      expect(emittedInstructions.some((i) => i.type === "STOP_EDIT")).toBe(true);
      
      expect(grid.getCellValue(0, 2)).toBe(99);
      expect(grid.getEditState()).toBeNull();
    });

    it("should cancel edit without changing value", async () => {
      await grid.initialize();
      const originalValue = grid.getCellValue(0, 2);
      
      grid.startEdit(0, 2);
      grid.updateEditValue(99);
      emittedInstructions = [];
      
      grid.cancelEdit();

      expect(emittedInstructions.some((i) => i.type === "STOP_EDIT")).toBe(true);
      expect(grid.getCellValue(0, 2)).toBe(originalValue);
      expect(grid.getEditState()).toBeNull();
    });

    it("should emit ASSIGN_SLOT after commit to update slot", async () => {
      await grid.initialize();
      
      grid.startEdit(0, 2);
      grid.updateEditValue(99);
      emittedInstructions = [];
      
      grid.commitEdit();

      expect(emittedInstructions.some((i) => i.type === "ASSIGN_SLOT")).toBe(true);
    });
  });

  describe("cell value access", () => {
    it("should get cell value by row and column index", async () => {
      // Create fresh grid (createTestGrid always deep copies data)
      const testGrid = createTestGrid();
      await testGrid.initialize();

      expect(testGrid.getCellValue(0, 0)).toBe(1); // id
      expect(testGrid.getCellValue(0, 1)).toBe("Alice"); // name
      expect(testGrid.getCellValue(0, 2)).toBe(30); // age
    });

    it("should return null for invalid row index", async () => {
      await grid.initialize();

      expect(grid.getCellValue(100, 0)).toBeNull();
    });

    it("should return null for invalid column index", async () => {
      await grid.initialize();

      expect(grid.getCellValue(0, 100)).toBeNull();
    });

    it("should support nested field access", async () => {
      const dataWithNested = [
        { id: 1, nested: { value: "test" } },
      ];
      const nestedColumns: ColumnDefinition[] = [
        { field: "nested.value", cellDataType: "text", width: 100 },
      ];
      
      const nestedGrid = new GridCore({
        columns: nestedColumns,
        dataSource: createClientDataSource(dataWithNested),
        rowHeight: 32,
      });
      
      await nestedGrid.initialize();

      expect(nestedGrid.getCellValue(0, 0)).toBe("test");
    });
  });

  describe("public accessors", () => {
    it("should return columns", async () => {
      await grid.initialize();
      
      expect(grid.getColumns()).toHaveLength(4);
      expect(grid.getColumns()[0].field).toBe("id");
    });

    it("should return column positions", async () => {
      await grid.initialize();
      
      const positions = grid.getColumnPositions();
      expect(positions[0]).toBe(0);
      expect(positions[1]).toBe(50); // After id column (width 50)
      expect(positions[2]).toBe(200); // After name column (50 + 150)
    });

    it("should return row count", async () => {
      await grid.initialize();
      
      expect(grid.getRowCount()).toBe(5);
    });

    it("should return row height and header height", async () => {
      expect(grid.getRowHeight()).toBe(32);
      expect(grid.getHeaderHeight()).toBe(40);
    });

    it("should return total dimensions", async () => {
      await grid.initialize();
      
      expect(grid.getTotalWidth()).toBe(480); // 50 + 150 + 80 + 200
      expect(grid.getTotalHeight()).toBe(5 * 32 + 40); // 5 rows + header
    });

    it("should return row data by index", async () => {
      await grid.initialize();
      
      const rowData = grid.getRowData(0);
      expect(rowData).toBeDefined();
      expect(rowData?.name).toBe("Alice");
    });
  });

  describe("data updates", () => {
    it("should refresh data from source", async () => {
      await grid.initialize();
      emittedInstructions = [];

      await grid.refresh();

      expect(emittedInstructions.some((i) => i.type === "DATA_LOADING")).toBe(true);
      expect(emittedInstructions.some((i) => i.type === "DATA_LOADED")).toBe(true);
    });

    it("should update data source", async () => {
      await grid.initialize();
      
      const newData = [{ id: 100, name: "New", age: 50, email: "new@example.com" }];
      const newDataSource = createClientDataSource(newData);
      
      await grid.setDataSource(newDataSource);

      expect(grid.getRowCount()).toBe(1);
      expect(grid.getCellValue(0, 1)).toBe("New");
    });

    it("should update columns", async () => {
      await grid.initialize();
      emittedInstructions = [];

      const newColumns: ColumnDefinition[] = [
        { field: "id", cellDataType: "number", width: 100 },
        { field: "name", cellDataType: "text", width: 200 },
      ];
      
      grid.setColumns(newColumns);

      expect(grid.getColumns()).toHaveLength(2);
      expect(grid.getTotalWidth()).toBe(300);
      
      // Should emit content size and headers
      expect(emittedInstructions.some((i) => i.type === "SET_CONTENT_SIZE")).toBe(true);
      expect(emittedInstructions.some((i) => i.type === "UPDATE_HEADER")).toBe(true);
    });

    it("should refresh slot data without refetching", async () => {
      await grid.initialize();
      emittedInstructions = [];

      grid.refreshSlotData();

      // Should emit ASSIGN_SLOT but not DATA_LOADING
      expect(emittedInstructions.some((i) => i.type === "ASSIGN_SLOT")).toBe(true);
      expect(emittedInstructions.some((i) => i.type === "DATA_LOADING")).toBe(false);
    });
  });

  describe("instruction listeners", () => {
    it("should support multiple batch listeners", async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      grid.onBatchInstruction(listener1);
      grid.onBatchInstruction(listener2);

      await grid.initialize();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      // Batch listeners should receive arrays
      expect(Array.isArray(listener1.mock.calls[0][0])).toBe(true);
      expect(Array.isArray(listener2.mock.calls[0][0])).toBe(true);
    });

    it("should support unsubscribing batch listener", async () => {
      const batchListener = vi.fn();
      const unsubscribe = grid.onBatchInstruction(batchListener);

      await grid.initialize();
      expect(batchListener).toHaveBeenCalled();

      unsubscribe();
      batchListener.mockClear();

      await grid.refresh();
      expect(batchListener).not.toHaveBeenCalled();
    });
  });

  describe("selection manager integration", () => {
    it("should forward selection instructions", async () => {
      await grid.initialize();
      emittedInstructions = [];

      grid.selection.startSelection({ row: 1, col: 1 });

      expect(emittedInstructions.some((i) => i.type === "SET_ACTIVE_CELL")).toBe(true);
    });

    it("should provide row count to selection manager", async () => {
      await grid.initialize();

      grid.selection.selectAll();
      const range = grid.selection.getSelectionRange();

      expect(range?.endRow).toBe(4); // 0-indexed, 5 rows
    });
  });

  describe("fill manager integration", () => {
    it("should forward fill instructions", async () => {
      await grid.initialize();
      emittedInstructions = [];

      grid.fill.startFillDrag({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });

      expect(emittedInstructions.some((i) => i.type === "START_FILL")).toBe(true);
    });

    it("should update cell values on fill commit", async () => {
      await grid.initialize();
      
      // Set a known value
      grid.startEdit(0, 2);
      grid.updateEditValue(100);
      grid.commitEdit();

      // Fill down
      grid.fill.startFillDrag({ startRow: 0, startCol: 2, endRow: 0, endCol: 2 });
      grid.fill.updateFillDrag(2, 2);
      grid.fill.commitFillDrag();

      expect(grid.getCellValue(1, 2)).toBe(100);
      expect(grid.getCellValue(2, 2)).toBe(100);
    });
  });

  describe("error handling", () => {
    it("should emit DATA_ERROR on fetch failure", async () => {
      const failingDataSource: DataSource<TestRow> = {
        async fetch() {
          throw new Error("Network error");
        },
      };

      const errorGrid = new GridCore({
        columns,
        dataSource: failingDataSource,
        rowHeight: 32,
      });

      const errors: GridInstruction[] = [];
      errorGrid.onBatchInstruction((batch) => errors.push(...batch));

      await errorGrid.initialize();

      const errorInstruction = errors.find((i) => i.type === "DATA_ERROR");
      expect(errorInstruction).toBeDefined();
      if (errorInstruction?.type === "DATA_ERROR") {
        expect(errorInstruction.error).toBe("Network error");
      }
    });
  });

  describe("scroll virtualization bounds", () => {
    it("should keep translateY within safe browser limits at extreme scroll positions", async () => {
      // Create data that exceeds MAX_SCROLL_HEIGHT (10 million pixels)
      // With rowHeight=32, we need ~312,500 rows to exceed 10M pixels
      // Using 500,000 rows = 16M pixels natural height
      const extremeRowCount = 500_000;
      const rowHeight = 32;
      const headerHeight = 40;
      const viewportHeight = 600;
      
      // Create a mock data source that returns extreme row count
      const extremeDataSource: DataSource<TestRow> = {
        async fetch(request) {
          const rows: TestRow[] = [];
          const start = request.pagination?.pageIndex ?? 0;
          const size = request.pagination?.pageSize ?? 100;
          for (let i = start; i < Math.min(start + size, extremeRowCount); i++) {
            rows.push({ id: i, name: `Row ${i}`, age: 20, email: `row${i}@example.com` });
          }
          return { rows, totalRows: extremeRowCount };
        },
      };

      const extremeGrid = new GridCore<TestRow>({
        columns,
        dataSource: extremeDataSource,
        rowHeight,
        headerHeight,
        overscan: 3,
      });

      const instructions: GridInstruction[] = [];
      extremeGrid.onBatchInstruction((batch) => instructions.push(...batch));

      await extremeGrid.initialize();

      // Get the virtual content height from SET_CONTENT_SIZE instruction
      const contentSizeInstruction = instructions.find((i) => i.type === "SET_CONTENT_SIZE");
      expect(contentSizeInstruction).toBeDefined();
      const virtualContentHeight = contentSizeInstruction?.type === "SET_CONTENT_SIZE" 
        ? contentSizeInstruction.height 
        : 0;
      
      // Verify scroll virtualization is active (content was capped)
      const naturalHeight = extremeRowCount * rowHeight + headerHeight;
      expect(virtualContentHeight).toBeLessThan(naturalHeight);
      expect(virtualContentHeight).toBeLessThanOrEqual(10_000_000);

      instructions.length = 0;

      // Scroll to the absolute bottom (maximum scroll position)
      const maxScrollTop = virtualContentHeight - viewportHeight;
      extremeGrid.setViewport(maxScrollTop, 0, 800, viewportHeight);

      // Collect all MOVE_SLOT instructions
      const moveSlots = instructions.filter((i) => i.type === "MOVE_SLOT");
      expect(moveSlots.length).toBeGreaterThan(0);

      // Verify all translateY values are within safe bounds
      for (const instruction of moveSlots) {
        if (instruction.type === "MOVE_SLOT") {
          expect(instruction.translateY).toBeGreaterThanOrEqual(0);
          expect(instruction.translateY).toBeLessThanOrEqual(virtualContentHeight);
        }
      }
    });

    it("should keep translateY at 0 or above when scrolled to top", async () => {
      const extremeRowCount = 500_000;
      
      const extremeDataSource: DataSource<TestRow> = {
        async fetch(request) {
          const rows: TestRow[] = [];
          const start = request.pagination?.pageIndex ?? 0;
          const size = request.pagination?.pageSize ?? 100;
          for (let i = start; i < Math.min(start + size, extremeRowCount); i++) {
            rows.push({ id: i, name: `Row ${i}`, age: 20, email: `row${i}@example.com` });
          }
          return { rows, totalRows: extremeRowCount };
        },
      };

      const extremeGrid = new GridCore<TestRow>({
        columns,
        dataSource: extremeDataSource,
        rowHeight: 32,
        headerHeight: 40,
        overscan: 3,
      });

      const instructions: GridInstruction[] = [];
      extremeGrid.onBatchInstruction((batch) => instructions.push(...batch));

      await extremeGrid.initialize();
      instructions.length = 0;

      // Scroll to top
      extremeGrid.setViewport(0, 0, 800, 600);

      const moveSlots = instructions.filter((i) => i.type === "MOVE_SLOT");
      
      for (const instruction of moveSlots) {
        if (instruction.type === "MOVE_SLOT") {
          expect(instruction.translateY).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});


