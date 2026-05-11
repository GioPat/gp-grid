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
| `width` | required | Width in pixels. Columns are scaled up linearly if total < container width. |
| `colId` | `field` | Unique column id (useful when two columns share a `field`). |
| `headerName` | `field` | Display name shown in the header. |
| `editable` | `false` | Inline editing on this column. |
| `sortable` | `true` | Click header to sort. Shift+click for multi-sort. |
| `filterable` | `true` | Filter dropdown available on header. |
| `hidden` | `false` | Hide column without removing it from the array. |
| `resizable` | `true` | Drag right edge of header to resize. |
| `movable` | `true` | Drag header body to reorder columns. |
| `minWidth` / `maxWidth` | `50` / unlimited | Resize bounds. |
| `rowDrag` | `false` | This column acts as the row drag handle. |
| `cellRenderer` / `editRenderer` / `headerRenderer` | none | Custom rendering — exact type **differs per framework**, see references. This takes the value formatted data from the `valueFormatter` field. |
| `valueFormatter` | none | `(value: CellValue) => string`. Used by the default cell renderer. Useful for `object` columns or display formatting (currency, dates) without writing a full renderer. |
| `computeRowClasses` / `computeColumnClasses` / `computeCellClasses` | none | Per-column/row/cell highlighting overrides — see Highlighting below. |

### Data sources — pick one

| Use when… | Factory | Mutability |
|---|---|---|
| Tiny static data, no mutations after first render | pass `rowData={array}` directly | one-shot |
| Static array with sort/filter, but the array won't change | `createClientDataSource(array)` | one-shot |
| Client-side data that changes after first render (most apps) | `useGridData` (React/Vue) or `createGridData` / `provideGridData` (Angular) | mutable, transactional |
| Data is too big for memory; server handles paging/sort/filter | `createServerDataSource(async (req) => ...)` | server-driven |

**Why `useGridData` / `createGridData` matters:** if you replace the `rowData` prop with a fresh array on every state change, the grid rebuilds the entire pipeline (sort indices, filter caches, virtualization). Above 10,000 rows the library logs a dev warning. The mutable hook/helper batches updates as transactions instead. Always prefer it when data changes.

The mutable API is the same in every framework:

- `dataSource` — pass to the grid
- `updateRow(id, partialData)` — patch one row
- `addRows(rows)` — append rows
- `removeRows(ids)` — delete by id
- `updateCell(id, field, value)` — patch one cell
- `clear()`, `getRowById(id)`, `getTotalRowCount()`, `flushTransactions()`

`getRowId` is required for any mutation.

The server-side fetch function receives a `DataSourceRequest`:

```ts
interface DataSourceRequest {
  range: { startRow: number; endRow: number }; // absolute row indices; endRow is exclusive
  sort?: { colId: string; direction: "asc" | "desc" }[];
  filter?: FilterModel;
  valueFormatters?: Record<string, (v: CellValue) => string>;
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
  conditions: FilterCondition[];
  combination: "and" | "or";
}

// FilterCondition is a tagged union — read .value from the right branch
type FilterCondition =
  | { type: "text";   operator: TextFilterOperator;   value?: string;        selectedValues?: Set<string>; includeBlank?: boolean; nextOperator?: "and" | "or" }
  | { type: "number"; operator: NumberFilterOperator; value?: number; valueTo?: number; nextOperator?: "and" | "or" }
  | { type: "date";   operator: DateFilterOperator;   value?: Date | string; valueTo?: Date | string;       nextOperator?: "and" | "or" };
```

Do **not** do `String(req.filter[field])` — the value is a `ColumnFilterModel` object, so `String(...)` produces `"[object Object]"`. Read `req.filter[field].conditions[0].value` (or iterate `conditions` and `selectedValues` if your backend supports compound filters). Example serializer:

```ts
const params = new URLSearchParams();
if (req.filter) {
  for (const [field, model] of Object.entries(req.filter)) {
    const condition = model.conditions[0];
    if (!condition) continue;
    if (condition.value !== undefined) params.set(`filter_${field}`, String(condition.value));
    if ("valueTo" in condition && condition.valueTo !== undefined) params.set(`filter_${field}_to`, String(condition.valueTo));
  }
}
```

The fetch returns `{ rows: TData[]; totalRows: number }`. Paginated loading is the default; tune via `rowLoading.cache` — **this is a prop on the grid component, NOT a second argument to `createServerDataSource`**. `createServerDataSource(fetchFn, options?)` only accepts `{ loadMode? }` as options; cache config goes on the grid:

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
    colIndex: number;
    field: string;       // the column's `field` (NOT `colId`, NOT `column.field`, just `field`)
    oldValue: CellValue;
    newValue: CellValue;
    rowData: TData;      // full row object
  }
  ```

  Do **not** use `event.colId` — that field does not exist. Use `event.field` or `event.colIndex`.
- **Fill handle (Excel-style):** automatic on editable columns when a single cell is active or a range is selected. Drag the small square at the bottom-right of the active cell.
- **Copy / paste:** Ctrl+C copies the selected range to clipboard as TSV; Ctrl+V pastes clipboard values across the active selection. Works automatically.
- **Row dragging:** `rowDragEntireRow={true}` to drag from any cell, OR set `rowDrag: true` on a specific column to make that column the handle. Listen with `onRowDragEnd(sourceIndex, targetIndex)` — **the consumer must reorder the underlying data**, the grid does not mutate it.
- **Column resize / move:** on by default. Drag the right edge of a header to resize, drag the header body to reorder. Listen with `onColumnResized(colIndex, newWidth)` and `onColumnMoved(fromIndex, toIndex)` to persist user state.
- **Column hide:** set `hidden: true` on the column (keeps it in the definition array; index references stay valid).
- **Highlighting (row / column / cell, incl. crosshair):** pass `highlighting={{ computeRowClasses, computeColumnClasses, computeCellClasses }}`. Each callback gets a context with `isHovered`, `isActive`, `isSelected`, etc., and returns CSS class names. Combine `computeRowClasses` + `computeColumnClasses` for an Excel-style crosshair. Define the highlight CSS classes globally (not scoped) — gp-grid renders cells outside any per-component CSS scope.
- **Dark mode:** `darkMode={true}` adds a `.gp-grid-container--dark` modifier; the grid's CSS handles the rest.
- **Keyboard:** Arrows, Shift+Arrow (extend), Tab/Shift+Tab, Enter (start/commit edit), Esc (cancel), F2 (edit), Delete/Backspace (clear), Ctrl+A (select all), Ctrl+C/V (copy/paste). All wired automatically.
- **SSR:** the wrappers are SSR-safe (no `ResizeObserver` use during SSR). Pass `initialWidth` / `initialHeight` (pixels) so the first server-rendered paint isn't 0×0.
- **Styling:** the global default gp-grid styling defines most of the aesthetics classes with `:where`, this means that you can override the styling. Please consider using also CSS variables to make sure the look and feel of gp-grid is the same as the entire application.

### Programmatic API (`GridCore`)

Every wrapper exposes the underlying `GridCore` instance — same surface in every framework. Common methods:

| Method | Purpose |
|---|---|
| `setSort(colId, direction, addToExisting)` | Programmatic sort |
| `setFilter(colId, filterModel \| null)` | Programmatic filter (null clears) |
| `startEdit(row, col)` / `commitEdit()` / `cancelEdit()` | Drive editing imperatively |
| `setDataSource(ds)` | Swap data source without losing scroll/sort/filter state |
| `refresh()` | Refetch from data source (server data sources) |
| `refreshFromTransaction()` | Apply queued mutations |
| `getRowCount()` / `getRowData(rowIndex)` | Inspect data |
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
- **Column index drift after `hidden: true`** → don't worry: the grid maps visible↔original indices internally. Event callbacks (`onColumnMoved`, etc.) report original indices.

## What this skill does NOT do

- It does not run `pnpm install` for the user. State the install command and proceed.
- It does not assume `pnpm`. Match the user's package manager.
- It does not modify gp-grid library source — that's a separate task (working ON gp-grid, not WITH it).
- It does not write a custom framework adapter from scratch unless explicitly asked. For that, see `references/core.md`.
