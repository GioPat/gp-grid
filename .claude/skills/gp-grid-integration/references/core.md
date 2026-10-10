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
| `ASSIGN_SLOT` | Bind row data + row index to an existing slot. Under a hierarchy it carries `row` (`HierarchyRow`: kind, id, depth), published as `SlotData.row`. |
| `MOVE_SLOT` | Update a slot's `translateY` (vertical position). |
| `SET_ACTIVE_CELL` | Update the active cell highlight. |
| `SET_SELECTION_RANGE` | Update the selected range highlight. |
| `START_EDIT` / `STOP_EDIT` | Enter/exit edit mode for a cell. `START_EDIT` carries `editId` (the edit session token) and is re-sent with the current draft as `initialValue` when the edited column moves. |
| `COMMIT_EDIT` | Edit committed; persist the new value. |
| `UPDATE_HEADER` | Re-render header (sort indicator changed, filter applied, etc.). |
| `START_FILL` / `UPDATE_FILL` / `COMMIT_FILL` / `CANCEL_FILL` | Fill handle drag lifecycle. |
| `OPEN_FILTER_POPUP` / `CLOSE_FILTER_POPUP` | Filter UI lifecycle. |
| `DATA_LOADING` / `DATA_LOADED` / `DATA_ERROR` | Data fetch lifecycle (show/hide loading overlay). `DATA_LOADED.hierarchical` is `true` while a hierarchy is bound (`GridState.hierarchical`). |
| `ROWS_ADDED` / `ROWS_REMOVED` / `ROWS_UPDATED` / `TRANSACTION_PROCESSED` | Mutable data source events. |
| `COLUMNS_CHANGED` | Columns replaced — schema reconciles by id in one batch (surviving ids keep live state, definition order is authoritative), then `REMOVE_HEADERS` drops headers for ids no longer present. |
| `START_COLUMN_RESIZE` / `UPDATE_COLUMN_RESIZE` / `COMMIT_COLUMN_RESIZE` / `CANCEL_COLUMN_RESIZE` | Column resize lifecycle. |
| `START_COLUMN_MOVE` / `UPDATE_COLUMN_MOVE` / `COMMIT_COLUMN_MOVE` / `CANCEL_COLUMN_MOVE` | Column move lifecycle. |
| `START_ROW_DRAG` / `UPDATE_ROW_DRAG` / `COMMIT_ROW_DRAG` / `CANCEL_ROW_DRAG` | Row drag lifecycle. |
| `SET_HOVER_POSITION` | Update hover position (drives highlighting). |
| `SET_CONTENT_SIZE` | Update virtual content size (for the inner scroll surface). |
| `SET_COLUMN_WINDOW` | Publish `GridState.columnWindow` — the admitted pins plus the bounded center window a wrapper mounts instead of every displayed column. |
| `SET_ROW_REGIONS` | Publish `GridState.rowRegions` (`{ frozenCount, frozenExtent, suffixViewportHeight, frozen }`), emitted in the same batch as `SET_CONTENT_SIZE` and the slot instructions whenever the frozen/suffix split changes. |
| `SET_ANNOUNCEMENT` | Publish `GridState.announcement` (`{ message, revision }`) — live-region text the core decided, for example a reduced frozen prefix or a rejected column-group change. |
| `SET_HEADER_BANDS` | Publish `GridState.headerBands` (`{ count, heights, offsets, totalHeight }`). The header height is core-owned: size the header, the body sizer and the overlays from `totalHeight`. |

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

Pointer drags also need the container's client box, which carries the direction:
`grid.input.handleDragMove(toPointerEventData(e), readContainerBounds(bodyEl))`.
Core reads no `direction` itself — it works in inline-start-relative x, so build
bounds with `readContainerBounds` and convert physical x with `toInlineX` /
`toPhysicalX`; `normalizeHorizontalKey(key, rtl)` swaps the horizontal arrows in
RTL. `scrollLeft` in `ContainerBounds` is the inline-relative value (the DOM
value negated in RTL), while `grid.setViewport` takes the physical DOM value.

The core exposes a unified `InputHandler` (`grid.input`) that returns small actions (`{ preventDefault, focusContainer, ... }`) you apply to the original event. There's also an **adapter kit** with shared primitives:

```ts
import {
  toPointerEventData,
  AutoScrollDriver,
  PendingRowDragController,
  applyBatchInstructions,
  PendingScrollLatch,
  DataSourceOwner,
  InputEventAdapter,
} from "@gp-grid/core";
```

These exist because every wrapper needs them. Use them instead of reinventing.

**Wheel.** `grid.input.handleWheel(e.deltaY, e.deltaX, dampening, e.deltaMode)`
(or `adapter.wheel(e, dampening)` on `InputEventAdapter`) returns `null` unless
the grid is scaled; otherwise `preventDefault()` and apply `{ dy, dx }`, both in
pixels. Only `dy` is dampened. Pass `dy` to `TouchScrollController.scrollByWheel`
and write it to `scrollTop` yourself only when that returns `false`.

**Scroll motion.** While a touch fling or a wheel glide is moving the content
(`grid.viewport.isScrollMotionActive()`), a press only stops it: the pointer
entry points of `grid.input` (cell, header click, column move and resize, row
resize, fill handle, group toggle) return
`{ preventDefault: true, stopPropagation: true }` and do nothing else, so apply
the result as usual. `grid.viewport.interruptScrollMotion()` stops the motion on
demand. `TouchScrollController` registers itself; a custom scroller registers a
`ScrollMotionHandle` (`{ isActive(), interrupt() }`) with
`grid.viewport.setScrollMotionHandle(handle)` and removes it with
`clearScrollMotionHandle(handle)`.

**Group expander.** Route its pointer down to
`adapter.groupTogglePointerDown(rowIndex, event)` or call
`grid.input.handleGroupToggle(rowIndex, event.pointerType)` after
`event.stopPropagation()`, and stop its `dblclick` too: a double-click on a group
row already toggles through `handleCellDoubleClick`.

**Edit commits** are coerced by the column's `cellDataType`, like paste, so a
text draft on a `number` column is stored as a number.

## Imperative API

Outside of input wiring, the imperative methods on `GridCore` are the same set the framework wrappers expose:

```ts
grid.sortFilter.setSort("colId", "asc", false);      // or "desc", null to clear; addToExisting controls multi-sort
grid.sortFilter.setFilter("colId", { /* ColumnFilterModel */ } /* or null */);
grid.edit.start(rowIndex, colIndex);
grid.edit.commit();
grid.edit.cancel();
// Custom adapters: tag editor callbacks with the session token from START_EDIT /
// edit.getState().editId so a callback from a closed editor is ignored.
grid.edit.updateValue(value, editId);
grid.edit.commit(editId);
grid.edit.paste(text);                              // tab/newline text at the selection
grid.setDataSource(newDataSource);                  // hot-swap, preserves state
grid.refresh();                                     // re-fetch from data source
grid.refreshFromTransaction();                      // apply mutable ds queued txns
grid.rows.getCount();                               // displayed view-row count
grid.rows.getData(viewIndex);                       // source record, or undefined
grid.rows.has(viewIndex);                           // whether the view row exists
grid.rows.getViewRow(viewIndex);                    // record, group or total row + viewIndex | undefined
grid.rows.getRecordById(rowId);                     // source record for a stable id
grid.cells.getValue(row, col);                      // cell value; cells.setValue writes one
grid.cells.getBounds(rowId, columnId, "viewport");  // identity-addressed cell bounds
grid.columns.setState([{ columnId, width, hidden, order, pinned }]);
grid.columns.setPinned(columnId, "start");          // "end", or null to unpin
grid.columns.setLayout("fixed");                    // or "fit" (default)
grid.columns.resetState([columnId]);                // omit arg to reset all
grid.columns.getState();                            // [{ columnId, width?, resolvedWidth, hidden, order, pinned, region }]
grid.geometry.getColumnLayout();                    // { revision, mode, columns, totalWidth, regions }
grid.geometry.getColumnWindow();                    // { layout, range, start, center, end }
grid.geometry.getColumnClip(0);                     // viewport x-range of that column's region
grid.frozenRows.get();                              // { requestedCount, effectiveCount, limit }
grid.frozenRows.set({ count: 3 });                  // replaces the whole config; omitted limits take defaults
grid.frozenRows.freezeThrough(4);                   // count = 5, current limits kept; -1 unfreezes
grid.geometry.getRowRegions();                      // { frozenCount, frozenExtent, suffixViewportHeight, frozen }
grid.geometry.getRowClip(0);                        // viewport y-range of that row's region
grid.rowHeights.set([{ rowId: 2, height: 96 }]);    // heights by identity; all-or-nothing, finite and > 0
grid.rowHeights.reset([2]);                         // or reset() for every stored height
grid.rowHeights.getOverrides();                     // [{ rowId, height }] in insertion order, pending included
grid.rowHeights.fit();                              // one-shot fit of mounted rows; needs a measurementHost
grid.rowHeights.setResizable(true);                 // the rowResize option at runtime
grid.columns.fit(["name"]);                         // one-shot fit of mounted columns; "stale" in the same task as a column change
grid.columns.setState([{ columnId, width: null }]); // drop a width override
grid.columns.set(columns, groups);                  // definitions and hierarchy together; null = flat, undefined keeps it
grid.columns.setGroups(groups);                     // ColumnSchemaResult: applied | unchanged | rejected
grid.columns.getGroup("person");                    // the active group definition, or undefined
grid.header.getBands();                             // { count, heights, offsets, totalHeight }
grid.header.setBandHeights([40]);                   // band 0 is 40 px, the rest headerHeight
grid.rowGroups.isActive();                          // a hierarchy is bound
grid.rowGroups.setExpanded(null, true);             // null = every group; { status: applied | unchanged | unsupported }
grid.rowGroups.toggle(groupId);                     // flip one visible group
grid.rowGroups.setGrouping(createRowGrouping({ dimensions: [{ field: "country" }] })); // null = flat; no query
grid.viewport.isScrollMotionActive();               // a fling or wheel glide is moving the content
grid.viewport.interruptScrollMotion();              // stop it where it is
grid.geometry.getCellBounds(0, 0, "viewport");      // { top, left, width, height, ... }
grid.geometry.hitTest({ x: 10, y: 10 });            // { row, displayIndex, col, columnId?, region }
grid.geometry.getScrollTarget(12, 0);               // { scrollTop?, scrollLeft? }
grid.rows.getSlotGeneration(rowIndex);              // slot recycle guard
grid.rows.isSlotGenerationCurrent(rowIndex, generation);
grid.selection.startSelection({ row, col }, { shift, ctrl });
grid.fill.startFill(/* ... */);
grid.highlight?.updateOptions(highlighting);
grid.destroy();                                     // release everything
```

See `packages/core/README.md` for the canonical surface.

## Custom data source

Implement the `DataSource<TData>` interface:

```ts
import type { DataSource, DataSourceRequest, DataSourceResponse } from "@gp-grid/core";

class GraphQLDataSource<T> implements DataSource<T> {
  async query(request: DataSourceRequest): Promise<DataSourceResponse<T>> {
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

### Returning rows you grouped yourself

A source that already holds grouped rows returns a `HierarchicalRowAccess` as
`access`, with `rows: []` and `loadMode: "all"`. It imports types only; do not
also set `rowGrouping` (rejected with `hierarchical-source`).

```ts
import type { CellValue, DataSource, HierarchicalRowAccess, HierarchyRow } from "@gp-grid/core";

interface Entry {
  row: HierarchyRow; // { kind: "record" | "group" | "total", id, depth, ... }
  values: Record<string, CellValue>;
}

const createGroupedSource = (entries: readonly Entry[]): DataSource<never> => ({
  loadMode: "all",
  query: async () => {
    const access: HierarchicalRowAccess = {
      hierarchical: true,                 // the flag the grid detects
      rowCount: entries.length,           // view rows, all resident
      getRowId: (viewRow) => entries[viewRow]?.row.id ?? viewRow,
      getRow: (viewRow) => entries[viewRow]?.row,
      getValue: (viewRow, field) => entries[viewRow]?.values[field] ?? null, // aggregate or null on group rows
      locate: (id) => entries.findIndex((entry) => entry.row.id === id),     // nearest visible ancestor when hidden, -1 when gone
    };
    return { rows: [], totalRows: access.rowCount, access };
  },
});
```

Optional members are capabilities: `setExpanded(ids | null, expanded): boolean`
(without it the expansion commands return `"unsupported"`), `getRecord(viewRow)`
(without it every row is read-only) and `recordsChanged(changes): boolean`
(called once per edit, paste or fill; `true` when view rows moved). Ids must be
unique and stable across queries. Sort and filter arrive in the request; the
grid never regroups or re-aggregates a supplied hierarchy. See
[docs/features/row-grouping.md](../../../docs/features/row-grouping.md).

## Building a wrapper for a new framework

The minimal wrapper does five things, in order:

1. **Render a stable container DOM** with explicit dimensions and a body that the core will fill with virtual scroll content.
2. **Instantiate `GridCore`** with the user's options.
3. **Subscribe to `onBatchInstruction`** and dispatch each instruction to your framework's reactive layer. Use `applyBatchInstructions` from the adapter kit if your framework has a state container that matches the shape. Feed every batch to a `PendingScrollLatch` too, and after each render `take()` the latched `SCROLL_TO` and write it to the scroll element: coalesced batches must not drop a correction.
4. **Wire input events** — pointer, key, wheel, paste, scroll, resize. Use `toPointerEventData` to normalize pointer events for `grid.input.*`.
5. **Forward output callbacks** — `onCellValueChanged`, `onWriteRejected`, `onRowDragEnd`, `onColumnResized`, `onRowResized`, `onColumnMoved`, `onColumnPinned`, `onColumnSchemaRejected` — back out to the user's API. Column/row interaction events are object-shaped in every wrapper (a deliberate 0.x→1.0 break, no compatibility adapter): `onColumnResized({ columnId, width, viewIndex })`, `onColumnMoved({ columnId, fromViewIndex, toViewIndex })`, `onColumnPinned({ columnId, pinned })`, `onRowDragEnd({ rowId, fromViewIndex, toViewIndex })`. `CellValueChangedEvent` also carries `columnId`; `colIndex` stays the current view column index and `field` remains the source field. Wrappers also apply a controlled `columnState` input through `grid.columns.setState`.
6. **Render the mounted column window**, not every displayed column: `GridState.columnWindow` gives `start` / `center` / `end` resolved columns, each with a region-local `regionOffset`. Key cells and headers by `columnId` so a column keeps its DOM node when it changes region, and place `lineX` / `dropIndicatorX` (viewport x) and the fill handle's region-local `left` directly.
7. **Render the frozen prefix from `GridState.rowRegions`**, only while `frozenCount > 0`: a sticky block of height `frozenExtent` for the frozen center cells, plus a sibling sticky layer at the sizer level for their pinned cells (a pin inside the horizontally scrolling block would ride its content box out of the viewport). Split slots by `SlotData.region`, never by `rowIndex < frozenCount`, render `SlotData.loading` frozen rows as cell-less placeholders, and render `GridState.announcement` in one `aria-live="polite"` region. `freezeRows: { count, maxCount?, minSuffixHeight? }` is the option; a wrapper applies a changed prop through `frozenRows.set(config?)`, which replaces the whole config (omitted fields take the defaults) and stays silent for an equal-valued call, so no remount is needed. `frozenRows.get()` reports the effective count and its limiting constraint.
8. **Pass a measurement host and render the header bands.** Give `GridCore` `measurementHost: createDomMeasurementHost(() => rootEl)` in the browser only, and render `data-layout-revision` (from `columnWindow.layout.revision`) on that root, so `rowHeights.fit` and `columns.fit` work and detect a stale layout. Header cells carry `data-col-index`, body cells `data-cell-row` and `data-cell-col`. Render the `aria-hidden` edge handles (`.gp-grid-header-resize-handle`, and `.gp-grid-row-resize-handle` in every non-editing cell while `rowResize` is on) and wire them through `InputEventAdapter.resizePointerDown`, `rowResizePointerDown` and `resizeDoubleClick`, stopping propagation on pointer down and double-click; pass `altKey` with key events. Render `GridState.headerBands` and the fragments in `columnWindow.groups` (each at `regionOffset`, `offsets[band]`, its run width and the band height), and build ids and ARIA with `leafHeaderId`, `fragmentHeaderId`, `leafHeaderBox`, `fragmentHeaderBox` and `resolveHeaderAssociations`. Number ARIA rows with the header bands first: a body row's `aria-rowindex` is its view index plus `headerBands.count` plus 1.
9. **Render hierarchy rows from `SlotData.row`** (absent while flat). The root is `role="treegrid"` while `GridState.hierarchical`; a row carries `aria-level = depth + 1`, `data-row-kind`, `--gp-grid-group-depth`, and a group row `aria-expanded` plus `.gp-grid-row--group` (`.gp-grid-row--total` for the total row). The label column is `resolveGroupLabelColumnId(state.layout, preferred)`; its cell is `.gp-grid-cell--group-indent` on every row, and on a group or total row also `.gp-grid-cell--group-label` holding `span.gp-grid-group-toggle[aria-hidden="true"]` and `span.gp-grid-group-label` with `formatGroupLabel(row, columns, labels)`. Every cell of a group or total row is `aria-readonly="true"`; skip the renderer when `isEmptyGroupCell(row.kind, value)`, and pass `rowKind` to it otherwise. Forward `onRowGroupToggled` and `onRowGroupingRejected`, and apply a changed grouping with `grid.rowGroups.setGrouping`.

For a complete reference implementation, read **`packages/react/src/Grid.tsx`** and **`packages/react/src/gridState/`** end to end. The Vue wrapper (`packages/vue/src/GpGrid.vue` + `packages/vue/src/gridState/`) is the same shape with Vue reactivity. The Angular wrapper (`packages/angular/src/lib/gp-grid.component.ts` + `gp-grid-bindings.ts` + `gp-grid-view-model.ts`) is the same shape with signals.

The README at `packages/core/README.md` includes a minimal `MyGridAdapter` skeleton showing the dispatch loop.

## Default cell rendering

If you don't provide a `cellRenderer`, the core ships a default that:

1. Calls the column's `valueFormatter(value)` if defined.
2. Otherwise stringifies via `formatCellValue(value, cellDataType)` — handles `text`, `number`, `boolean`, `date`, `object` with reasonable defaults.

Adapters can call `formatCellValue` (exported from `@gp-grid/core`) to match the default in their own renderers.

### Localization and long text

- **Labels:** the core exports the label model and helpers — `GridLabels`, `GridLabelOverrides`, `GridFilterOperatorLabels`, `defaultGridLabels`, `resolveGridLabels(overrides)`, and `formatLabel(template, params)`. The pin action uses `pinLeftColumn`, `pinRightColumn` and `unpinColumn`; the frozen-prefix announcement uses `frozenRowsLimited` (tokens `{effective}` and `{requested}`). `GridCoreOptions.labels` accepts overrides directly, so a core-only consumer can localize what the core formats. The official wrappers resolve a `GridLabelOverrides` prop into full labels and pass them to their UI; a custom adapter should do the same. `resolveGridLabels` shallow-merges top-level keys (and one level deep for `operators`) and never mutates the defaults.
- **Pin icon:** `GridIcon` is `{ path: string; viewBox?: string }`; `defaultPinIcon` is the framework-neutral SVG definition used by the wrappers.
- **Long text:** `ColumnDefinition.wrapText` (default `false`) makes the default renderer wrap overflowing text onto new lines instead of truncating with an ellipsis. The canonical CSS already ships the `.gp-grid-cell--wrap` and `.gp-grid-cell-content` rules, so adapters that apply the core's cell classes get this for free.

## CSS

The core ships the canonical stylesheet as a real CSS file, `@gp-grid/core/dist/styles.css` (wrappers copy it to `@gp-grid/<wrapper>/dist/styles.css`). It is not exported as a JS string, so import the file once at the app entry point with your bundler, or link it from HTML:

```ts
import "@gp-grid/core/dist/styles.css";
```

The CSS uses `:where()` selectors throughout so users can override styles without specificity wars.

## Source you should read

These are the most useful source files for a deep understanding of the core, in order:

| File | What it shows |
|---|---|
| `packages/core/README.md` | High-level architecture, philosophy, full API listing. |
| `packages/core/src/grid-core.ts` | The `GridCore` class — top-level orchestration. |
| `packages/core/src/types/options.ts` | `GridCoreOptions`, `RowLoadingOptions`. |
| `packages/core/src/types/columns.ts` | `ColumnDefinition` — every option in the column. |
| `packages/core/src/column-model.ts` | Column id resolution, duplicate-id diagnostic, live column state and resolved layout. |
| `packages/core/src/grid-core-view-sync.ts` | One instruction batch per schema/layout change; `REMOVE_HEADERS` on column removal. |
| `packages/core/src/data-source/index.ts` | All four data source factories. |
| `packages/core/src/index.ts` | Full public surface (~250 lines, well organized). |
| `packages/core/src/adapter/` | Shared primitives every wrapper uses. |
| `packages/react/src/Grid.tsx` | Reference adapter implementation (~600 lines, very readable). |

When in doubt, read the source — it's straightforward TypeScript with no runtime dependencies, and reading the React wrapper is the fastest way to internalize the integration pattern.
