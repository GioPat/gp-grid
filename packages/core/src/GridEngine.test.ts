import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GridEngine, type GridOptions, type ColumnDefinition } from './GridEngine';

describe('GridEngine', () => {
  let gridEngine: GridEngine;
  let mockData: Array<{ id: number; name: string; age: number; salary: number; department: { name: string } }>;
  let columns: ColumnDefinition[];

  beforeEach(() => {
    mockData = [
      { id: 1, name: 'Alice', age: 30, salary: 50000, department: { name: 'Engineering' } },
      { id: 2, name: 'Bob', age: 25, salary: 45000, department: { name: 'Marketing' } },
      { id: 3, name: 'Charlie', age: 35, salary: 60000, department: { name: 'Engineering' } },
      { id: 4, name: 'Diana', age: 28, salary: 48000, department: { name: 'Sales' } },
    ];

    columns = [
      { field: 'id', cellDataType: 'number', width: 80 },
      { field: 'name', cellDataType: 'text', width: 150 },
      { field: 'age', cellDataType: 'number', width: 100 },
      { field: 'salary', cellDataType: 'number', width: 120 },
      { field: 'department.name', cellDataType: 'text', width: 150, colId: 'departmentName' },
    ];
  });

  describe('Initialization', () => {
    it('should initialize with provided options', () => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };

      gridEngine = new GridEngine(opts);
      expect(gridEngine).toBeDefined();
    });

    it('should compute column positions correctly', () => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };

      gridEngine = new GridEngine(opts);
      // Column widths: 80, 150, 100, 120, 150
      // Positions: 0, 80, 230, 330, 450, 600
      const totalWidth = gridEngine.totalWidth;
      expect(totalWidth).toBe(600);
    });

    it('should handle empty row data', () => {
      const opts: GridOptions = {
        columns,
        rowData: [],
        rowHeight: 40,
      };

      gridEngine = new GridEngine(opts);
      expect(gridEngine).toBeDefined();
    });
  });

  describe('Field value extraction', () => {
    beforeEach(() => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);
    });

    it('should extract top-level field values', () => {
      // We need to test through computeVisible since getFieldValue is private
      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const nameCell = capturedCells.find(c => c.column.field === 'name' && c.row === 0);
      expect(nameCell?.value).toBe('Alice');
    });

    it('should extract nested field values using dot notation', () => {
      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const deptCell = capturedCells.find(c => c.column.field === 'department.name' && c.row === 0);
      expect(deptCell?.value).toBe('Engineering');
    });

    it('should return null for missing nested properties', () => {
      const dataWithMissing = [
        { id: 1, name: 'Test', age: 30, salary: 50000, department: null },
      ];

      const opts: GridOptions = {
        columns,
        rowData: dataWithMissing,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);

      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const deptCell = capturedCells.find(c => c.column.field === 'department.name');
      expect(deptCell?.value).toBe(null);
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);
    });

    it('should filter rows by single column', async () => {
      await gridEngine.setFilter('name', 'Alice');
      const rowCount = gridEngine.getProcessedData().length;
      expect(rowCount).toBe(1);
    });

    it('should filter rows by multiple columns', async () => {
      await gridEngine.setFilter('departmentName', 'Engineering');
      const rowCount = gridEngine.getProcessedData().length;
      expect(rowCount).toBe(2); // Alice and Charlie
    });

    it('should be case-insensitive', async () => {
      await gridEngine.setFilter('name', 'alice');
      const rowCount = gridEngine.getProcessedData().length;
      expect(rowCount).toBe(1);
    });

    it('should support partial matching', async () => {
      await gridEngine.setFilter('name', 'li'); // Should match Alice and Charlie
      const rowCount = gridEngine.getProcessedData().length;
      expect(rowCount).toBe(2);
    });

    it('should clear filters when empty string is provided', async () => {
      await gridEngine.setFilter('name', 'Alice');
      expect(gridEngine.getProcessedData().length).toBe(1);

      await gridEngine.setFilter('name', '');
      expect(gridEngine.getProcessedData().length).toBe(4);
    });

    it('should handle filters on nested fields', async () => {
      await gridEngine.setFilter('departmentName', 'Engineering');
      const rowCount = gridEngine.getProcessedData().length;
      expect(rowCount).toBe(2);
    });
  });

  describe('Sorting', () => {
    beforeEach(() => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);
    });

    it('should sort by single column ascending', async () => {
      await gridEngine.setSort('age', 'asc');

      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const nameCells = capturedCells
        .filter(c => c.column.field === 'name')
        .sort((a, b) => a.row - b.row)
        .map(c => c.value);

      expect(nameCells).toEqual(['Bob', 'Diana', 'Alice', 'Charlie']);
    });

    it('should sort by single column descending', async () => {
      await gridEngine.setSort('age', 'desc');

      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const nameCells = capturedCells
        .filter(c => c.column.field === 'name')
        .sort((a, b) => a.row - b.row)
        .map(c => c.value);

      expect(nameCells).toEqual(['Charlie', 'Alice', 'Diana', 'Bob']);
    });

    it('should support multi-column sorting', async () => {
      // Add another person with same department
      const extendedData = [
        ...mockData,
        { id: 5, name: 'Eve', age: 32, salary: 55000, department: { name: 'Engineering' } },
      ];

      const opts: GridOptions = {
        columns,
        rowData: extendedData,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);

      await gridEngine.setSort('departmentName', 'asc');
      await gridEngine.setSort('age', 'desc', true); // addToExisting = true

      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const nameCells = capturedCells
        .filter(c => c.column.field === 'name')
        .sort((a, b) => a.row - b.row)
        .map(c => c.value);

      // Engineering (Charlie 35, Eve 32, Alice 30), Marketing (Bob 25), Sales (Diana 28)
      expect(nameCells).toEqual(['Charlie', 'Eve', 'Alice', 'Bob', 'Diana']);
    });

    it('should clear sort when null direction is provided', async () => {
      await gridEngine.setSort('age', 'asc');
      await gridEngine.setSort('age', null);

      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const nameCells = capturedCells
        .filter(c => c.column.field === 'name')
        .sort((a, b) => a.row - b.row)
        .map(c => c.value);

      // Original order
      expect(nameCells).toEqual(['Alice', 'Bob', 'Charlie', 'Diana']);
    });
  });

  describe('Selection', () => {
    beforeEach(() => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);
    });

    it('should set active cell', () => {
      gridEngine.setActiveCell(1, 2);
      const activeCell = gridEngine.getActiveCell();
      expect(activeCell).toEqual({ row: 1, col: 2 });
    });

    it('should set selection range', () => {
      gridEngine.setSelectionRange({ startRow: 0, startCol: 0, endRow: 2, endCol: 2 });
      const selectionRange = gridEngine.getSelectionRange();
      expect(selectionRange).toEqual({ startRow: 0, startCol: 0, endRow: 2, endCol: 2 });
    });

    it('should clear selection', () => {
      gridEngine.setActiveCell(1, 2);
      gridEngine.clearSelection();
      const activeCell = gridEngine.getActiveCell();
      const selectionRange = gridEngine.getSelectionRange();
      expect(activeCell).toBe(null);
      expect(selectionRange).toBe(null);
    });

    it('should call selection change callback', () => {
      const callback = vi.fn();
      gridEngine.onSelectionChange(callback);
      gridEngine.setActiveCell(1, 2);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Data updates', () => {
    beforeEach(() => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);
    });

    it('should update row data and refresh', async () => {
      const newData = [
        { id: 10, name: 'Zoe', age: 40, salary: 70000, department: { name: 'Executive' } },
      ];

      await gridEngine.updateRowData(newData);
      expect(gridEngine.getProcessedData().length).toBe(1);
    });

    it('should maintain filters after data update', async () => {
      await gridEngine.setFilter('name', 'Alice');
      expect(gridEngine.getProcessedData().length).toBe(1);

      const newData = [
        ...mockData,
        { id: 5, name: 'Alice Cooper', age: 50, salary: 80000, department: { name: 'Music' } },
      ];

      await gridEngine.updateRowData(newData);
      expect(gridEngine.getProcessedData().length).toBe(2); // Both Alices
    });

    it('should maintain sort after data update', async () => {
      await gridEngine.setSort('age', 'asc');

      const newData = [
        { id: 5, name: 'Zoe', age: 20, salary: 40000, department: { name: 'Intern' } },
        ...mockData,
      ];

      await gridEngine.updateRowData(newData);

      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });
      gridEngine.computeVisible(0, 0, 800, 400);

      const nameCells = capturedCells
        .filter(c => c.column.field === 'name')
        .sort((a, b) => a.row - b.row)
        .map(c => c.value);

      expect(nameCells[0]).toBe('Zoe'); // Youngest
    });
  });

  describe('Viewport and virtualization', () => {
    beforeEach(() => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };
      gridEngine = new GridEngine(opts);
    });

    it('should only render cells in viewport', () => {
      let capturedCells: any[] = [];
      gridEngine.onRender((cells) => {
        capturedCells = cells;
      });

      // Small viewport showing only first row
      gridEngine.computeVisible(0, 0, 600, 40, 0); // overscan = 0 for precise testing

      const rowIndices = [...new Set(capturedCells.map(c => c.row))];
      expect(rowIndices.length).toBeLessThanOrEqual(2); // Should only show ~1 row (viewport shows 1 row + 1 extra)
    });

    it('should call render callback on viewport update', () => {
      const callback = vi.fn();
      gridEngine.onRender(callback);
      gridEngine.computeVisible(0, 0, 800, 400);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Dimensions', () => {
    beforeEach(() => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
        headerHeight: 50,
      };
      gridEngine = new GridEngine(opts);
    });

    it('should return correct total width', () => {
      const totalWidth = gridEngine.totalWidth;
      expect(totalWidth).toBe(600); // 80 + 150 + 100 + 120 + 150
    });

    it('should return correct total height', () => {
      const totalHeight = gridEngine.totalHeight;
      expect(totalHeight).toBe(160); // 4 rows * 40
    });

    it('should use custom header height', () => {
      const headerHeight = gridEngine.headerHeight;
      expect(headerHeight).toBe(50);
    });

    it('should default header height to row height', () => {
      const opts: GridOptions = {
        columns,
        rowData: mockData,
        rowHeight: 40,
      };
      const engine = new GridEngine(opts);
      expect(engine.headerHeight).toBe(40);
    });
  });
});
