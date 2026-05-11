# Integrating gp-grid in a React app

This file is the React-specific reference. Cross-framework concepts (column shape, data source choice, features, programmatic API, gotchas) live in `SKILL.md` — read that first if you haven't.

## Install

```bash
pnpm add @gp-grid/react       # or npm install / yarn add / bun add
```

Peer requirements: React 18+, TypeScript 5+ recommended.

Import the stylesheet **once** at the app entry point:

```tsx
// main.tsx (or index.tsx)
import "@gp-grid/react/dist/styles.css";
```

## Minimal grid

```tsx
import { Grid, type ColumnDefinition } from "@gp-grid/react";

interface Person {
  id: number;
  name: string;
  age: number;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80, headerName: "ID" },
  { field: "name", cellDataType: "text", width: 200, headerName: "Name" },
  { field: "age", cellDataType: "number", width: 100, headerName: "Age" },
];

const rows: Person[] = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
];

export function PeopleGrid() {
  return (
    <div style={{ width: "100%", height: 400 }}>
      <Grid columns={columns} rowData={rows} rowHeight={36} />
    </div>
  );
}
```

The component is exported as both `Grid` (preferred) and `GpGrid` (alias). The wrapping `<div>` must have an explicit height.

## Mutable data — `useGridData`

When rows change after first render, **don't** rebuild `rowData`. Use `useGridData` so updates apply via transactions:

```tsx
import { Grid, useGridData } from "@gp-grid/react";

function PeopleGrid({ initial }: { initial: Person[] }) {
  const { dataSource, updateRow, addRows, removeRows, updateCell, clear } =
    useGridData(initial, { getRowId: (row) => row.id });

  return (
    <>
      <div style={{ width: "100%", height: 400 }}>
        <Grid columns={columns} dataSource={dataSource} rowHeight={36} />
      </div>
      <button onClick={() => updateRow(1, { age: 31 })}>+1 Alice age</button>
      <button onClick={() => addRows([{ id: 3, name: "Carol", age: 28 }])}>Add</button>
    </>
  );
}
```

`getRowId` is required. The hook holds a stable reference for the lifetime of the component, so the data source identity won't change across renders.

## Server data — `createServerDataSource`

For datasets too large to load in memory:

```tsx
import { useMemo } from "react";
import {
  Grid,
  createServerDataSource,
  type DataSourceRequest,
  type DataSourceResponse,
} from "@gp-grid/react";

const fetchPeople = async (
  req: DataSourceRequest,
): Promise<DataSourceResponse<Person>> => {
  // DataSourceRequest exposes `range: { startRow, endRow }` (endRow exclusive),
  // NOT a `pagination` field. Derive page/pageSize from the range.
  const pageSize = req.range.endRow - req.range.startRow;
  const pageIndex = Math.floor(req.range.startRow / pageSize);
  const params = new URLSearchParams({
    page: String(pageIndex),
    pageSize: String(pageSize),
  });
  if (req.sort?.length) {
    params.set(
      "sortBy",
      req.sort.map((s) => `${s.colId}:${s.direction}`).join(","),
    );
  }
  if (req.filter) {
    // req.filter is Record<string, ColumnFilterModel> — read .conditions[0].value, NOT the model itself.
    for (const [field, model] of Object.entries(req.filter)) {
      const value = model.conditions[0]?.value;
      if (value !== undefined) params.set(`f_${field}`, String(value));
    }
  }
  const r = await fetch(`/api/people?${params}`);
  const data = await r.json();
  return { rows: data.items, totalRows: data.total };
};

function PeopleGrid() {
  const dataSource = useMemo(() => createServerDataSource(fetchPeople), []);
  return (
    <div style={{ width: "100%", height: 600 }}>
      <Grid columns={columns} dataSource={dataSource} rowHeight={36} />
    </div>
  );
}
```

**Always memoize** with `useMemo([])`. Recreating the data source on every render destroys grid state.

Tune the cache for very large server datasets:

```tsx
<Grid
  columns={columns}
  dataSource={dataSource}
  rowHeight={36}
  rowLoading={{
    cache: { eviction: "aggressive", pageSize: 100, prefetchPages: 0, maxPages: 1 },
  }}
/>
```

## Custom renderers

A React renderer is plain JSX. The renderer types:

```ts
type ReactCellRenderer = (params: CellRendererParams) => React.ReactNode;
type ReactEditRenderer = (params: EditRendererParams) => React.ReactNode;
type ReactHeaderRenderer = (params: HeaderRendererParams) => React.ReactNode;
```

Two ways to wire a renderer to a column:

### Registry by string key (preferred — reusable)

```tsx
import {
  Grid,
  type CellRendererParams,
  type ReactCellRenderer,
} from "@gp-grid/react";

const cellRenderers: Record<string, ReactCellRenderer> = {
  currency: (params) => (
    <span style={{ color: "#047857", fontWeight: 600 }}>
      ${(params.value as number).toLocaleString("en-US", { minimumFractionDigits: 2 })}
    </span>
  ),
  bold: (params) => <strong>{String(params.value ?? "")}</strong>,
  statusBadge: (params) => {
    const status = params.value as string;
    const tone = status === "active" ? "#16a34a" : "#dc2626";
    return <span style={{ color: tone, fontWeight: 600 }}>{status}</span>;
  },
};

const columns: ColumnDefinition[] = [
  { field: "salary", cellDataType: "number", width: 120, cellRenderer: "currency" },
  { field: "name",   cellDataType: "text",   width: 150, cellRenderer: "bold" },
  { field: "status", cellDataType: "text",   width: 120, cellRenderer: "statusBadge" },
];

<Grid
  columns={columns}
  rowData={rows}
  rowHeight={36}
  cellRenderers={cellRenderers}
/>
```

Declare `cellRenderers` outside the component (or memoize) so the registry identity is stable.

### Inline function on the column

`cellRenderer` also accepts a function. Use this for one-off renderers; the registry pattern is preferred when sharing across columns/grids.

### Edit renderers

`EditRendererParams` extends `CellRendererParams` with `initialValue`, `onValueChange`, `onCommit`, `onCancel`. The renderer must:

- call `onValueChange(newValue)` whenever the user changes the value
- call `onCommit()` to save (also fires `onCellValueChanged`)
- call `onCancel()` on Escape

```tsx
const editRenderers = {
  prioritySelect: (params: EditRendererParams) => (
    <select
      autoFocus
      defaultValue={params.initialValue as string}
      onChange={(e) => params.onValueChange(e.target.value)}
      onBlur={() => params.onCommit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") params.onCommit();
        if (e.key === "Escape") params.onCancel();
      }}
    >
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
  ),
};

const columns: ColumnDefinition[] = [
  {
    field: "priority",
    cellDataType: "text",
    width: 120,
    editable: true,
    editRenderer: "prioritySelect",
  },
];
```

For editors that need internal state (e.g. multi-select), define a small inner component that uses `useState`/`useRef` and call back through the params. **`EditRendererParams` does NOT include an `element` field** — don't invent `params.element` to anchor a popover. The correct anchoring pattern is one of:

- **`react-select` (recommended for dropdowns)** — pass `menuPortalTarget={document.body}` + `menuPosition="fixed"` + `menuIsOpen`. The library anchors the menu under the Select input (which is rendered inside the cell), and the portal escapes `overflow: hidden` automatically.
- **Custom popover** — render a stub `<div ref={anchorRef}>` *inside* the renderer (the renderer's own DOM is in the cell), then `anchorRef.current.getBoundingClientRect()` to position a portaled popover via `createPortal`. Do not try to read the cell's DOM from `params` — get a ref to your own renderer root and measure that.

Complete `react-select` multi-select recipe (mirrors the playground):

```tsx
import Select from "react-select";
import type { EditRendererParams } from "@gp-grid/react";

interface Option { value: string; label: string }
const TAG_OPTIONS: Option[] = [
  { value: "urgent", label: "Urgent" },
  { value: "important", label: "Important" },
  { value: "archived", label: "Archived" },
  { value: "review", label: "Review" },
];

function MultiSelectTagsEditor({ params }: { params: EditRendererParams }) {
  const initial = (params.initialValue as string[]) ?? [];
  const [selected, setSelected] = useState<string[]>(initial);
  const valueOptions = TAG_OPTIONS.filter((o) => selected.includes(o.value));

  return (
    <Select
      isMulti
      autoFocus
      menuIsOpen
      options={TAG_OPTIONS}
      value={valueOptions}
      onChange={(opts) => {
        const next = opts.map((o) => o.value);
        setSelected(next);
        params.onValueChange(next);
      }}
      onBlur={() => params.onCommit()}
      onKeyDown={(e) => {
        if (e.key === "Escape") params.onCancel();
        if (e.key === "Enter") params.onCommit();
      }}
      menuPortalTarget={document.body}
      menuPosition="fixed"
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
    />
  );
}

const editRenderers = {
  tagsMultiSelect: (params: EditRendererParams) => (
    <MultiSelectTagsEditor params={params} />
  ),
};
```

See `playgrounds/vite-react/src/App.tsx` `MultiSelectEditor` for the full styled version.

### Header renderers

```tsx
const headerRenderers = {
  withIcon: (params: HeaderRendererParams) => (
    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <BellIcon />
      <span>{params.column.headerName ?? params.column.field}</span>
    </span>
  ),
};
```

`HeaderRendererParams` exposes `column`, `colIndex`, `sortDirection`, `sortIndex`, and `onSort(direction, addToExisting)` if you want to drive sorting from the custom header.

## Listening to changes

```tsx
<Grid
  columns={columns}
  dataSource={dataSource}
  rowHeight={36}
  getRowId={(row) => row.id}
  onCellValueChanged={(e) => console.log(e.field, e.oldValue, "→", e.newValue)}
  onRowDragEnd={(from, to) => console.log("row", from, "→", to)}
  onColumnResized={(colIndex, newWidth) => persist(colIndex, newWidth)}
  onColumnMoved={(fromIndex, toIndex) => persistOrder(fromIndex, toIndex)}
/>
```

`getRowId` is **required** when `onCellValueChanged` is provided.

For row drag, `onRowDragEnd` fires after the user drops. The consumer is responsible for actually reordering the underlying data — gp-grid does not mutate the array. With `useGridData` you'd typically rebuild and re-set, or use `removeRows` + `addRows`.

## Programmatic API (`gridRef`)

```tsx
import { useRef } from "react";
import { Grid, type GridRef } from "@gp-grid/react";

function PeopleGrid() {
  const gridRef = useRef<GridRef<Person> | null>(null);

  return (
    <>
      <div style={{ width: "100%", height: 400 }}>
        <Grid
          columns={columns}
          dataSource={dataSource}
          rowHeight={36}
          gridRef={gridRef}
        />
      </div>
      <button onClick={() => gridRef.current?.core?.setSort("name", "asc", false)}>
        Sort by name
      </button>
      <button onClick={() => gridRef.current?.core?.startEdit(0, 1)}>
        Edit cell (0, 1)
      </button>
    </>
  );
}
```

`gridRef.current.core` is a `GridCore<TData>` — full surface listed in `SKILL.md` ("Programmatic API").

## Highlighting (row / column / cell, crosshair)

```tsx
import { useMemo } from "react";

function PeopleGrid() {
  const highlighting = useMemo(() => ({
    computeRowClasses: (ctx) => (ctx.isHovered ? ["row-highlight"] : []),
    computeColumnClasses: (ctx) => (ctx.isHovered ? ["col-highlight"] : []),
    // HighlightContext gives you `rowData`, `column`, `rowIndex`, `colIndex`,
    // plus hover/active/selection flags. There is NO `ctx.value` field — read
    // the cell value via `(ctx.rowData as Person)?.[ctx.column.field]` if needed.
    computeCellClasses: (ctx) =>
      (ctx.rowData as Person | undefined)?.age && (ctx.rowData as Person).age > 30
        ? ["cell-over-30"]
        : [],
  }), []);

  return (
    <div style={{ width: "100%", height: 400 }}>
      <Grid
        columns={columns}
        dataSource={dataSource}
        rowHeight={36}
        highlighting={highlighting}
      />
    </div>
  );
}
```

```css
/* Global stylesheet — !important needed to override grid defaults */
.row-highlight { background-color: rgba(59, 130, 246, 0.2) !important; }
.col-highlight { background-color: rgba(16, 185, 129, 0.2) !important; }
```

Use both callbacks together for an Excel-style crosshair. **Memoize** the `highlighting` object — passing a new object identity on every render forces a core update.

## Reactive `dataSource` swaps

You can change the `dataSource` prop after mount. The wrapper detects the change and calls `core.setDataSource(newDs)` internally — sort, filter, scroll, and selection are preserved. Just make sure the new ds is referentially distinct from the old one (otherwise nothing happens).

## All `<Grid>` props (cheatsheet)

| Prop | Type | Default | Notes |
|---|---|---|---|
| `columns` | `ColumnDefinition[]` | required | |
| `dataSource` | `DataSource<TData>` | — | mutually exclusive with `rowData`; takes precedence |
| `rowData` | `TData[]` | — | wrapped in a client data source by the wrapper |
| `rowHeight` | `number` | required | px |
| `headerHeight` | `number` | `rowHeight` | px |
| `overscan` | `number` | `3` | rows rendered above/below viewport |
| `rowLoading` | `RowLoadingOptions` | — | server cache tuning |
| `sortingEnabled` | `boolean` | `true` | global kill switch |
| `darkMode` | `boolean` | `false` | |
| `wheelDampening` | `number` | `0.1` | 0-1, scroll wheel sensitivity |
| `cellRenderers` | `Record<string, ReactCellRenderer>` | `{}` | registry |
| `editRenderers` | `Record<string, ReactEditRenderer>` | `{}` | registry |
| `headerRenderers` | `Record<string, ReactHeaderRenderer>` | `{}` | registry |
| `cellRenderer` | `ReactCellRenderer` | — | global fallback |
| `editRenderer` | `ReactEditRenderer` | — | global fallback |
| `headerRenderer` | `ReactHeaderRenderer` | — | global fallback |
| `initialWidth` / `initialHeight` | `number` | — | SSR initial paint |
| `gridRef` | `RefObject<GridRef<TData> \| null>` | — | programmatic API |
| `highlighting` | `HighlightingOptions<TData>` | — | row/col/cell class callbacks |
| `getRowId` | `(row: TData) => RowId` | — | required for `onCellValueChanged` and `useGridData` |
| `onCellValueChanged` | `(e: CellValueChangedEvent<TData>) => void` | — | requires `getRowId` |
| `loadingComponent` | `ComponentType<{ isLoading: boolean }>` | spinner | overrides default |
| `rowDragEntireRow` | `boolean` | `false` | drag from any cell |
| `onRowDragEnd` | `(src, tgt) => void` | — | consumer reorders |
| `onColumnResized` | `(colIndex, newWidth) => void` | — | persist user state |
| `onColumnMoved` | `(from, to) => void` | — | persist user state |

## React-specific gotchas

- **Unmemoized `dataSource`**: with `createClientDataSource` / `createServerDataSource`, wrap in `useMemo([])` (or use `useGridData`).
- **Unmemoized `highlighting` object**: pass a memoized object; new identity on every render triggers a core update.
- **Renderer functions defined inside the component body**: declare them outside or memoize. Inline-by-render is fine in dev, suboptimal in prod.
- **`StrictMode` double-mounting**: handled internally — the wrapper reference-counts data source ownership and the grid core to survive double effect firing.
- **SSR / Next.js**: pass `initialWidth` / `initialHeight` so the server-rendered HTML isn't 0×0. `ResizeObserver` is gated by a `typeof` check.
- **`react-select` (or other portal-mounted editors)**: use `menuPortalTarget={document.body}` and `menuPosition="fixed"` so the dropdown isn't clipped by the cell's `overflow: hidden`.

## Working playground

A complete working example (1.5M rows, custom renderers, multi-select editor, highlighting, dark mode, row drag, mutations) lives at `playgrounds/vite-react/src/App.tsx`. Read it whenever you need a real, end-to-end pattern.
