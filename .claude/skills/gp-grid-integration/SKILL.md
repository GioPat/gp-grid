---
name: gp-grid-integration
description: Integrate the gp-grid data grid library (https://gp-grid.io) into a React, Vue 3, Angular, or vanilla JS app. Covers installation, columns, client/server data sources, custom cell/edit/header renderers, sorting, filtering, editing with fill handle, row dragging, column resize/move/hide, highlighting, and the programmatic GridCore API. TRIGGER when the user names gp-grid or any @gp-grid/* package (@gp-grid/core, @gp-grid/react, @gp-grid/vue, @gp-grid/angular), uses a gp-grid-specific identifier (useGridData, createGridData, provideGridData, GpGridComponent, createServerDataSource, createClientDataSource, AngularColumnDefinition, GridCore), asks how to write a renderer for gp-grid, asks to wire any gp-grid feature into their app, or asks to migrate FROM AG Grid / TanStack Table / MUI DataGrid TO gp-grid. DO NOT trigger for generic table/virtualization questions where the user hasn't chosen gp-grid, for competing libraries (AG Grid, TanStack, MUI DataGrid, react-window, react-virtualized) without an explicit migration intent, or for CSS Grid layout questions.
---

# gp-grid integration

This skill helps users integrate the **gp-grid** data grid library (https://www.gp-grid.io) into their applications. gp-grid is a high-performance, framework-agnostic grid that handles millions of rows via slot-based virtual scrolling, with zero external dependencies and every feature included (no enterprise pay walls).

The library ships as a framework-agnostic core plus thin official wrappers:

- `@gp-grid/react` — React 18+
- `@gp-grid/vue` — Vue 3
- `@gp-grid/angular` — Angular 18+
- `@gp-grid/core` — vanilla / custom adapter

## How to use this skill

1. **Identify the user's framework** before writing any code. Check `package.json`, the file extensions in the project, or what the user says. The component name, renderer type, and data hook differ per framework — do NOT mix them up.
2. **Read the matching reference once** before generating code:
   - React → `references/react.md`
   - Vue 3 → `references/vue.md`
   - Angular → `references/angular.md`
   - Vanilla JS / writing a custom adapter → `references/core.md`
3. **Apply integration steps from that reference.** Imports, component names, and renderer signatures are specific — paraphrasing from memory is the most common way to produce broken code (e.g. mixing `<Grid>` with `:data-source` Vue syntax, or using a JSX renderer in an Angular column).
4. **For anything beyond setup, also use the cross-framework guidance below.** Column shape, data sources, features, and gotchas are identical across wrappers; only syntax differs.

If the user hasn't picked a framework yet and is asking which one to use, recommend whatever matches the rest of their stack — gp-grid feature parity is identical across wrappers.

---

## What's the same in every framework

These don't depend on which wrapper the user is using; the framework reference assumes you've internalized this section.

### Container sizing

The grid fills its parent. The parent **must** have an explicit width and height — otherwise the grid renders 0×0 and the user thinks it's broken. Inline `style={{ width: ..., height: ... }}`, fixed pixels, flex-1 inside a sized flex parent, or `100vh` all work; ambient `auto` does not. This is the #1 setup bug.

### CSS import

Stylesheets are not auto-injected (since `v0.11.0`). Import the CSS exactly **once** at the app entry point:

- React: `import "@gp-grid/react/dist/styles.css";` in `main.tsx` / `index.tsx`
- Vue: `import "@gp-grid/vue/dist/styles.css";` in `main.ts`
- Angular: add `@import "@gp-grid/angular/dist/styles.css";` to `styles.css`, or list it in `angular.json` → `architect.build.options.styles`

Forgetting this is the #2 setup bug ("the grid renders but looks unstyled / no borders / no header background").

### Column definition (`ColumnDefinition`)

Each column needs `field`, `cellDataType`, and `width`. Other fields are optional but commonly used:

| Field | Default | Purpose |
|---|---|---|
| `field` | required | Property path on the row. Dot notation supported: `"address.city"`. |
| `cellDataType` | required | One of: `"text"`, `"number"`, `"boolean"`, `"date"` (Date object), `"dateString"` (ISO string `"2026-05-10"`), `"dateTime"` (Date object with time), `"dateTimeString"` (ISO string with time `"2026-05-10T14:30:00Z"`), `"object"`. Match the underlying TypeScript type — `string` fields backed by ISO dates should use `"dateString"`/`"dateTimeString"`, NOT `"date"` (which expects an actual `Date` instance and will misformat strings). |
| `width` | required | Declared width in pixels. In the default `columnLayout: "fit"` the columns without an explicit resize override expand proportionally so their total reaches the viewport; `fit` never shrinks, and `columnLayout: "fixed"` keeps the declared widths and scrolls horizontally. A width that is not positive and finite falls back to `50`. |
| `colId` | `field` | Unique column id (useful when two columns share a `field`). |
| `headerName` | `field` | Display name shown in the header. |
| `editable` | `false` | Inline editing on this column. |
| `sortable` | `true` | Click header to sort. Shift+click for multi-sort. |
| `filterable` | `true` | Filter dropdown available on header. |
| `hidden` | `false` | Hide column without removing it from the array. |
| `pinned` | none | Initial pin: `"start"` or `"end"` abuts that viewport edge while the center columns scroll. An explicit `pinned: null` command unpins. |
| `resizable` | `true` | Drag right edge of header to resize. |
| `movable` | `true` | Drag header body to reorder columns. |
| `minWidth` / `maxWidth` | `50` / unlimited | Resize bounds. |
| `rowDrag` | `false` | This column acts as the row drag handle. |
| `cellRenderer` / `editRenderer` / `headerRenderer` | none | Custom rendering — exact type **differs per framework**, see references. This takes the value formatted data from the `valueFormatter` field. |
| `valueFormatter` | none | `(value: CellValue) => string`. Used by the default cell renderer. Useful for `object` columns or display formatting (currency, dates) without writing a full renderer. |
| `wrapText` | `false` | Wrap long cell text onto new lines instead of truncating with an ellipsis. Wrapped text is clipped to the fixed row height (rows do **not** auto-grow). Only affects the default text renderer, not custom `cellRenderer` output. |
| `computeRowClasses` / `computeColumnClasses` / `computeCellClasses` | none | Per-column/row/cell highlighting overrides — see Highlighting below. |

### Column layout (`columnLayout`)

`columnLayout` selects how displayed widths are resolved and is available on the
core (`GridCoreOptions`) and every wrapper (`Grid` / `GpGrid` / `gp-grid`):

- `"fit"` (default) — columns without an explicit override expand so the total
  reaches the viewport width. An explicit override always keeps its exact
  pixel width and the slack is shared by the rest.
- `"fixed"` — displayed width equals the declared/overridden width; leftover
  space stays empty and the grid scrolls horizontally.

Changing it at runtime republishes the layout without recreating the core
(`coreRef.current.setColumnLayout("fixed")`). A manual resize stores the pixel
override directly: `core.getColumnState()` reports `width` only while an
override exists, plus `resolvedWidth` (the displayed CSS px, `0` while hidden).

Advanced adapters read geometry from `core.geometry` rather than recomputing
positions: `getColumnLayout()`, `getCellBounds(row, col, space)`,
`hitTest({ x, y })`, `getScrollTarget(row, col)` and `getContentSize()`. The
three coordinate spaces are `"content"`, `"viewport"` (default) and `"rows"`.
See [docs/features/column-layout.md](../../../docs/features/column-layout.md).

### Column pinning and wide grids

Pin a column with `pinned: "start"` / `pinned: "end"` on its definition, or at
runtime with `core.setColumnPinned(columnId, "start" | "end" | null)` (`null`
unpins). `onColumnPinned({ columnId, pinned })` fires for that command, the
header pin toggle and a cross-region header drag — `setColumnState` stays
silent. Wrappers take `columnOverscan` (default `240` CSS px).

A pin is a **request**, not a guarantee:

- Admission fills start pins outer→inner while they fit the viewport, then end
  pins with what is left; the first rejection closes its region. Start wins
  over end.
- A rejected pin keeps its request and renders as a scrolling center column
  until the host is wide enough to admit it. Read the effective region from
  `core.getColumnState()` (`region`), not from the request.
- An unmeasured viewport (SSR without `initialWidth`) admits every pin.
- `order` clamps into a column's own region; only a pin change moves a column
  between regions, and unpinning returns it to its base-order slot.

Only the admitted pins plus a bounded window of center columns are mounted, so
a 10,000-column grid renders roughly as many cells as a 20-column one.
`state.columnWindow` is `{ layout, range, start, center, end }`; a
`scrollLeft`-only viewport update does no row work. An open editor keeps its
column mounted outside the window until the edit commits or cancels.

Pinning is inline-start based, so it mirrors in RTL. Core never reads
`direction`: adapters build input bounds with `readContainerBounds(el)` and use
`toInlineX` / `toPhysicalX` / `inlineOffset`. A `dir` flip that changes no size
needs a remount.

The default header renders a pin toggle; replace its glyph with the wrapper's
`pinIcon` value (`{ path, viewBox? }`, or `defaultPinIcon` from core) and its
accessible names with `labels.pinColumn` / `labels.unpinColumn`. A custom
header renderer receives `pinned` and `onPinChange(pinned)`.
See [docs/features/column-pinning.md](../../../docs/features/column-pinning.md).

### Data sources — pick one

| Use when… | Factory | Mutability |
|---|---|---|
| Tiny static data, no mutations after first render | pass `rowData={array}` directly | one-shot |
| Static array with sort/filter, but the array won't change | `createClientDataSource(array)` | one-shot |
| Client-side data that changes after first render (most apps) | `useGridData` (React/Vue) or `createGridData` / `provideGridData` (Angular) | mutable, transactional |
| Data is too big for memory; server handles paging/sort/filter | `createServerDataSource(async (req) => ...)` | server-driven |
| Your own column-oriented/typed-array storage is already resident | `createColumnarDataSource({ fields, rowCount, getRowId? })` | read-only (1.0) |

**Why `useGridData` / `createGridData` matters:** if you replace the `rowData` prop with a fresh array on every state change, the grid rebuilds the entire pipeline (sort indices, filter caches, virtualization). Above 10,000 rows the library logs a dev warning. The mutable hook/helper batches updates as transactions instead. Always prefer it when data changes.

The mutable API is the same in every framework:

- `dataSource` — pass to the grid
- `updateRow(id, partialData)` — patch one row
- `addRows(rows)` — append rows
- `removeRows(ids)` — delete by id
- `updateCell(id, field, value)` — patch one cell
- `clear()`, `getRowById(id)`, `getTotalRowCount()`, `flushTransactions()`

`getRowId` is required for any mutation.

#### Columnar (read-only) sources

When you already hold columns as arrays or typed-array views, `createColumnarDataSource`
binds them with O(columns) work and no per-row copy:

```ts
import { createColumnarDataSource } from "@gp-grid/core";

const source = createColumnarDataSource({
  rowCount: ids.length,                 // or omit and declare each field length
  getRowId: (sourceRow) => ids[sourceRow]!,
  fields: [
    { field: "id", data: ids },                 // borrowed array / typed-array view
    { field: "score", data: scoreView },
    { field: "label", getValue: (r) => ... },   // derived/nullable accessor
  ],
});
```

- Columnar sources are **read-only**: editing, paste, fill, direct setters and
  row moves are refused, and each fires `onWriteRejected` with an `operation`
  (`"setCellValue" | "edit" | "paste" | "fill" | "row-move"`). Pass
  `onWriteRejected` as a React/Vue prop or an Angular `(onWriteRejected)`
  output; a rejected write never fires `onCellValueChanged`. A non-editable
  column emits nothing. Sorting, filtering, selection, copy and column layout
  still work; sorting never mutates your arrays.
- React, Vue and Angular re-export `createColumnarDataSource` (and the columnar
  source types), so the source can be built without a direct core import.
  Angular also exposes a `core` getter, matching `gridRef.core` in React and the
  exposed `core` in Vue, for `await core.refresh()` after a revision.
- Rendering reads only the mounted window: binding, scrolling and revision
  refresh never scan the borrowed columns, and the grid never materializes
  records (`source.getRecord` is opt-in).
- `field` is the source-field key; `headerName` is the display label. If a column
  uses a different `colId`, the grid maps it to the source field automatically.
- Cell renderers get `rowData: undefined` for a columnar row; read a value with
  `params.getValue(field)` and identity with `params.rowId`.
- After in-place updates, adopt a new source revision and call
  `await core.refresh()` on the bound grid. Changing the revision alone does
  not refresh the view; replacing the source object also works.
- With an inferred row count, use `source.setRevision(nextRevision)`; the source
  re-reads declared field lengths (`length`, falling back to `data.length`). Keep
  any explicit field lengths current after append/shrink.
- With an explicit `rowCount`, as in the example above, use
  `source.setRevision(nextRevision, nextRowCount)` when the count changes.
  Omitting the second argument retains the last declared count. The same API
  works for accessor-only sources without replacing their functions or updating
  their length hints: the explicit count is authoritative for those fields.

```ts
// After updating all resident columns to the new, consistent lengths:
source.setRevision(source.revision + 1, ids.length);
await core.refresh(); // The GridCore instance exposed by the wrapper.
```

Revision validation is O(columns). Invalid counts or inconsistent declared
lengths throw before the revision and row-count metadata are committed; caller
array mutations are not rolled back. Keep data stable while the grid reads it.

The server-side query function receives a `DataSourceRequest`:

```ts
interface DataSourceRequest {
  range: { startRow: number; endRow: number }; // absolute row indices; endRow is exclusive
  sort?: { colId: string; direction: "asc" | "desc" }[];
  filter?: FilterModel;
  valueFormatters?: Record<string, (v: CellValue) => string>;
  fieldMap?: Record<string, string>; // ColumnId -> source-field key (columnar)
}
```

There is **no `pagination` field**. To send `page`/`pageSize` to a backend, derive them from `range`:

```ts
const pageSize = req.range.endRow - req.range.startRow;
const pageIndex = Math.floor(req.range.startRow / pageSize);
```

**`filter: FilterModel` is NOT `Record<string, string>`.** It's a structured model — be careful when serializing it into URL params:

```ts
type FilterModel = Record<string, ColumnFilterModel>;

interface ColumnFilterModel {
  groups: FilterConditionGroup[];
  combination: "and" | "or"; // joins groups
}

interface FilterConditionGroup {
  conditions: FilterCondition[];
  combination: "and" | "or"; // joins conditions in this group
}

// FilterCondition is a tagged union — read .value from the right branch
type FilterCondition =
  | { type: "text";   operator: TextFilterOperator;   value?: string;        selectedValues?: Set<CellValue>; includeBlank?: boolean }
  | { type: "number"; operator: NumberFilterOperator; value?: number; valueTo?: number }
  | { type: "date";   operator: DateFilterOperator;   value?: Date | string; valueTo?: Date | string };
```

Do **not** do `String(req.filter[field])` — the value is a `ColumnFilterModel` object, so `String(...)` produces `"[object Object]"`. Read conditions through `model.groups` and preserve both combination levels if your backend supports compound filters. `selectedValues` holds **raw** cell values (a `valueFormatter` never changes what the server receives) and is a `Set` — spread it into an array before serializing (`[...condition.selectedValues]`), because `JSON.stringify` on a `Set` produces `{}`. Example serializer for the first predicate:

```ts
const params = new URLSearchParams();
if (req.filter) {
  for (const [field, model] of Object.entries(req.filter)) {
    const condition = model.groups[0]?.conditions[0];
    if (!condition) continue;
    if (condition.value !== undefined) params.set(`filter_${field}`, String(condition.value));
    if ("valueTo" in condition && condition.valueTo !== undefined) params.set(`filter_${field}_to`, String(condition.valueTo));
  }
}
```

The popup creates explicit one-level groups, so `(A AND B) OR C` and
`A AND (B OR C)` have different, unambiguous models. `GridCore.setFilter()`
accepts legacy flat models as migration input and normalizes them; server
requests and `getFilterModel()` expose only the grouped shape.
The popup displays one AND/OR selector per scope: the selector outside the
cards joins groups, while the selector inside a card joins its conditions.

The query returns `{ rows: TData[]; totalRows: number }`. Paginated loading is the default; tune via `rowLoading.cache` — **this is a prop on the grid component, NOT a second argument to `createServerDataSource`**. `createServerDataSource(queryFn, options?)` only accepts `{ loadMode? }` as options; cache config goes on the grid:

```tsx
// React
<Grid columns={columns} dataSource={dataSource} rowLoading={{ cache: { eviction: "aggressive", pageSize: 100, prefetchPages: 0, maxPages: 1 } }} />

// Vue
<GpGrid :columns="columns" :data-source="dataSource" :row-loading="{ cache: { eviction: 'aggressive', pageSize: 100, prefetchPages: 0, maxPages: 1 } }" />

// Angular
<gp-grid [columns]="columns" [dataSource]="dataSource" [rowLoading]="{ cache: { eviction: 'aggressive', pageSize: 100, prefetchPages: 0, maxPages: 1 } }" />
```

`RowCacheOptions` shape: `{ eviction: "aggressive" | "balanced" | "conservative"; pageSize: number; prefetchPages: number; maxPages: number }`.

### Features — configured the same way everywhere

- **Sorting:** per-column `sortable: true` (default). Global kill switch: `sortingEnabled={false}`. Click to sort, Shift+click to add to multi-column sort.
- **Filtering:** per-column `filterable: true` (default). Click the filter icon on the header for the popup. Server data sources receive the filter model in the request.
- **Editing:** per-column `editable: true`. Default editor is plain text/number/boolean; pass an `editRenderer` for selects, datepickers, multi-selects. Listen with `onCellValueChanged` (requires `getRowId`). Double-click, Enter, F2, or any character starts editing.

  `CellValueChangedEvent` shape (every framework — don't paraphrase, the field names are easy to misremember):

  ```ts
  interface CellValueChangedEvent<TData> {
    rowId: RowId;        // from getRowId — RowId = string | number
    columnId: string;    // normalized identity: colId ?? field
    colIndex: number;    // current view column index
    field: string;       // the column's source `field`
    oldValue: CellValue;
    newValue: CellValue;
    rowData: TData;      // full row object
  }
  ```

  `columnId` is the normalized `colId ?? field`; `field` is still the source field. There is no `event.colId`.
- **Fill handle (Excel-style):** automatic on editable columns when a single cell is active or a range is selected. Drag the small square at the bottom-right of the active cell.
- **Copy / paste:** Ctrl+C copies the selected range to clipboard as TSV; Ctrl+V pastes clipboard values across the active selection. Works automatically.
- **Row dragging:** `rowDragEntireRow={true}` to drag from any cell, OR set `rowDrag: true` on a specific column to make that column the handle. Listen with `onRowDragEnd({ rowId, fromViewIndex, toViewIndex })` — **the consumer must reorder the underlying data**, the grid does not mutate it.
- **Column resize / move:** on by default. Drag the right edge of a header to resize, drag the header body to reorder. Listen with `onColumnResized({ columnId, width, viewIndex })` and `onColumnMoved({ columnId, fromViewIndex, toViewIndex })` to persist user state.
- **Column hide:** set `hidden: true` as the column's initial default (keeps it in the definition array); after mount, toggle visibility through `setColumnState` or the wrapper's `columnState` input.
- **Column pin:** `pinned: "start"` / `"end"` on the column, or `setColumnPinned`. Pinned columns stay visible while the rest scroll; the header toggle (`pinIcon`) does the same. Listen with `onColumnPinned({ columnId, pinned })` to persist. A pin that does not fit renders in the center — check `region` in `getColumnState()`.
- **Highlighting (row / column / cell, incl. crosshair):** pass `highlighting={{ computeRowClasses, computeColumnClasses, computeCellClasses }}`. Each callback gets a context with `isHovered`, `isActive`, `isSelected`, etc., and returns CSS class names. Combine `computeRowClasses` + `computeColumnClasses` for an Excel-style crosshair. Define the highlight CSS classes globally (not scoped) — gp-grid renders cells outside any per-component CSS scope.
- **Dark mode:** `darkMode={true}` adds a `.gp-grid-container--dark` modifier; the grid's CSS handles the rest.
- **Keyboard:** Arrows, Shift+Arrow (extend), Tab/Shift+Tab, Enter (start/commit edit), Esc (cancel), F2 (edit), Delete/Backspace (clear), Ctrl+A (select all), Ctrl+C/V (copy/paste). All wired automatically.
- **SSR:** the wrappers are SSR-safe (no `ResizeObserver` use during SSR). Pass `initialWidth` / `initialHeight` (pixels) so the first server-rendered paint isn't 0×0.
- **Styling:** the global default gp-grid styling defines most of the aesthetics classes with `:where`, this means that you can override the styling. Please consider using also CSS variables to make sure the look and feel of gp-grid is the same as the entire application.
- **Localization (`labels` prop):** every user-visible string can be overridden by passing `labels={{ ... }}` (typed as `GridLabelOverrides`) to the grid. Covers the filter popup title (`filterTitle`, token `{column}`), the AND/OR toggles (`and`, `or`), buttons (`apply`, `clear`, `addCondition`, `removeCondition`, `addGroup`, `removeGroup`, `selectAll`, `deselectAll`), pin controls (`pinColumn`, `unpinColumn`), placeholders (`valuePlaceholder`, `searchPlaceholder`, `betweenSeparator`), mode toggles (`valuesMode`, `conditionMode`), messages (`tooManyValues` token `{count}`, `emptyState`, `errorPrefix` token `{message}`), and the nested `operators.*` dropdown labels (contains, startsWith, between, …). Top-level and nested operator labels are independently optional; unspecified labels fall back to English defaults. `GridLabels` and `GridLabelOverrides` are re-exported by every wrapper. See each framework reference for the exact prop syntax.
- **Long cell text:** the default renderer truncates overflow with an ellipsis (`…`) and shows the full value via a native `title` tooltip. Set `wrapText: true` on a column to wrap onto new lines instead — the extra lines are clipped to the fixed row height, so pair it with the built-in tooltip or the double-click `peekable` overlay to read the full value.

Interaction events are object-shaped in all wrappers — a deliberate 0.x→1.0 break with no compatibility adapter.

### Column state and schema lifecycle

- Column identity is `ColumnId = colId ?? field`. Duplicate ids warn once (`[gp-grid] Duplicate column id "x"`); the first definition wins and duplicates are dropped from the resolved layout.
- Definitions are immutable caller input. Definition `width` / `hidden` / `pinned` / order are only initial defaults; live state lives in the core keyed by `ColumnId`.
- Replacing the `columns` array reconciles by id and is never a reset: surviving columns keep user width, order, visibility and pin. Definition order is authoritative until a column is moved.
- `setColumnState(updates)` applies `{ columnId, width?, hidden?, order?, pinned? }[]` (`pinned: null` unpins even against a definition default); `resetColumnState(columnIds?)` resets the given ids (no arg resets all); `getColumnState()` returns `{ columnId, width?, resolvedWidth, hidden, order, pinned, region }[]`.
- `setColumnPinned(columnId, pinned)` is the pin-only command and the one that raises `onColumnPinned`; `setColumnState` is silent like the other state commands.
- Wrappers accept a controlled `columnState` input (React prop `columnState`, Vue `column-state`, Angular input `columnState`, typed `ColumnStateUpdate[]`) applied through `setColumnState` on every change.

### Programmatic API (`GridCore`)

Every wrapper exposes the underlying `GridCore` instance — same surface in every framework. Common methods:

| Method | Purpose |
|---|---|
| `setSort(colId, direction, addToExisting)` | Programmatic sort |
| `setFilter(colId, filterModel \| null)` | Programmatic filter (null clears) |
| `startEdit(row, col)` / `commitEdit(editId?)` / `cancelEdit(editId?)` | Drive editing imperatively; pass `getEditState().editId` to ignore callbacks from a closed editor |
| `setDataSource(ds)` | Swap data source without losing scroll/sort/filter state |
| `refresh()` | Refetch from the source; call after adopting a columnar revision |
| `refreshFromTransaction()` | Apply queued mutations |
| `getRowCount()` | Displayed view-row count |
| `getRowData(viewIndex)` | Source record at a view index, or `undefined` when record-less/unloaded |
| `hasRow(viewIndex)` | Whether the view row exists (a `null` cell is a value) |
| `getViewRow(viewIndex)` | `{ kind: "record", id, viewIndex, record? }` or `undefined` |
| `getRecordById(rowId)` | Source record for a stable id (resident rows / source lookup only) |
| `setColumnState(updates)` / `resetColumnState(ids?)` / `getColumnState()` | Column width / hidden / order / pin state |
| `setColumnPinned(columnId, pinned)` | Pin to `"start"`/`"end"` or unpin with `null`; raises `onColumnPinned` |
| `getSlotGeneration(rowIndex)` / `isSlotGenerationCurrent(rowIndex, gen)` | Slot recycle guard for async renderers |
| `selection` (manager) | `startSelection`, `extendTo`, etc. |
| `fill` (manager) | Fill handle programmatic control |
| `highlight.updateOptions(opts)` | Swap highlighting at runtime |
| `destroy()` | Clean up (wrappers do this on unmount) |

How to get the ref:

- React: `gridRef={ref}` prop where `ref = useRef<GridRef<TData>>(null)`. Access via `ref.current?.core`.
- Vue: template ref on `<GpGrid ref="grid" />`, the component does `defineExpose({ core })`. Access via `gridRef.value?.core`.
- Angular: `@ViewChild(GpGridComponent)` then read the public `core` property.

---

## Common pitfalls (apply to every framework)

- **Container has no explicit height** → grid is invisible. Wrap in a sized div.
- **CSS not imported** → grid renders unstyled. Import once in app entry.
- **`onCellValueChanged` provided without `getRowId`** → editing throws. Always provide `getRowId`.
- **Replacing `rowData` with a new array on every render of large datasets** → full pipeline rebuild. Use the mutable hook/helper.
- **`dataSource` and `rowData` both passed** → `dataSource` wins, `rowData` is ignored. Use one.
- **`dataSource` reference unstable across renders** → grid resets on every render. Memoize (`useMemo` in React, `computed` / `shallowRef` in Vue, `inject`/DI in Angular).
- **Custom renderer key not in registry** → cell falls back to default. Pass it via `cellRenderers={{ key: fn }}` and reference by string from the column.
- **Highlighting CSS in scoped Vue styles or component-scoped Angular styles** → won't apply. Define those rules in a global stylesheet.
- **Column index drift after `hidden: true`** → don't worry: the grid maps visible↔original indices internally, and events carry `columnId` plus named view indices (`viewIndex`, `fromViewIndex`, `toViewIndex`).
- **Expecting a pinned column to always render pinned** → a pin that does not fit the viewport renders in the scrolling center and is admitted again on widening. Read `region` from `getColumnState()` instead of assuming the request took effect.
- **Flipping `dir` on an existing grid** → the wrappers read direction at mount and on resize, so a flip without a size change needs a remount (change the `key`).

## What this skill does NOT do

- It does not run `pnpm install` for the user. State the install command and proceed.
- It does not assume `pnpm`. Match the user's package manager.
- It does not modify gp-grid library source — that's a separate task (working ON gp-grid, not WITH it).
- It does not write a custom framework adapter from scratch unless explicitly asked. For that, see `references/core.md`.
