# gp-grid-vue 🏁 🏎️

<div align="center">
    <a href="https://www.gp-grid.io">
        <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/GioPat/gp-grid-docs/refs/heads/master/public/logo-light.svg"/>
        <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/GioPat/gp-grid-docs/refs/heads/master/public/logo-dark.svg"/>
        <img width="50%" alt="AG Grid Logo" src="https://raw.githubusercontent.com/GioPat/gp-grid-docs/refs/heads/master/public/logo-dark.svg"/>
        </picture>
    </a>
    <div align="center">
     Logo by <a href="https://github.com/camillo18tre">camillo18tre ❤️</a>
      <h4><a href="https://www.gp-grid.io/">🎮 Demo</a> • <a href="https://www.gp-grid.io/docs/vue">📖 Documentation</a>
    </div>
</div>

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/GioPat/gp-grid)

A high-performance, feature lean Vue 3 data grid component built to manage grids with huge amount (millions) of rows. It's based on its core dependency: `gp-grid-core`, featuring virtual scrolling, cell selection, sorting, filtering, editing, and Excel-like fill handle.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Examples](#examples)
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
- **Keyboard Navigation**: Arrow keys, Tab, Enter, Escape, Ctrl+A, Ctrl+C
- **Custom Renderers**: Registry-based cell, edit, and header renderers
- **Dark Mode**: Built-in dark theme support
- **TypeScript**: Full type safety with exported types

## Installation

Use `npm`, `yarn` or `pnpm`

```bash
pnpm add gp-grid-vue
```

## Quick Start

```vue
<script setup lang="ts">
import { GpGrid, type ColumnDefinition } from "gp-grid-vue";

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
} from "gp-grid-vue";

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
} from "gp-grid-vue";

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
} from "gp-grid-vue";

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

```vue
<script setup lang="ts">
import { h, ref as vueRef } from "vue";
import {
  GpGrid,
  createClientDataSource,
  type ColumnDefinition,
  type EditRendererParams,
  type VueEditRenderer,
} from "gp-grid-vue";

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

## API Reference

### GpGridProps

| Prop              | Type                                | Default     | Description                                                 |
| ----------------- | ----------------------------------- | ----------- | ----------------------------------------------------------- |
| `columns`         | `ColumnDefinition[]`                | required    | Column definitions                                          |
| `dataSource`      | `DataSource<TData>`                 | -           | Data source for fetching data                               |
| `rowData`         | `TData[]`                           | -           | Alternative: raw data array (wrapped in client data source) |
| `rowHeight`       | `number`                            | required    | Height of each row in pixels                                |
| `headerHeight`    | `number`                            | `rowHeight` | Height of header row                                        |
| `overscan`        | `number`                            | `3`         | Number of rows to render outside viewport                   |
| `sortingEnabled`  | `boolean`                           | `true`      | Enable column sorting                                       |
| `darkMode`        | `boolean`                           | `false`     | Enable dark theme                                           |
| `wheelDampening`  | `number`                            | `0.1`       | Scroll wheel sensitivity (0-1)                              |
| `cellRenderers`   | `Record<string, VueCellRenderer>`   | `{}`        | Cell renderer registry                                      |
| `editRenderers`   | `Record<string, VueEditRenderer>`   | `{}`        | Edit renderer registry                                      |
| `headerRenderers` | `Record<string, VueHeaderRenderer>` | `{}`        | Header renderer registry                                    |
| `cellRenderer`    | `VueCellRenderer`                   | -           | Global fallback cell renderer                               |
| `editRenderer`    | `VueEditRenderer`                   | -           | Global fallback edit renderer                               |
| `headerRenderer`  | `VueHeaderRenderer`                 | -           | Global fallback header renderer                             |

### ColumnDefinition

| Property         | Type           | Description                                                         |
| ---------------- | -------------- | ------------------------------------------------------------------- |
| `field`          | `string`       | Property path in row data (supports dot notation: `"address.city"`) |
| `colId`          | `string`       | Unique column ID (defaults to `field`)                              |
| `cellDataType`   | `CellDataType` | `"text"` \| `"number"` \| `"boolean"` \| `"date"` \| `"object"`     |
| `width`          | `number`       | Column width in pixels                                              |
| `headerName`     | `string`       | Display name in header (defaults to `field`)                        |
| `editable`       | `boolean`      | Enable cell editing                                                 |
| `cellRenderer`   | `string`       | Key in `cellRenderers` registry                                     |
| `editRenderer`   | `string`       | Key in `editRenderers` registry                                     |
| `headerRenderer` | `string`       | Key in `headerRenderers` registry                                   |

### Renderer Types

```typescript
import type { VNode } from "vue";

// Cell renderer receives these params
interface CellRendererParams {
  value: CellValue; // Current cell value
  rowData: Row; // Full row data
  column: ColumnDefinition; // Column definition
  rowIndex: number; // Row index
  colIndex: number; // Column index
  isActive: boolean; // Is this the active cell?
  isSelected: boolean; // Is this cell in selection?
  isEditing: boolean; // Is this cell being edited?
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
| Escape             | Cancel edit / Clear selection     |
| Tab                | Commit and move right             |
| Shift + Tab        | Commit and move left              |
| F2                 | Start editing                     |
| Delete / Backspace | Start editing with empty value    |
| Ctrl + A           | Select all                        |
| Ctrl + C           | Copy selection to clipboard       |
| Any character      | Start editing with that character |

## Styling

The grid injects its own styles automatically. The main container uses these CSS classes:

- `.gp-grid-container` - Main container
- `.gp-grid-container--dark` - Dark mode modifier
- `.gp-grid-header` - Header row container
- `.gp-grid-header-cell` - Individual header cell
- `.gp-grid-row` - Row container
- `.gp-grid-cell` - Cell container
- `.gp-grid-cell--active` - Active cell
- `.gp-grid-cell--selected` - Selected cell
- `.gp-grid-cell--editing` - Cell in edit mode
- `.gp-grid-filter-row` - Filter row container
- `.gp-grid-filter-input` - Filter input field
- `.gp-grid-fill-handle` - Fill handle element

## Donations

Keeping this library requires effort and passion, I'm a full time engineer employed on other project and I'm trying my best to keep this work free! For all the features.

If you think this project helped you achieve your goals, it's hopefully worth a beer! 🍻

<div align="center">

### Paypal

[![Paypal QR Code](../../public/images/donazione_paypal.png "Paypal QR Code donation")](https://www.paypal.com/donate/?hosted_button_id=XCNMG6BR4ZMLY)

[https://www.paypal.com/donate/?hosted_button_id=XCNMG6BR4ZMLY](https://www.paypal.com/donate/?hosted_button_id=XCNMG6BR4ZMLY)

### Bitcoin

[![Bitcoin QR Donation](../../public/images/bc1qcukwmzver59eyqq442xyzscmxavqjt568kkc9m.png "Bitcoin QR Donation")](bitcoin:bc1qcukwmzver59eyqq442xyzscmxavqjt568kkc9m)

bitcoin:bc1qcukwmzver59eyqq442xyzscmxavqjt568kkc9m

### Lightning Network

[![Lightning Network QR Donation](../../public/images/lightning.png "Lightning Network QR Donation")](lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhhx6rpvanhjetdvfjhyvf4xs0xu5p7)

lnurl1dp68gurn8ghj7ampd3kx2ar0veekzar0wd5xjtnrdakj7tnhv4kxctttdehhwm30d3h82unvwqhhx6rpvanhjetdvfjhyvf4xs0xu5p7

</div>
