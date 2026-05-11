# Using `@gp-grid/core` directly (vanilla JS, custom adapter)

This file is the reference for working with `@gp-grid/core` without one of the official wrappers. Most users should pick a framework reference (`react.md`, `vue.md`, `angular.md`) instead — this page is for:

1. **Vanilla JS / no framework apps** that want a grid.
2. **Building a wrapper** for a framework that doesn't have an official one yet (Svelte, Solid, Lit, etc.).
3. **Advanced introspection** — understanding what every wrapper does internally.

Cross-framework concepts (column shape, data source choice, features, programmatic API) live in `SKILL.md` — read that first.

## What `@gp-grid/core` actually is

The core is a headless engine. It manages:

- Viewport tracking and scroll synchronization
- A pool of reusable "slots" (DOM-shaped row containers) recycled as the user scrolls
- Data fetching, caching, sorting, filtering
- Selection, editing, fill handle, row drag, column resize/move state machines
- Keyboard navigation

It does **not** render anything. Instead, it emits **instructions** describing what the UI should do. An adapter consumes those instructions and applies them to whatever DOM/component model the host framework uses.

## Install

```bash
pnpm add @gp-grid/core
```

No peer dependencies. Works in any environment with a DOM (or in a non-DOM environment if you provide your own slot rendering).

## The minimal flow

```ts
import {
  GridCore,
  createClientDataSource,
  type ColumnDefinition,
  type GridInstruction,
} from "@gp-grid/core";

const data = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob",   age: 25 },
];

const columns: ColumnDefinition[] = [
  { field: "id",   cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text",   width: 200 },
  { field: "age",  cellDataType: "number", width: 100 },
];

const grid = new GridCore({
  columns,
  dataSource: createClientDataSource(data),
  rowHeight: 36,
  headerHeight: 40,
  overscan: 3,
});

// Subscribe to batched instructions
const unsubscribe = grid.onBatchInstruction((instructions: GridInstruction[]) => {
  for (const instr of instructions) {
    handleInstruction(instr); // your DOM/UI code
  }
});

await grid.initialize();

// Tell the core about the viewport size and current scroll
grid.setViewport(scrollTop, scrollLeft, viewportWidth, viewportHeight);

// On unmount:
unsubscribe();
grid.destroy();
```

## Instruction types

Every UI change is one of these instructions. Each wrapper has its own dispatch table; yours will too.

| Instruction | Meaning |
|---|---|
| `CREATE_SLOT` | Create a new row container in your DOM pool. |
| `DESTROY_SLOT` | Remove a slot from your pool. |
| `ASSIGN_SLOT` | Bind row data + row index to an existing slot. |
| `MOVE_SLOT` | Update a slot's `translateY` (vertical position). |
| `SET_ACTIVE_CELL` | Update the active cell highlight. |
| `SET_SELECTION_RANGE` | Update the selected range highlight. |
| `START_EDIT` / `STOP_EDIT` | Enter/exit edit mode for a cell. |
| `COMMIT_EDIT` | Edit committed; persist the new value. |
| `UPDATE_HEADER` | Re-render header (sort indicator changed, filter applied, etc.). |
| `START_FILL` / `UPDATE_FILL` / `COMMIT_FILL` / `CANCEL_FILL` | Fill handle drag lifecycle. |
| `OPEN_FILTER_POPUP` / `CLOSE_FILTER_POPUP` | Filter UI lifecycle. |
| `DATA_LOADING` / `DATA_LOADED` / `DATA_ERROR` | Data fetch lifecycle (show/hide loading overlay). |
| `ROWS_ADDED` / `ROWS_REMOVED` / `ROWS_UPDATED` / `TRANSACTION_PROCESSED` | Mutable data source events. |
| `COLUMNS_CHANGED` | Columns array changed — re-derive header layout. |
| `START_COLUMN_RESIZE` / `UPDATE_COLUMN_RESIZE` / `COMMIT_COLUMN_RESIZE` / `CANCEL_COLUMN_RESIZE` | Column resize lifecycle. |
| `START_COLUMN_MOVE` / `UPDATE_COLUMN_MOVE` / `COMMIT_COLUMN_MOVE` / `CANCEL_COLUMN_MOVE` | Column move lifecycle. |
| `START_ROW_DRAG` / `UPDATE_ROW_DRAG` / `COMMIT_ROW_DRAG` / `CANCEL_ROW_DRAG` | Row drag lifecycle. |
| `SET_HOVER_POSITION` | Update hover position (drives highlighting). |
| `SET_CONTENT_SIZE` | Update virtual content size (for the inner scroll surface). |

The full set is exported from `@gp-grid/core` as discriminated TypeScript types (`CreateSlotInstruction`, `DestroySlotInstruction`, etc., all under the `GridInstruction` union).

## Wiring user input

Forward DOM events to the core's input handler — the core converts them into instructions:

```ts
container.addEventListener("scroll", () => {
  grid.setViewport(
    container.scrollTop,
    container.scrollLeft,
    container.clientWidth,
    container.clientHeight,
  );
});

cell.addEventListener("pointerdown", (e) => {
  grid.input.cellPointerDown(rowIndex, colIndex, toPointerEventData(e));
});

document.addEventListener("keydown", (e) => {
  grid.input.keyDown(e, activeCell, editingCell, filterPopupOpen);
});

container.addEventListener("paste", (e) => {
  grid.input.pasteText(e.clipboardData?.getData("text/plain") ?? "", editingCell, filterPopupOpen);
});
```

The core exposes a unified `InputHandler` (`grid.input`) that returns small actions (`{ preventDefault, focusContainer, ... }`) you apply to the original event. There's also an **adapter kit** with shared primitives:

```ts
import {
  toPointerEventData,
  AutoScrollDriver,
  PendingRowDragController,
  applyBatchInstructions,
  DataSourceOwner,
  InputEventAdapter,
} from "@gp-grid/core";
```

These exist because every wrapper needs them. Use them instead of reinventing.

## Imperative API

Outside of input wiring, the imperative methods on `GridCore` are the same set the framework wrappers expose:

```ts
grid.setSort("colId", "asc", false);            // or "desc", null to clear; addToExisting controls multi-sort
grid.setFilter("colId", { /* ColumnFilterModel */ } /* or null */);
grid.startEdit(rowIndex, colIndex);
grid.commitEdit();
grid.cancelEdit();
grid.setDataSource(newDataSource);              // hot-swap, preserves state
grid.refresh();                                  // re-fetch from data source
grid.refreshFromTransaction();                   // apply mutable ds queued txns
grid.getRowCount();
grid.getRowData(rowIndex);
grid.selection.startSelection({ row, col }, { shift, ctrl });
grid.fill.startFill(/* ... */);
grid.highlight?.updateOptions(highlighting);
grid.destroy();                                  // release everything
```

See `packages/core/README.md` for the canonical surface.

## Custom data source

Implement the `DataSource<TData>` interface:

```ts
import type { DataSource, DataSourceRequest, DataSourceResponse } from "@gp-grid/core";

class GraphQLDataSource<T> implements DataSource<T> {
  async fetch(request: DataSourceRequest): Promise<DataSourceResponse<T>> {
    // DataSourceRequest exposes `range: { startRow, endRow }` (endRow exclusive),
    // NOT a `pagination` field. Derive page/pageSize from the range.
    const pageSize = request.range.endRow - request.range.startRow;
    const pageIndex = Math.floor(request.range.startRow / pageSize);
    const result = await client.query({
      query: ROWS_QUERY,
      variables: {
        page: pageIndex,
        pageSize,
        sort: request.sort,
        filter: request.filter,
      },
    });
    return { rows: result.data.rows, totalRows: result.data.totalCount };
  }

  destroy(): void {
    // optional cleanup
  }
}
```

For mutability, wrap the prebuilt `createMutableClientDataSource` or implement the `MutableDataSource<T>` interface yourself.

## Building a wrapper for a new framework

The minimal wrapper does five things, in order:

1. **Render a stable container DOM** with explicit dimensions and a body that the core will fill with virtual scroll content.
2. **Instantiate `GridCore`** with the user's options.
3. **Subscribe to `onBatchInstruction`** and dispatch each instruction to your framework's reactive layer. Use `applyBatchInstructions` from the adapter kit if your framework has a state container that matches the shape.
4. **Wire input events** — pointer, key, wheel, paste, scroll, resize. Use `toPointerEventData` to normalize pointer events for `grid.input.*`.
5. **Forward output callbacks** — `onCellValueChanged`, `onRowDragEnd`, `onColumnResized`, `onColumnMoved` — back out to the user's API.

For a complete reference implementation, read **`packages/react/src/Grid.tsx`** and **`packages/react/src/gridState/`** end to end. The Vue wrapper (`packages/vue/src/GpGrid.vue` + `packages/vue/src/gridState/`) is the same shape with Vue reactivity. The Angular wrapper (`packages/angular/src/lib/gp-grid.component.ts` + `gp-grid-bindings.ts` + `gp-grid-view-model.ts`) is the same shape with signals.

The README at `packages/core/README.md` includes a minimal `MyGridAdapter` skeleton showing the dispatch loop.

## Default cell rendering

If you don't provide a `cellRenderer`, the core ships a default that:

1. Calls the column's `valueFormatter(value)` if defined.
2. Otherwise stringifies via `formatCellValue(value, cellDataType)` — handles `text`, `number`, `boolean`, `date`, `object` with reasonable defaults.

Adapters can call `formatCellValue` (exported from `@gp-grid/core`) to match the default in their own renderers.

## CSS

The core also ships the canonical CSS. Wrappers re-export it. From vanilla JS:

```ts
import { gridStyles } from "@gp-grid/core";

const style = document.createElement("style");
style.textContent = gridStyles;
document.head.appendChild(style);
```

Or import the `.css` file the wrapper bundles. The CSS uses `:where()` selectors throughout so users can override styles without specificity wars.

## Source you should read

These are the most useful source files for a deep understanding of the core, in order:

| File | What it shows |
|---|---|
| `packages/core/README.md` | High-level architecture, philosophy, full API listing. |
| `packages/core/src/grid-core.ts` | The `GridCore` class — top-level orchestration. |
| `packages/core/src/types/options.ts` | `GridCoreOptions`, `RowLoadingOptions`. |
| `packages/core/src/types/columns.ts` | `ColumnDefinition` — every option in the column. |
| `packages/core/src/data-source/index.ts` | All four data source factories. |
| `packages/core/src/index.ts` | Full public surface (~250 lines, well organized). |
| `packages/core/src/adapter/` | Shared primitives every wrapper uses. |
| `packages/react/src/Grid.tsx` | Reference adapter implementation (~600 lines, very readable). |

When in doubt, read the source — it's straightforward TypeScript with no runtime dependencies, and reading the React wrapper is the fastest way to internalize the integration pattern.
