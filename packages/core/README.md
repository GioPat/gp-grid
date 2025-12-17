# gp-grid-core

A framework-agnostic TypeScript library for building high-performance data grids with high (millions) number of rows with ease.

## Available implementations

- [**gp-grid-react**](https://www.npmjs.com/package/gp-grid-react) | Official

## Philosophy

**gp-grid-core** is built on three core principles:

### 1. Slot-Based Virtual Scrolling

Instead of rendering all rows, the grid maintains a pool of reusable "slots" (DOM containers) that are recycled as users scroll. This approach:

- Renders only visible rows plus a small overscan buffer
- Recycles DOM elements instead of creating/destroying them
- Maintains consistent performance regardless of dataset size

### 2. Instruction-Based Architecture

The core emits declarative **instructions** (commands) that describe what the UI should do, rather than manipulating the DOM directly. This pattern:

- Keeps the core framework-agnostic (works with React, Vue, Svelte, vanilla JS)
- Enables batched updates for optimal rendering performance
- Provides a clean separation between logic and presentation

### 3. DataSource Abstraction

Data fetching is abstracted through a `DataSource` interface, supporting both:

- **Client-side**: All data loaded in memory, with local sorting/filtering
- **Server-side**: Data fetched on-demand from an API with server-side operations

## Installation

npm/pnpm/yarn

```bash
pnpm add gp-grid-core
```

## Architecture Overview

### GridCore

The main orchestrator class that manages:

- Viewport tracking and scroll synchronization
- Slot pool lifecycle (create, assign, move, destroy)
- Data fetching and caching
- Sort and filter state

```typescript
import { GridCore, createClientDataSource } from "gp-grid-core";

const dataSource = createClientDataSource(myData);

const grid = new GridCore({
  columns: [
    { field: "name", cellDataType: "text", width: 150 },
    { field: "age", cellDataType: "number", width: 80 },
  ],
  dataSource,
  rowHeight: 36,
  headerHeight: 40,
  overscan: 3,
});

// Subscribe to instructions
grid.onBatchInstruction((instructions) => {
  // Handle UI updates based on instructions
  instructions.forEach((instruction) => {
    switch (instruction.type) {
      case "CREATE_SLOT":
        // Create a new row container
        break;
      case "ASSIGN_SLOT":
        // Assign row data to a slot
        break;
      case "MOVE_SLOT":
        // Position slot via translateY
        break;
      // ... handle other instructions
    }
  });
});

// Initialize and start
await grid.initialize();
```

### Managers

GridCore includes specialized managers for complex behaviors:

- **SelectionManager**: Handles cell selection, range selection, keyboard navigation
- **FillManager**: Implements Excel-like fill handle drag operations

### Instruction Types

The core emits these instruction types:

| Instruction                                   | Description                       |
| --------------------------------------------- | --------------------------------- |
| `CREATE_SLOT`                                 | Create a new slot in the DOM pool |
| `DESTROY_SLOT`                                | Remove a slot from the pool       |
| `ASSIGN_SLOT`                                 | Assign row data to a slot         |
| `MOVE_SLOT`                                   | Update slot position (translateY) |
| `SET_ACTIVE_CELL`                             | Update active cell highlight      |
| `SET_SELECTION_RANGE`                         | Update selection range            |
| `START_EDIT` / `STOP_EDIT`                    | Toggle edit mode                  |
| `COMMIT_EDIT`                                 | Commit edited value               |
| `UPDATE_HEADER`                               | Update header with sort state     |
| `DATA_LOADING` / `DATA_LOADED` / `DATA_ERROR` | Data fetch lifecycle              |

## Data Sources

### Client-Side Data Source

For datasets that can be loaded entirely in memory. Sorting and filtering are performed client-side.

```typescript
import { createClientDataSource } from "gp-grid-core";

interface Person {
  id: number;
  name: string;
  age: number;
  email: string;
}

const data: Person[] = [
  { id: 1, name: "Alice", age: 30, email: "alice@example.com" },
  { id: 2, name: "Bob", age: 25, email: "bob@example.com" },
  // ... more rows
];

const dataSource = createClientDataSource(data);
```

**With custom field accessor** (for nested properties):

```typescript
const dataSource = createClientDataSource(data, {
  getFieldValue: (row, field) => {
    // Custom logic for accessing nested fields
    if (field === "address.city") {
      return row.address?.city;
    }
    return row[field];
  },
});
```

### Server-Side Data Source

For large datasets that require server-side pagination, sorting, and filtering.

```typescript
import {
  createServerDataSource,
  DataSourceRequest,
  DataSourceResponse,
} from "gp-grid-core";

interface Person {
  id: number;
  name: string;
  age: number;
}

const dataSource = createServerDataSource<Person>(
  async (request: DataSourceRequest) => {
    // Build query parameters from request
    const params = new URLSearchParams({
      page: String(request.pagination.pageIndex),
      pageSize: String(request.pagination.pageSize),
    });

    // Add sort parameters
    if (request.sort && request.sort.length > 0) {
      params.set(
        "sortBy",
        request.sort.map((s) => `${s.colId}:${s.direction}`).join(","),
      );
    }

    // Add filter parameters
    if (request.filter) {
      Object.entries(request.filter).forEach(([field, value]) => {
        params.set(`filter_${field}`, value);
      });
    }

    // Fetch from your API
    const response = await fetch(`/api/people?${params}`);
    const data = await response.json();

    return {
      rows: data.items,
      totalRows: data.totalCount,
    };
  },
);
```

### DataSource Interface

Both data source types implement this interface:

```typescript
interface DataSource<TData = Row> {
  fetch(request: DataSourceRequest): Promise<DataSourceResponse<TData>>;
}

interface DataSourceRequest {
  pagination: {
    pageIndex: number;
    pageSize: number;
  };
  sort?: SortModel[];
  filter?: FilterModel;
}

interface DataSourceResponse<TData> {
  rows: TData[];
  totalRows: number;
}
```

## Types Reference

### ColumnDefinition

```typescript
interface ColumnDefinition {
  field: string; // Property path in row data
  colId?: string; // Unique column ID (defaults to field)
  cellDataType: CellDataType; // "text" | "number" | "boolean" | "date" | "object"
  width: number; // Column width in pixels
  headerName?: string; // Display name (defaults to field)
  editable?: boolean; // Enable cell editing
  cellRenderer?: string; // Custom renderer key
  editRenderer?: string; // Custom edit renderer key
  headerRenderer?: string; // Custom header renderer key
}
```

### Renderer Params

When building framework adapters, these params are passed to custom renderers:

```typescript
interface CellRendererParams {
  value: CellValue;
  rowData: Row;
  column: ColumnDefinition;
  rowIndex: number;
  colIndex: number;
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
}

interface EditRendererParams extends CellRendererParams {
  initialValue: CellValue;
  onValueChange: (newValue: CellValue) => void;
  onCommit: () => void;
  onCancel: () => void;
}

interface HeaderRendererParams {
  column: ColumnDefinition;
  colIndex: number;
  sortDirection?: SortDirection;
  sortIndex?: number;
  onSort: (direction: SortDirection | null, addToExisting: boolean) => void;
}
```

## Creating a Framework Adapter

To integrate gp-grid-core with any UI framework:

1. **Subscribe to instructions** using `onBatchInstruction()`
2. **Maintain UI state** by processing instructions
3. **Render slots** based on the slot pool state
4. **Forward user interactions** back to GridCore

### Example: Minimal Adapter Pattern

```typescript
import { GridCore, GridInstruction } from "gp-grid-core";

class MyGridAdapter {
  private core: GridCore;
  private slots: Map<string, SlotUIElement> = new Map();

  constructor(options: GridCoreOptions) {
    this.core = new GridCore(options);

    // Process instructions to update UI
    this.core.onBatchInstruction((instructions) => {
      this.processInstructions(instructions);
      this.render();
    });
  }

  private processInstructions(instructions: GridInstruction[]) {
    for (const instr of instructions) {
      switch (instr.type) {
        case "CREATE_SLOT":
          this.slots.set(instr.slotId, this.createSlotElement());
          break;
        case "DESTROY_SLOT":
          this.slots.delete(instr.slotId);
          break;
        case "ASSIGN_SLOT":
          const slot = this.slots.get(instr.slotId);
          if (slot) {
            slot.rowIndex = instr.rowIndex;
            slot.rowData = instr.rowData;
          }
          break;
        case "MOVE_SLOT":
          const moveSlot = this.slots.get(instr.slotId);
          if (moveSlot) {
            moveSlot.translateY = instr.translateY;
          }
          break;
      }
    }
  }

  // Handle scroll events
  onScroll(
    scrollTop: number,
    scrollLeft: number,
    width: number,
    height: number,
  ) {
    this.core.setViewport(scrollTop, scrollLeft, width, height);
  }

  // Handle cell click
  onCellClick(
    row: number,
    col: number,
    modifiers: { shift: boolean; ctrl: boolean },
  ) {
    this.core.selection.startSelection({ row, col }, modifiers);
  }

  async initialize() {
    await this.core.initialize();
  }
}
```

## API Reference

### GridCore Methods

| Method                                              | Description                           |
| --------------------------------------------------- | ------------------------------------- |
| `initialize()`                                      | Initialize grid and load initial data |
| `setViewport(scrollTop, scrollLeft, width, height)` | Update viewport on scroll/resize      |
| `setSort(colId, direction, addToExisting)`          | Set column sort                       |
| `setFilter(colId, value)`                           | Set column filter                     |
| `startEdit(row, col)`                               | Start editing a cell                  |
| `commitEdit()`                                      | Commit current edit                   |
| `cancelEdit()`                                      | Cancel current edit                   |
| `refresh()`                                         | Refetch data from source              |
| `getRowCount()`                                     | Get total row count                   |
| `getRowData(rowIndex)`                              | Get data for a specific row           |

### GridCore Properties

| Property    | Description               |
| ----------- | ------------------------- |
| `selection` | SelectionManager instance |
| `fill`      | FillManager instance      |
