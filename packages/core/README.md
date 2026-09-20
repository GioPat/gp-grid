# @gp-grid/core 🏁 🏎️

<div align="center">
    <a href="https://www.gp-grid.io">
        <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://www.gp-grid.io/logo-light.svg"/>
        <source media="(prefers-color-scheme: light)" srcset="https://www.gp-grid.io/logo-dark.svg"/>
        <img width="50%" alt="gp-grid Logo" src="https://www.gp-grid.io/logo-dark.svg"/>
        </picture>
    </a>
    <div align="center">
     Logo by <a href="https://github.com/camillo18tre">camillo18tre ❤️</a>
      <h4><a href="https://www.gp-grid.io/">🎮 Demo</a> • <a href="https://www.gp-grid.io/docs">📖 Documentation</a> • <a href="https://deepwiki.com/GioPat/gp-grid"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"/></a></h4>
    </div>
</div>

<div align="center">

[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=giopat_gp-grid_core&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=giopat_gp-grid_core) [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=giopat_gp-grid_core&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=giopat_gp-grid_core) [![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=giopat_gp-grid_core&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=giopat_gp-grid_core) [![Coverage](https://sonarcloud.io/api/project_badges/measure?project=giopat_gp-grid_core&metric=coverage)](https://sonarcloud.io/summary/new_code?id=giopat_gp-grid_core) [![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=giopat_gp-grid_core&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=giopat_gp-grid_core)

</div>

A framework-agnostic TypeScript library for building high-performance data grids with high (millions) number of rows with ease.

## Table of Contents

- [Philosophy](#philosophy)
- [Installation](#installation)
- [Architecture Overview](#architecture-overview)
- [Data Sources](#data-sources)
- [Types Reference](#types-reference)
- [Column identity and state](#column-identity-and-state)
- [Creating a Framework Adapter](#creating-a-framework-adapter)
- [API Reference](#api-reference)
- [Donations](#donations)

## Available implementations

- [**@gp-grid/react**](https://www.npmjs.com/package/@gp-grid/react) | Official
- [**@gp-grid/vue**](https://www.npmjs.com/package/@gp-grid/vue) | Official
- [**@gp-grid/angular**](https://www.npmjs.com/package/@gp-grid/angular) | Official

## Philosophy

**@gp-grid/core** is built on three core principles:

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
pnpm add @gp-grid/core
```

## Architecture Overview

### GridCore

The main orchestrator class that manages:

- Viewport tracking and scroll synchronization
- Slot pool lifecycle (create, assign, move, destroy)
- Data fetching and caching
- Sort and filter state

```typescript
import { GridCore, createClientDataSource } from "@gp-grid/core";

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
| `START_EDIT` / `STOP_EDIT`                    | Toggle edit mode; `START_EDIT` carries `editId` and is re-sent with the draft when the edited column moves |
| `COMMIT_EDIT`                                 | Commit edited value               |
| `UPDATE_HEADER`                               | Update header with sort state     |
| `DATA_LOADING` / `DATA_LOADED` / `DATA_ERROR` | Data fetch lifecycle              |

## Data Sources

### Client-Side Data Source

For datasets that can be loaded entirely in memory. Sorting and filtering are performed client-side.

```typescript
import { createClientDataSource } from "@gp-grid/core";

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

### Columnar Data Source (read-only)

`createColumnarDataSource` reads caller-owned arrays, typed-array views, and scalar accessors without converting them into row objects. Construction and revision validation take O(columns) work. Pass the source through the ordinary `dataSource` input in React, Vue, or Angular, or use it with `GridCore` directly.

The source is read-only from the grid's perspective. The caller can update its own data, then notify the source and refresh the bound grid:

```typescript
import { GridCore, createColumnarDataSource } from "@gp-grid/core";

const values = [10, 20];
const source = createColumnarDataSource({
  rowCount: values.length,
  fields: [
    { field: "value", data: values },
    { field: "label", getValue: (row) => `Value ${values[row]}` },
  ],
});
const grid = new GridCore({
  columns: [
    { field: "value", cellDataType: "number", width: 100 },
    { field: "label", cellDataType: "text", width: 180 },
  ],
  dataSource: source,
  rowHeight: 32,
});
await grid.initialize();

// Same row count: only the revision needs to change.
values[0] = 15;
source.setRevision(1);
await grid.refresh();

// Append: pass the new count because this source declares rowCount explicitly.
values.push(30);
source.setRevision(2, values.length);
await grid.refresh();

// Shrink: update the declared count in the same way.
values.pop();
source.setRevision(3, values.length);
await grid.refresh();

grid.destroy(); // Wrappers manage their core's lifetime automatically.
```

`setRevision(revision, rowCount?)` updates source metadata; `await grid.refresh()` reloads the view, including any active sorting/filtering. Array-reference equality does not signal an update. When using a wrapper, call `refresh()` on its exposed core.

- **Inferred count:** omit `rowCount` when constructing the source and use `setRevision(nextRevision)`. The source re-reads the fields' declared lengths (`length`, falling back to `data.length`). Keep explicit field lengths current when data grows or shrinks.
- **Explicit count:** pass `setRevision(nextRevision, nextRowCount)` whenever the count changes. Omitting the second argument retains the last declared count.
- **Accessor-only fields:** the explicit count is authoritative, so `setRevision(nextRevision, nextRowCount)` works without replacing accessor functions or updating their length hints.

Update all resident columns to consistent lengths before adopting a revision. An invalid count or inconsistent declared lengths throws, leaving the source's previous revision and row-count metadata unchanged. This does not undo changes the caller has already made to its arrays. Keep data stable while the grid reads it.

Columnar rows have no materialized record: `grid.getRowData(viewIndex)` returns `undefined`. Read raw values with `grid.getCellValue(viewIndex, colIndex)` or `grid.getFieldValue(viewIndex, field)`, including source fields without a grid column. Cell renderers use `params.getValue(field)` and `params.rowId`; `params.value` remains the formatted display value.

#### Read-only write rejection

Every write entry point refuses a columnar source and reports it through the
`onWriteRejected` option, independently of a column's `editable` flag:

```typescript
const grid = new GridCore({
  columns,
  dataSource: source,
  rowHeight: 32,
  onWriteRejected: (event) => {
    // event.reason is always "read-only-source".
    // event.operation is one of:
    //   "setCellValue" | "edit" | "paste" | "fill" | "row-move"
    console.warn(`Refused ${event.operation} on row ${event.row}, col ${event.col}`);
  },
});
```

| Attempt | Result on a columnar source | `operation` |
| --- | --- | --- |
| `grid.setCellValue(row, col, value)` | value unchanged; rejection event | `"setCellValue"` |
| `grid.startEdit(row, col)` on an `editable` column | no edit state; rejection event | `"edit"` |
| `grid.pasteClipboardText(text)` | returns `false`; rejection event | `"paste"` |
| `grid.fill.startFillDrag(range)` | no active fill; rejection event | `"fill"` |
| `grid.commitRowDrag(from, to)` | no reorder and no `onRowDragEnd`; rejection event | `"row-move"` |

A non-editable column is a disabled control and emits no attempted-command
event. A rejected write never emits `onCellValueChanged`. React and Vue accept
`onWriteRejected` as a prop and Angular exposes it as an `(onWriteRejected)`
output; all three re-export `createColumnarDataSource` and friends.

### Server-Side Data Source

For large datasets that require server-side row-window loading, sorting, and filtering.

```typescript
import {
  createServerDataSource,
  DataSourceRequest,
  DataSourceResponse,
} from "@gp-grid/core";

interface Person {
  id: number;
  name: string;
  age: number;
}

const dataSource = createServerDataSource<Person>(
  async (request: DataSourceRequest) => {
    // Build query parameters from request
    const params = new URLSearchParams({
      offset: String(request.range.startRow),
      limit: String(request.range.endRow - request.range.startRow),
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
  query(request: DataSourceRequest): Promise<DataSourceResponse<TData>>;
}

interface DataSourceRequest {
  range: {
    startRow: number;
    endRow: number; // exclusive
  };
  sort?: SortModel[];
  filter?: FilterModel;
}

interface DataSourceResponse<TData> {
  rows: TData[];
  totalRows: number;
}
```

`createServerDataSource` uses paginated loading by default. The grid sends
one absolute `range`, so APIs can use `startRow` as an offset and
`endRow - startRow` as a limit. Use
`createServerDataSource(queryFn, { loadMode: "all" })` or
`rowLoading: { mode: "all" }` when you intentionally want load-all behavior.

Paginated cache aggressiveness is controlled through `rowLoading.cache`:

```typescript
const grid = new GridCore({
  columns,
  dataSource: createServerDataSource(fetchPeople),
  rowHeight: 36,
  rowLoading: {
    cache: {
      eviction: "aggressive", // "balanced" by default
      pageSize: 100,
      prefetchPages: 0,
      maxPages: 1,
    },
  },
});
```

## Types Reference

### ColumnDefinition

```typescript
interface ColumnDefinition {
  field: string; // Property path in row data
  colId?: string; // Unique column ID (defaults to field)
  cellDataType: CellDataType; // "text" | "number" | "boolean" | "date" | "object"
  width: number; // Initial width in pixels; live width lives in the core
  hidden?: boolean; // Initial visibility; live visibility lives in the core
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
interface CellRendererParams<TData = unknown> {
  value: CellValue;
  rowData?: TData;
  rowId?: RowId;
  columnId: string;
  getValue?: (field: string) => CellValue;
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
  columnId: string;
  colIndex: number;
  sortDirection?: SortDirection;
  sortIndex?: number;
  onSort: (direction: SortDirection | null, addToExisting: boolean) => void;
}
```

## Column identity and state

### The three layers

1. **Caller definitions** — the `columns` array you pass in. Immutable input: the grid never writes to it.
2. **Live column state** — per-column `width`, `hidden` and order, owned by the core and keyed by `ColumnId`.
3. **Resolved layout** — ordered definitions with the live state applied, plus positions, hit-testing and rendering.

`ColumnId` is `colId ?? field`, a plain string.

### Precedence

Definition defaults < retained user state < explicit commands.

A definition's `width`, `hidden` and position are initial defaults only. State retained from resizing, moving or hiding survives a `columns` replacement; passing a new array reference is never a reset. Definition order stays authoritative until a column is moved with `moveColumn`/`setColumnState({ order })`.

### Commands

```typescript
interface ColumnStateUpdate {
  columnId: string;
  width?: number;
  hidden?: boolean;
  order?: number;
}

interface ColumnStateSnapshot {
  columnId: string;
  width: number;
  hidden: boolean;
  order: number;
}
```

| Command | Behavior |
| --- | --- |
| `setColumnState(updates)` | Apply explicit state; values win over retained state and defaults. Unset properties are untouched. |
| `resetColumnState(columnIds?)` | Drop user state. No argument resets every column to its definition defaults; IDs reset only those columns. |
| `getColumnState()` | Effective width, visibility and order per column, in layout order. |

### Duplicate ids

Definitions with the same `ColumnId` warn once with `[gp-grid] Duplicate column id "x"` and the first definition wins.

### Frozen definitions

Definitions are caller-owned and the grid treats them as read-only. Resizing, moving and hiding record state in the core; they never mutate the definitions array or the objects inside it.

### Migrating from 0.x

```ts
// 0.x: mutated the caller's definition
columns[2].width = newWidth;
// 1.0
grid.setColumnState([{ columnId: "city", width: newWidth }]);
grid.resetColumnState(["city"]);
```

### Events

Column and row interaction events are object-shaped.

| Event | Payload |
| --- | --- |
| `onColumnResized` | `{ columnId, width, viewIndex }` |
| `onColumnMoved` | `{ columnId, fromViewIndex, toViewIndex }` |
| `onRowDragEnd` | `{ rowId, fromViewIndex, toViewIndex }` |

`CellValueChangedEvent` gained `columnId`; `colIndex` remains and is the current view column index. Cell, edit and header renderer params gained `columnId` as well.

### Record access

- `getViewRow(viewIndex): ViewRow<TData> | undefined` — `ViewRow` is `{ kind: "record"; id: RowId; viewIndex: number; record?: TData }`, built on request. `id` falls back to the source position when no `getRowId` is configured.
- `getRecordById(rowId): TData | undefined` — answers for resident rows and for sources that provide a direct lookup; columnar and server windows outside the resident set are not searched.
- `hasRow(viewIndex)` — whether the view row exists; a `null` cell is a value, not an unloaded row.
- `getSlotGeneration(rowIndex)` / `isSlotGenerationCurrent(rowIndex, generation)` — tag async renderer callbacks so stale slot assignments can be dropped.
- `getRowData(viewIndex)` — the source record, or `undefined` for record-less/unloaded rows.
- `getRowCount()` — the number of displayed view rows (after sort/filter).

## Column layout and geometry

Core owns grid geometry. `columnLayout` selects how displayed widths are
resolved and is changeable at runtime with `GridCore.setColumnLayout(mode)`:

- `"fit"` (default) expands columns without an explicit pixel override so
  their total reaches the viewport. It never shrinks; a manual override keeps
  its exact width and the slack is shared by the rest.
- `"fixed"` keeps declared/overridden widths and leaves leftover space empty.

`core.geometry` is a read-only query surface over the committed layout:

| Query | Answer |
| --- | --- |
| `revision` | Committed layout revision (columns, row axis, viewport dimensions and mapping parameters — not raw scroll) |
| `getColumnLayout()` | `{ revision, mode, columns, totalWidth }` per displayed column |
| `getRowWindow()` / `getVisibleRowWindow()` | Half-open `{ start, end }` |
| `getRowBounds(i, space?)` / `getColumnBounds(layoutIndex, space?)` / `getCellBounds(i, layoutIndex, space?)` | Bounds in the requested space |
| `hitTest({ x, y })` / `getScrollTarget(row, col)` | Pointer target / DOM scroll offsets |
| `getContentSize()` | Logical body size in `"content"` coordinates |

`GridCore.getCellBounds(rowId, columnId, space?)` resolves identities through
the bounded current row window and the resident records; a remote or columnar
identity outside that window answers `undefined` and is never materialized.

### Coordinate spaces

- **`content`** — logical, uncompressed px; the header is excluded.
- **`viewport`** — content minus the logical scroll offsets, relative to the
  body client area's top-left (the default).
- **`rows`** — local to the rows wrapper (the space of `MOVE_SLOT.translateY`);
  equal to `content` unless vertical scrolling is compressed.

Adapters report raw DOM scroll samples and normalized dimensions; core maps
them to logical coordinates and clamps them, emitting a `SCROLL_TO` correction
when the sample was out of range. A measured zero-height viewport renders no
rows; until the first measurement core assumes 600 px. A width-only viewport
update performs no row work. Windows are half-open; legacy inclusive APIs adapt at
the boundary as `{ start, end: end - 1 }` (`{ start: 0, end: -1 }` when empty).

## Creating a Framework Adapter

To integrate @gp-grid/core with any UI framework:

1. **Subscribe to instructions** using `onBatchInstruction()`
2. **Maintain UI state** by processing instructions
3. **Render slots** based on the slot pool state
4. **Forward user interactions** back to GridCore
5. **Render columns from `COLUMNS_CHANGED.layout`** and report viewport
   measurements through `setViewport`; never recompute widths or positions

### Example: Minimal Adapter Pattern

```typescript
import { GridCore, GridInstruction } from "@gp-grid/core";

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

| Method                                              | Description                                |
| --------------------------------------------------- | ------------------------------------------ |
| `initialize()`                                      | Initialize grid and load initial data      |
| `setViewport(scrollTop, scrollLeft, width, height)` | Update viewport on scroll/resize           |
| `setColumns(columns)`                               | Reconcile definitions by `ColumnId`        |
| `setColumnState(updates)`                           | Apply explicit width/hidden/order commands |
| `resetColumnState(columnIds?)`                      | Drop user column state                     |
| `getColumnState()`                                  | Effective width/hidden/order per column    |
| `setSort(colId, direction, addToExisting)`          | Set column sort                            |
| `setFilter(colId, value)`                           | Set column filter                          |
| `startEdit(row, col)`                               | Start editing a cell                       |
| `updateEditValue(value, editId?)`                   | Update the open edit's draft               |
| `commitEdit(editId?)`                               | Commit current edit                        |
| `cancelEdit(editId?)`                               | Cancel current edit                        |
| `refresh()`                                         | Refetch data from source                   |
| `getRowCount()`                                     | Displayed view-row count (after sort/filter) |
| `getRowData(viewIndex)`                             | Source record, or `undefined` when record-less/unloaded |
| `hasRow(viewIndex)`                                 | Whether the view row exists                |
| `getViewRow(viewIndex)`                             | Displayed row and its identity, built on request |
| `getRecordById(rowId)`                              | Source record by stable identity           |
| `getSlotGeneration(rowIndex)`                       | Current slot assignment generation         |
| `isSlotGenerationCurrent(rowIndex, generation)`     | Whether a slot generation is still current |

### GridCore Properties

| Property    | Description               |
| ----------- | ------------------------- |
| `selection` | SelectionManager instance |
| `fill`      | FillManager instance      |
| `geometry`  | Read-only geometry queries (bounds, hit test, scroll target, layout) |

## Donations

Keeping this library requires effort and passion, I'm a full time engineer employed on other project and I'm trying my best to keep this work free! For all the features.

If you think this project helped you achieve your goals, it's hopefully worth a beer! 🍻

[Support the project](https://www.gp-grid.io/support)
