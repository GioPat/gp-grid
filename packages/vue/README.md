# @gp-grid/vue 🏁 🏎️

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
      <h4><a href="https://www.gp-grid.io/">🎮 Demo</a> • <a href="https://www.gp-grid.io/docs/vue">📖 Documentation</a> • <a href="https://deepwiki.com/GioPat/gp-grid"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"/></a></h4>
    </div>
</div>

A high-performance, feature lean Vue 3 data grid component built to manage grids with huge amount (millions) of rows. It's based on its core dependency: `@gp-grid/core`, featuring virtual scrolling, cell selection, sorting, filtering, editing, and Excel-like fill handle.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Examples](#examples)
- [Column state and schema lifecycle](#column-state-and-schema-lifecycle)
- [Row grouping](#row-grouping)
- [API Reference](#api-reference)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Styling](#styling)
- [Donations](#donations)

## Features

- **Virtual Scrolling**: Efficiently handles 150,000+ rows through slot-based recycling
- **Cell Selection**: Single cell, range selection, Shift+click extend, Ctrl+click toggle
- **Multi-Column Sorting**: Click to sort, Shift+click for multi-column sort
- **Column Filtering**: Built-in filter row with debounced input
- **Cell Editing**: Double-click or press Enter to edit, with custom editor support
- **Fill Handle**: Excel-like drag-to-fill for editable cells
- **Column Pin**: Pin columns to the start or end edge; a bounded column window keeps wide grids flat
- **Row Resize and Auto-Fit**: Drag a row edge, or fit a row or a column to its rendered content once
- **Column Groups**: Nested header groups of any finite depth, with configured header band heights
- **Row Grouping**: Group rows by ordered dimensions with aggregates, a total row and expand/collapse
- **Keyboard Navigation**: Arrow keys, Tab, Enter, Escape, Ctrl+A, Ctrl+C, Ctrl+V
- **Custom Renderers**: Registry-based cell, edit, and header renderers
- **Dark Mode**: Built-in dark theme support
- **TypeScript**: Full type safety with exported types

## Installation

Use `npm`, `yarn` or `pnpm`

```bash
pnpm add @gp-grid/vue
```

Requires Vue 3.5 or later.

## Quick Start

```vue
<script setup lang="ts">
import { GpGrid, type ColumnDefinition } from "@gp-grid/vue";

interface Person {
  id: number;
  name: string;
  age: number;
  email: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80, headerName: "ID" },
  { field: "name", cellDataType: "text", width: 150, headerName: "Name" },
  { field: "age", cellDataType: "number", width: 80, headerName: "Age" },
  { field: "email", cellDataType: "text", width: 250, headerName: "Email" },
];

const data: Person[] = [
  { id: 1, name: "Alice", age: 30, email: "alice@example.com" },
  { id: 2, name: "Bob", age: 25, email: "bob@example.com" },
  { id: 3, name: "Charlie", age: 35, email: "charlie@example.com" },
];
</script>

<template>
  <div style="width: 800px; height: 400px">
    <GpGrid :columns="columns" :row-data="data" :row-height="36" />
  </div>
</template>
```

## Examples

### Client-Side Data Source with Sorting and Filtering

For larger datasets with client-side sort/filter operations:

```vue
<script setup lang="ts">
import { computed } from "vue";
import {
  GpGrid,
  createClientDataSource,
  type ColumnDefinition,
} from "@gp-grid/vue";

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80, headerName: "ID" },
  { field: "name", cellDataType: "text", width: 200, headerName: "Product" },
  { field: "price", cellDataType: "number", width: 100, headerName: "Price" },
  {
    field: "category",
    cellDataType: "text",
    width: 150,
    headerName: "Category",
  },
];

const products = computed<Product[]>(() =>
  Array.from({ length: 10000 }, (_, i) => ({
    id: i + 1,
    name: `Product ${i + 1}`,
    price: Math.round(Math.random() * 1000) / 10,
    category: ["Electronics", "Clothing", "Food", "Books"][i % 4],
  })),
);

const dataSource = computed(() => createClientDataSource(products.value));
</script>

<template>
  <div style="width: 100%; height: 500px">
    <GpGrid
      :columns="columns"
      :data-source="dataSource"
      :row-height="36"
      :header-height="40"
    />
  </div>
</template>
```

### Server-Side Data Source

For datasets too large to load entirely in memory, use a server-side data source:

```vue
<script setup lang="ts">
import { computed } from "vue";
import {
  GpGrid,
  createServerDataSource,
  type ColumnDefinition,
  type DataSourceRequest,
  type DataSourceResponse,
} from "@gp-grid/vue";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 80, headerName: "ID" },
  { field: "name", cellDataType: "text", width: 150, headerName: "Name" },
  { field: "email", cellDataType: "text", width: 250, headerName: "Email" },
  { field: "role", cellDataType: "text", width: 120, headerName: "Role" },
  {
    field: "createdAt",
    cellDataType: "dateString",
    width: 150,
    headerName: "Created",
  },
];

// API fetch function that handles pagination, sorting, and filtering
async function fetchUsers(
  request: DataSourceRequest,
): Promise<DataSourceResponse<User>> {
  const { pagination, sort, filter } = request;

  // Build query parameters
  const params = new URLSearchParams({
    page: String(pagination.pageIndex),
    limit: String(pagination.pageSize),
  });

  // Add sorting parameters
  if (sort && sort.length > 0) {
    // Format: sortBy=name:asc,email:desc
    const sortString = sort.map((s) => `${s.colId}:${s.direction}`).join(",");
    params.set("sortBy", sortString);
  }

  // Add filter parameters
  if (filter) {
    Object.entries(filter).forEach(([field, value]) => {
      if (value) {
        params.set(`filter[${field}]`, String(value));
      }
    });
  }

  // Make API request
  const response = await fetch(`https://api.example.com/users?${params}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  // Return in DataSourceResponse format
  return {
    rows: data.users, // Array of User objects
    totalRows: data.total, // Total count for virtual scrolling
  };
}

// Create server data source - computed to prevent recreation
const dataSource = computed(() => createServerDataSource<User>(fetchUsers));
</script>

<template>
  <div style="width: 100%; height: 600px">
    <GpGrid
      :columns="columns"
      :data-source="dataSource"
      :row-height="36"
      :header-height="40"
      :dark-mode="true"
    />
  </div>
</template>
```

### Custom Cell Renderers

Use the registry pattern to define reusable renderers:

```vue
<script setup lang="ts">
import { h } from "vue";
import {
  GpGrid,
  type ColumnDefinition,
  type CellRendererParams,
  type VueCellRenderer,
} from "@gp-grid/vue";

interface Order {
  id: number;
  customer: string;
  total: number;
  status: "pending" | "shipped" | "delivered" | "cancelled";
}

// Define reusable renderers
const cellRenderers: Record<string, VueCellRenderer> = {
  // Currency formatter
  currency: (params: CellRendererParams) => {
    const value = params.value as number;
    return h(
      "span",
      { style: { color: "#047857", fontWeight: 600 } },
      `$${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    );
  },

  // Status badge
  statusBadge: (params: CellRendererParams) => {
    const status = params.value as Order["status"];
    const colors: Record<string, { bg: string; text: string }> = {
      pending: { bg: "#fef3c7", text: "#92400e" },
      shipped: { bg: "#dbeafe", text: "#1e40af" },
      delivered: { bg: "#dcfce7", text: "#166534" },
      cancelled: { bg: "#fee2e2", text: "#991b1b" },
    };
    const color = colors[status] ?? { bg: "#f3f4f6", text: "#374151" };

    return h(
      "span",
      {
        style: {
          backgroundColor: color.bg,
          color: color.text,
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 600,
        },
      },
      status.toUpperCase(),
    );
  },

  // Bold text
  bold: (params: CellRendererParams) => h("strong", String(params.value ?? "")),
};

const columns: ColumnDefinition[] = [
  {
    field: "id",
    cellDataType: "number",
    width: 80,
    headerName: "ID",
    cellRenderer: "bold",
  },
  {
    field: "customer",
    cellDataType: "text",
    width: 200,
    headerName: "Customer",
  },
  {
    field: "total",
    cellDataType: "number",
    width: 120,
    headerName: "Total",
    cellRenderer: "currency",
  },
  {
    field: "status",
    cellDataType: "text",
    width: 120,
    headerName: "Status",
    cellRenderer: "statusBadge",
  },
];

const orders: Order[] = [
  { id: 1, customer: "Acme Corp", total: 1250.0, status: "shipped" },
  { id: 2, customer: "Globex Inc", total: 890.5, status: "pending" },
  { id: 3, customer: "Initech", total: 2100.75, status: "delivered" },
];
</script>

<template>
  <div style="width: 100%; height: 400px">
    <GpGrid
      :columns="columns"
      :row-data="orders"
      :row-height="40"
      :cell-renderers="cellRenderers"
    />
  </div>
</template>
```

### Editable Cells with Custom Editors

An editor commit is coerced by the column's `cellDataType`, like paste: `"60000"`
typed into a `number` column stores `60000`, a draft the type cannot hold writes
nothing, and a value a custom editor already typed is stored unchanged.

```vue
<script setup lang="ts">
import { h, ref as vueRef } from "vue";
import {
  GpGrid,
  createClientDataSource,
  type ColumnDefinition,
  type EditRendererParams,
  type VueEditRenderer,
} from "@gp-grid/vue";

interface Task {
  id: number;
  title: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
}

// Custom select editor for priority field
const editRenderers: Record<string, VueEditRenderer> = {
  prioritySelect: (params: EditRendererParams) => {
    return h(
      "select",
      {
        autofocus: true,
        value: params.initialValue as string,
        onChange: (e: Event) => {
          const target = e.target as HTMLSelectElement;
          params.onValueChange(target.value);
        },
        onBlur: () => params.onCommit(),
        onKeydown: (e: KeyboardEvent) => {
          if (e.key === "Enter") params.onCommit();
          if (e.key === "Escape") params.onCancel();
        },
        style: {
          width: "100%",
          height: "100%",
          border: "none",
          outline: "none",
          padding: "0 8px",
        },
      },
      [
        h("option", { value: "low" }, "Low"),
        h("option", { value: "medium" }, "Medium"),
        h("option", { value: "high" }, "High"),
      ],
    );
  },

  checkbox: (params: EditRendererParams) =>
    h("input", {
      type: "checkbox",
      autofocus: true,
      checked: params.initialValue as boolean,
      onChange: (e: Event) => {
        const target = e.target as HTMLInputElement;
        params.onValueChange(target.checked);
        params.onCommit();
      },
      style: { width: "20px", height: "20px" },
    }),
};

const columns: ColumnDefinition[] = [
  { field: "id", cellDataType: "number", width: 60, headerName: "ID" },
  {
    field: "title",
    cellDataType: "text",
    width: 300,
    headerName: "Title",
    editable: true, // Uses default text input
  },
  {
    field: "priority",
    cellDataType: "text",
    width: 120,
    headerName: "Priority",
    editable: true,
    editRenderer: "prioritySelect", // Custom editor
  },
  {
    field: "completed",
    cellDataType: "boolean",
    width: 100,
    headerName: "Done",
    editable: true,
    editRenderer: "checkbox", // Custom editor
  },
];

const tasks: Task[] = [
  { id: 1, title: "Write documentation", priority: "high", completed: false },
  { id: 2, title: "Fix bugs", priority: "medium", completed: true },
  { id: 3, title: "Add tests", priority: "low", completed: false },
];

const dataSource = createClientDataSource(tasks);
</script>

<template>
  <div style="width: 600px; height: 300px">
    <GpGrid
      :columns="columns"
      :data-source="dataSource"
      :row-height="40"
      :edit-renderers="editRenderers"
    />
  </div>
</template>
```

### Dark Mode

```vue
<template>
  <GpGrid
    :columns="columns"
    :row-data="data"
    :row-height="36"
    :dark-mode="true"
  />
</template>
```

## Column state and schema lifecycle

Passing a new `columns` array reconciles the schema by column id (`colId ?? field`) in one batch. The core instance is reused: unrelated sort, filter and scroll state survive, surviving columns keep their user width/order/visibility, and removed columns drop their headers and state.

Definition `width`/`hidden` are initial defaults. A definition change only applies when the column has no user override for that property; otherwise call `core.columns.resetState(["id"])` first.

Drive width, visibility and order from your own state with the controlled `column-state` prop:

```vue
<template>
  <GpGrid
    :columns="columns"
    :row-data="rows"
    :row-height="36"
    :column-state="[{ columnId: 'city', width: 220 }]"
  />
</template>
```

### Migration from 0.x

Events are object-shaped in every wrapper; there is no compatibility adapter.

```vue
<template>
  <!-- 0.x -->
  <GpGrid
    :columns="columns"
    :row-data="rows"
    :row-height="36"
    :on-column-resized="(colIndex, newWidth) => persist(colIndex, newWidth)"
    :on-column-moved="(from, to) => persistOrder(from, to)"
    :on-row-drag-end="(src, tgt) => persistRowOrder(src, tgt)"
  />

  <!-- 1.0 -->
  <GpGrid
    :columns="columns"
    :row-data="rows"
    :row-height="36"
    :column-state="columnState"
    :on-column-resized="({ columnId, width, viewIndex }) => persist(columnId, width, viewIndex)"
    :on-column-moved="({ columnId, fromViewIndex, toViewIndex }) => persistOrder(columnId, fromViewIndex, toViewIndex)"
    :on-row-drag-end="({ rowId, fromViewIndex, toViewIndex }) => persistRowOrder(rowId, fromViewIndex, toViewIndex)"
  />
</template>
```

The old prop-driven `columns[i].width = newWidth` mutation becomes `:column-state="[{ columnId: 'city', width: newWidth }]"`; `hidden` follows the same shape.

## Column pinning

Set `pinned: "start"` or `"end"` on a definition, or drive it at runtime through
the exposed core (`.value` unwraps the `ShallowRef`):
`gridRef.value.core.columns.setPinned(columnId, "start")`. `"start"`/`"end"` abut
that edge; `null` unpins. A pin is a request: when the viewport cannot fit it
the column renders in the scrolling center and is admitted again once there is
room, so read the effective `region` from `core.columns.getState()` rather than
assuming the request took effect.

The default header cycles through physical left, physical right and unpinned.
Override its glyph with `pin-icon` and its accessible names with
`labels.pinLeftColumn`/`labels.pinRightColumn`/`labels.unpinColumn`. A custom
header renderer receives `pinned` and `onPinChange(pinned)` and can supply its
own control.

```vue
<template>
  <GpGrid
    :columns="[{ field: 'id', pinned: 'start' }, { field: 'name' }]"
    :row-data="rows"
    :row-height="36"
    :column-overscan="240"
    :on-column-pinned="({ columnId, pinned }) => persistPin(columnId, pinned)"
  />
</template>
```

Only the admitted pins plus a window of center columns are mounted, so a
1,000-column grid renders about as many cells as a 20-column one.
`column-overscan` is the CSS px of center columns kept mounted past each edge
(default `240`). An open editor keeps its column mounted until the edit ends.
See [Column pinning](../../docs/features/column-pinning.md).

## Frozen rows

`freeze-rows="{ count, maxCount?, minSuffixHeight? }"` keeps the displayed rows
`[0, count)` fixed below the header while the rest scroll, across sort, filter
and data changes. Defaults: `count 0`, `maxCount 100`, `minSuffixHeight 64` (CSS
px of suffix viewport kept below the prefix). Invalid values throw.

```vue
<template>
  <GpGrid
    :columns="columns"
    :row-data="rows"
    :row-height="36"
    :freeze-rows="{ count: 3 }"
    :on-frozen-rows-changed="(state) => frozenLabel = `${state.effectiveCount}/${state.requestedCount}`"
  />
</template>
```

`count` is a request: the effective count is bounded by `maxCount`, by the
viewport (a frozen prefix always leaves `minSuffixHeight` for the suffix) and,
with a paginated source, by the page budget. `onFrozenRowsChanged` fires
whenever the effective count or its `limit` (`"maxCount" | "viewport" | "cache" | null`)
changes — not for the initial resolution and not per scroll. `state.limit`
tells you which constraint applied.

When the limit reduces the prefix, the grid announces
`labels.frozenRowsLimited` (`"{effective} of {requested} rows frozen"` by
default) in a visually hidden live region, so a screen reader hears the
reduction. Frozen rows render in a sticky block above the scrolling rows, with
their pinned cells in a sibling sticky layer; an unavailable frozen row (a
paginated page not loaded yet) renders a cell-less placeholder.

Changing `freeze-rows` after mount applies the new count through
`core.frozenRows.set` without rebuilding the core or resetting scroll; the runtime
setter also corrects the scroll position so the visible suffix stays anchored,
and an equal-valued object is silent. See
[Frozen rows](../../docs/features/frozen-rows.md).

### Row heights

Rows are `row-height` px tall unless you set a height by row identity. The
commands live on the exposed core, so a height change never remounts the grid:

```vue
<GpGrid ref="gridRef" :columns="columns" :data-source="dataSource" />

<script setup lang="ts">
const gridRef = ref<InstanceType<typeof GpGrid> | null>(null);
const coreOf = () => (gridRef.value as unknown as { core?: GridCore<unknown> } | null)?.core;

coreOf()?.rowHeights.set([{ rowId: 2, height: 96 }]);
coreOf()?.rowHeights.reset([2]);   // or reset() for all of them
coreOf()?.rowHeights.getOverrides();
</script>
```

A `height` must be finite and `> 0`; `set` is all or nothing, so one invalid
entry throws a `RangeError` and applies nothing. With `getRowId` a height
follows its row through sort, filter, refresh and paging, and an ID whose page
has not loaded yet waits for its row. Without `getRowId`, an integer `rowId`
addresses a view index and is dropped at the next data revision.

Applying a height is one atomic size change: the grid anchors the row at the
clip top and corrects the scroll position in the same batch, so the viewport
does not jump. Row boxes are sized from `SlotData.height` (published in
`useGpGrid`'s `slotsArray`), cells fill their row through the shipped CSS, and
the row drag ghost matches `RowDragState.sourceRowHeight`. Nothing is measured
continuously; a fit measures once (below). See
[Row heights](../../docs/features/row-heights.md).

### Row resize and auto-fit

`row-resize` lets the user drag a row edge; a double-click on a row or column
edge fits it to its rendered content once. The same commands are on the exposed
core:

```vue
<GpGrid ref="gridRef" :columns="columns" :row-data="rows" :row-height="32"
  :row-resize="true" :auto-fit="{ maxColumnWidth: 400 }"
  :on-row-resized="({ rowId, height }) => saveHeight(rowId, height)" />

<script setup lang="ts">
coreOf()?.columns.fit(["name"]); // { status, columns, skipped, ... }
coreOf()?.rowHeights.fit();       // every mounted row
coreOf()?.columns.setState([{ columnId: "name", width: null }]); // drop the width
</script>
```

A fit reads the mounted cells only, clamps into `auto-fit` and the column's
`minWidth`/`maxWidth`, and stores the result like a resize. Call it after the
render that follows a column change: a fit in the same task returns `"stale"` and
applies nothing. The edge handles are pointer-only (`aria-hidden`); the keyboard
equivalents are the Alt shortcuts below. `useGpGrid` takes `rowResize` and
`autoFit` too and builds its measurement host over `containerRef`, which must
carry `data-layout-revision`. See
[Auto-fit and row resize](../../docs/features/auto-fit.md).

## Column groups

`column-groups` nests the headers over the column ids; every column is
referenced once, ungrouped ones at the root. `header-band-heights` sets each
band's height (default `header-height`), and both props apply at runtime without
a remount:

```vue
<script setup lang="ts">
const columnGroups: ColumnGroupChild[] = [
  "id",
  { groupId: "person", headerName: "Person", children: ["name", "age"] },
];
</script>

<template>
  <GpGrid :columns="columns" :column-groups="columnGroups" :header-band-heights="[40]"
    :on-column-schema-rejected="(error) => console.warn(error.code, error.message)" />
</template>
```

An invalid hierarchy (a cycle, a duplicate or colliding id, an unknown, repeated
or missing column, a group under two parents, or an exceeded
`column-group-limits` budget) is rejected: the grid keeps the previous one and
calls `onColumnSchemaRejected`. The prop stays as given and is re-applied with
every later `columns` change, so restore a valid hierarchy. A group's
`headerRenderer` is a `VueGroupHeaderRenderer` (function or component) or a key
of `header-renderers`, receiving `ColumnGroupHeaderParams`. A header taller than
its band is clipped; `wrapHeaderText` wraps it. See
[Column groups and header bands](../../docs/features/column-groups.md).

## Row grouping

`row-grouping` groups the rows of a source loaded in full by ordered dimensions,
with aggregates and an optional total row. Build it once, outside reactive
state or in a `shallowRef`: a new object regroups.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { GpGrid, createRowGrouping, type GridCore } from "@gp-grid/vue";

const grid = ref<{ core: GridCore | null } | null>(null);
const grouping = createRowGrouping({
  dimensions: [{ field: "country" }, { field: "city" }],
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "score", aggregate: "avg" },
  ],
  grandTotal: "top",
});
const expandAll = () => grid.value?.core?.rowGroups.setExpanded(null, true);
</script>

<template>
  <GpGrid ref="grid" :columns="columns" :row-data="rows" :row-height="32"
    :get-row-id="(row) => row.id" :row-grouping="grouping" group-label-column="country"
    :on-row-group-toggled="({ rowId, expanded }) => console.log(rowId, expanded)"
    :on-row-grouping-rejected="(rejection) => console.warn(rejection.reason)" />
</template>
```

Every group starts collapsed (`defaultExpandedDepth: 0`). A group row is an
ordinary row: its expander and label sit in ``group-label-column`` (default: the first
displayed column) and each aggregate under the column named by the measure's
`field`. Aggregates are `"sum"`, `"count"`, `"avg"`, `"min"`, `"max"` or a custom
`RowGroupAggregator`; they are displayed unrounded, so give a numeric measure
column a `valueFormatter`. A cell renderer receives `rowKind` (`"group"` or
`"total"`, with `rowData` undefined) on an aggregate cell and is not called for
a group cell without an aggregate. ``group-label-renderer`` (`VueGroupLabelRenderer`, a function or a component)
replaces the label text and receives `{ row, viewIndex, label, toggle }`.

A pointer down on the expander, a double-click on a group row, and Enter or
Space on its active cell toggle it and call `onRowGroupToggled`. Editing a
measure cell updates the aggregates on its path; editing a dimension cell moves
the record, expands its new groups and keeps the active cell on it. Group and
total rows are read-only, and row drag is disabled while grouped. A paginated
source, an unknown field or an object key without `toKey` is rejected: the grid
stays flat and calls `onRowGroupingRejected`. A data source can also return rows
it grouped itself as a `HierarchicalRowAccess`. On the server the grid renders
the flat shell and groups after the first client load. See
[Row grouping and aggregation](../../docs/features/row-grouping.md).

`useGpGrid` takes `rowGrouping`, `onRowGroupToggled` and `onRowGroupingRejected`
and returns `handleGroupTogglePointerDown(rowIndex, event)` for the expander of a
custom grid; `renderGroupLabel(params, renderer?)` renders the label.

The public website documentation for this package lives outside this repository and should be updated by the maintainer.

## API Reference

### GpGridProps

| Prop              | Type                                | Default     | Description                                                 |
| ----------------- | ----------------------------------- | ----------- | ----------------------------------------------------------- |
| `columns`         | `ColumnDefinition[]`                | required    | Column definitions                                          |
| `columnState`     | `ColumnStateUpdate[]`               | -           | Controlled `{ columnId, width?, hidden?, order?, pinned? }` state applied through the core |
| `columnLayout`   | `"fit" \| "fixed"`                    | `"fit"`    | Displayed-width policy: `"fit"` expands columns to the viewport, `"fixed"` keeps declared/overridden widths |
| `columnOverscan` | `number`                             | `240`       | CSS px of center columns kept mounted past each clip edge    |
| `freezeRows`      | `FreezeRowsOptions`                  | `{ count: 0 }` | Frozen prefix: `{ count, maxCount?, minSuffixHeight? }`, applied at runtime |
| `dataSource`      | `DataSource<TData>`                 | -           | Data source for fetching data                               |
| `rowData`         | `TData[]`                           | -           | Alternative: raw data array (wrapped in client data source) |
| `rowHeight`       | `number`                            | required    | Height of each row in pixels                                |
| `headerHeight`    | `number`                            | `rowHeight` | Default height of every header band                         |
| `headerBandHeights` | `readonly number[]`               | -           | Height per header band; a band without one is `headerHeight`. Applied at runtime |
| `columnGroups`    | `ColumnGroupChild[]`                | -           | Nested header groups over the column ids, applied with `columns` |
| `columnGroupLimits` | `ColumnGroupLimits`               | `64` / `100,000` / `100,000` | `{ maxDepth?, maxNodes?, maxFragments? }`; read at creation |
| `rowResize`       | `boolean`                           | `false`     | Row edge drag and double-click, Alt+ArrowUp/Down, Alt+Shift+Enter; applied at runtime |
| `autoFit`         | `AutoFitOptions`                    | `600` / `rowHeight` / `10 × rowHeight` | `{ maxColumnWidth?, minRowHeight?, maxRowHeight? }`; read at creation |
| `overscan`        | `number`                            | `3`         | Number of rows to render outside viewport                   |
| `sortingEnabled`  | `boolean`                           | `true`      | Enable column sorting                                       |
| `getRowId`        | `(row: TData) => RowId`             | -           | Stable row identity; required for mutations                 |
| `darkMode`        | `boolean`                           | `false`     | Enable dark theme                                           |
| `wheelDampening`  | `number`                            | `0.1`       | Scroll wheel sensitivity (0-1)                              |
| `cellRenderers`   | `Record<string, VueCellRenderer>`   | `{}`        | Cell renderer registry                                      |
| `editRenderers`   | `Record<string, VueEditRenderer>`   | `{}`        | Edit renderer registry                                      |
| `headerRenderers` | `Record<string, VueHeaderRenderer>` | `{}`        | Header renderer registry                                    |
| `cellRenderer`    | `VueCellRenderer`                   | -           | Global fallback cell renderer                               |
| `editRenderer`    | `VueEditRenderer`                   | -           | Global fallback edit renderer                               |
| `headerRenderer`  | `VueHeaderRenderer`                 | -           | Global fallback header renderer                             |
| `pinIcon`         | `GridIcon`                          | push-pin    | SVG used by the default header's pin toggle (`:pin-icon`)   |
| `onColumnResized` | `(event: ColumnResizedEvent) => void` | -         | Called with `{ columnId, width, viewIndex }`                |
| `onColumnMoved`   | `(event: ColumnMovedEvent) => void`   | -         | Called with `{ columnId, fromViewIndex, toViewIndex }`      |
| `onColumnPinned`  | `(event: ColumnPinnedEvent) => void`  | -         | Called with `{ columnId, pinned }` when a pin changes       |
| `onFrozenRowsChanged` | `(state: FrozenRowsState) => void` | -        | Called with `{ requestedCount, effectiveCount, limit }` when the frozen prefix changes |
| `onRowResized`    | `(event: RowResizedEvent) => void`  | -           | Called with `{ rowId, height, viewIndex }` per row a drag, a key or a fit changed |
| `onColumnSchemaRejected` | `(error: ColumnSchemaError) => void` | - | Called with `{ code, source, id?, limit?, message }` when a column change is rejected |
| `rowGrouping`     | `RowGrouping \| null`                 | -           | Groups the resident rows (`createRowGrouping`); a new value regroups without a remount |
| `groupLabelColumn` | `string`                             | first displayed column | Column showing a group's expander and label |
| `groupLabelRenderer` | `VueGroupLabelRenderer`              | -           | Renders the label of a group or total row from `{ row, viewIndex, label, toggle }` |
| `onRowGroupToggled` | `(event: RowGroupToggledEvent) => void` | -      | Called with `{ rowId, expanded }` per group a pointer or key gesture toggled |
| `onRowGroupingRejected` | `(rejection: RowGroupingRejection) => void` | - | Called with `{ reason, field? }` when `rowGrouping` cannot apply; the grid renders the source's rows |
| `onRowDragEnd`    | `(event: RowDragEndEvent) => void`    | -         | Called with `{ rowId, fromViewIndex, toViewIndex }`         |
| `onCellValueChanged` | `(event: CellValueChangedEvent<TData>) => void` | - | Requires `getRowId`; payload includes `columnId`, and `colIndex` is the current view column index |
| `onWriteRejected` | `(event: CellWriteRejectedEvent) => void` | - | Called when a write is refused: `reason` is `"read-only-source"`, `"not-a-record"` (a group or total row), `"derived-view"` (a row drag under grouping) or `"type-mismatch"` (an edit commit the column type cannot hold) |

### ColumnDefinition

| Property         | Type           | Description                                                         |
| ---------------- | -------------- | ------------------------------------------------------------------- |
| `field`          | `string`       | Property path in row data (supports dot notation: `"address.city"`) |
| `colId`          | `string`       | Unique column ID (defaults to `field`)                              |
| `cellDataType`   | `CellDataType` | `"text"` \| `"number"` \| `"boolean"` \| `"date"` \| `"object"`     |
| `width`          | `number`       | Initial column width in pixels; live width is core state            |
| `headerName`     | `string`       | Display name in header (defaults to `field`)                        |
| `editable`       | `boolean`      | Enable cell editing                                                 |
| `cellRenderer`   | `string`       | Key in `cellRenderers` registry                                     |
| `editRenderer`   | `string`       | Key in `editRenderers` registry                                     |
| `headerRenderer` | `string`       | Key in `headerRenderers` registry                                   |
| `pinned`         | `"start" \| "end"` | Initial pin against that viewport edge; an explicit `pinned: null` command unpins |
| `wrapHeaderText` | `boolean`      | Wrap the header text inside its band                                |

### Renderer Types

```typescript
import type { VNode } from "vue";

// Cell renderer receives these params
interface CellRendererParams<TData = unknown> {
  value: CellValue; // Current cell value
  rowData?: TData; // Source record; absent for record-less rows
  rowId?: RowId; // Stable row identity, when the source exposes one
  columnId: string; // `colId ?? field`
  getValue?: (field: string) => CellValue; // Read another field's raw value
  column: ColumnDefinition; // Column definition
  rowIndex: number; // Row index
  colIndex: number; // Column index
  isActive: boolean; // Is this the active cell?
  isSelected: boolean; // Is this cell in selection?
  isEditing: boolean; // Is this cell being edited?
  rowKind?: "record" | "group" | "total"; // Under row grouping; absent while flat
}

// Vue cell renderer - can return VNode or string
type VueCellRenderer = (params: CellRendererParams) => VNode | string | null;

// Edit renderer receives additional callbacks
interface EditRendererParams extends CellRendererParams {
  initialValue: CellValue;
  onValueChange: (newValue: CellValue) => void;
  onCommit: () => void;
  onCancel: () => void;
}

// Vue edit renderer - returns VNode for edit input
type VueEditRenderer = (params: EditRendererParams) => VNode | null;

// Header renderer params
interface HeaderRendererParams {
  column: ColumnDefinition;
  columnId: string; // `colId ?? field`
  colIndex: number;
  sortDirection?: "asc" | "desc";
  sortIndex?: number; // For multi-column sort
  onSort: (direction: "asc" | "desc" | null, addToExisting: boolean) => void;
}

// Vue header renderer
type VueHeaderRenderer = (
  params: HeaderRendererParams,
) => VNode | string | null;
```

## Keyboard Shortcuts

| Key                | Action                            |
| ------------------ | --------------------------------- |
| Arrow keys         | Navigate between cells            |
| Shift + Arrow      | Extend selection                  |
| Enter              | Start editing / Commit edit       |
| Enter / Space      | Expand or collapse the group row under the active cell |
| Escape             | Cancel edit / Clear selection     |
| Tab                | Commit and move right             |
| Shift + Tab        | Commit and move left              |
| F2                 | Start editing                     |
| Delete / Backspace | Start editing with empty value    |
| Ctrl + A           | Select all                        |
| Ctrl + C           | Copy selection to clipboard       |
| Ctrl + V           | Paste clipboard values into selection |
| Any character      | Start editing with that character |
| Alt + Left / Right | Shrink / grow the active column by 8 px |
| Alt + Up / Down    | Shrink / grow the active row by 4 px (`row-resize`) |
| Alt + Shift + Left / Right | Move the active column within its region |
| Alt + Enter        | Fit the active column             |
| Alt + Shift + Enter | Fit the active row (`row-resize`) |

## Styling

The grid injects its own styles automatically. The main container uses these CSS classes:

- `.gp-grid-container` - Main container
- `.gp-grid-container--dark` - Dark mode modifier
- `.gp-grid-header` - Header row container
- `.gp-grid-header-cell` - Individual header cell
- `.gp-grid-header-group` - Column group fragment (also a `.gp-grid-header-cell`)
- `.gp-grid-row` - Row container
- `.gp-grid-cell` - Cell container
- `.gp-grid-cell--active` - Active cell
- `.gp-grid-cell--selected` - Selected cell
- `.gp-grid-cell--editing` - Cell in edit mode
- `.gp-grid-filter-row` - Filter row container
- `.gp-grid-filter-input` - Filter input field
- `.gp-grid-fill-handle` - Fill handle element
- `.gp-grid-row-resize-handle` / `.gp-grid-row-resize-line` - Row edge handle and drag preview

## Donations

Keeping this library requires effort and passion, I'm a full time engineer employed on other project and I'm trying my best to keep this work free! For all the features.

If you think this project helped you achieve your goals, it's hopefully worth a beer! 🍻

[Support the project](https://www.gp-grid.io/support)
