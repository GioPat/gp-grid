# gp-grid-react

A high-performance, feature lean React data grid component built to manage grids with huge amount (millions) of rows. It's based on its core dependency: `gp-grid-core`, featuring virtual scrolling, cell selection, sorting, filtering, editing, and Excel-like fill handle.

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
pnpm add gp-grid-react
```

## Quick Start

```tsx
import { Grid, type ColumnDefinition } from "gp-grid-react";

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

function App() {
  return (
    <div style={{ width: "800px", height: "400px" }}>
      <Grid columns={columns} rowData={data} rowHeight={36} />
    </div>
  );
}
```

## Examples

### Client-Side Data Source with Sorting and Filtering

For larger datasets with client-side sort/filter operations:

```tsx
import { useMemo } from "react";
import {
  Grid,
  createClientDataSource,
  type ColumnDefinition,
} from "gp-grid-react";

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

function ProductGrid() {
  const products: Product[] = useMemo(
    () =>
      Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `Product ${i + 1}`,
        price: Math.round(Math.random() * 1000) / 10,
        category: ["Electronics", "Clothing", "Food", "Books"][i % 4],
      })),
    [],
  );

  const dataSource = useMemo(
    () => createClientDataSource(products),
    [products],
  );

  return (
    <div style={{ width: "100%", height: "500px" }}>
      <Grid
        columns={columns}
        dataSource={dataSource}
        rowHeight={36}
        headerHeight={40}
        showFilters={true}
        filterDebounce={300}
      />
    </div>
  );
}
```

### Server-Side Data Source

For datasets too large to load entirely in memory, use a server-side data source:

```tsx
import { useMemo } from "react";
import {
  Grid,
  createServerDataSource,
  type ColumnDefinition,
  type DataSourceRequest,
  type DataSourceResponse,
} from "gp-grid-react";

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
        params.set(`filter[${field}]`, value);
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

function UserGrid() {
  // Create server data source - memoize to prevent recreation
  const dataSource = useMemo(
    () => createServerDataSource<User>(fetchUsers),
    [],
  );

  return (
    <div style={{ width: "100%", height: "600px" }}>
      <Grid
        columns={columns}
        dataSource={dataSource}
        rowHeight={36}
        headerHeight={40}
        showFilters={true}
        filterDebounce={500} // Debounce filter requests
        darkMode={true}
      />
    </div>
  );
}
```

### Custom Cell Renderers

Use the registry pattern to define reusable renderers:

```tsx
import {
  Grid,
  type ColumnDefinition,
  type CellRendererParams,
} from "gp-grid-react";

interface Order {
  id: number;
  customer: string;
  total: number;
  status: "pending" | "shipped" | "delivered" | "cancelled";
}

// Define reusable renderers
const cellRenderers = {
  // Currency formatter
  currency: (params: CellRendererParams) => {
    const value = params.value as number;
    return (
      <span style={{ color: "#047857", fontWeight: 600 }}>
        ${value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
      </span>
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

    return (
      <span
        style={{
          backgroundColor: color.bg,
          color: color.text,
          padding: "2px 8px",
          borderRadius: "12px",
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {status.toUpperCase()}
      </span>
    );
  },

  // Bold text
  bold: (params: CellRendererParams) => (
    <strong>{String(params.value ?? "")}</strong>
  ),
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

function OrderGrid({ orders }: { orders: Order[] }) {
  return (
    <div style={{ width: "100%", height: "400px" }}>
      <Grid
        columns={columns}
        rowData={orders}
        rowHeight={40}
        cellRenderers={cellRenderers}
      />
    </div>
  );
}
```

### Editable Cells with Custom Editors

```tsx
import { useState } from "react";
import {
  Grid,
  createClientDataSource,
  type ColumnDefinition,
  type EditRendererParams,
} from "gp-grid-react";

interface Task {
  id: number;
  title: string;
  priority: "low" | "medium" | "high";
  completed: boolean;
}

// Custom select editor for priority field
const editRenderers = {
  prioritySelect: (params: EditRendererParams) => {
    const [value, setValue] = useState(params.initialValue as string);

    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          params.onValueChange(e.target.value);
        }}
        onBlur={() => params.onCommit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") params.onCommit();
          if (e.key === "Escape") params.onCancel();
        }}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          outline: "none",
          padding: "0 8px",
        }}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    );
  },

  checkbox: (params: EditRendererParams) => (
    <input
      type="checkbox"
      autoFocus
      defaultChecked={params.initialValue as boolean}
      onChange={(e) => {
        params.onValueChange(e.target.checked);
        params.onCommit();
      }}
      style={{ width: 20, height: 20 }}
    />
  ),
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

function TaskGrid() {
  const tasks: Task[] = [
    { id: 1, title: "Write documentation", priority: "high", completed: false },
    { id: 2, title: "Fix bugs", priority: "medium", completed: true },
    { id: 3, title: "Add tests", priority: "low", completed: false },
  ];

  const dataSource = createClientDataSource(tasks);

  return (
    <div style={{ width: "600px", height: "300px" }}>
      <Grid
        columns={columns}
        dataSource={dataSource}
        rowHeight={40}
        editRenderers={editRenderers}
      />
    </div>
  );
}
```

### Dark Mode

```tsx
<Grid columns={columns} rowData={data} rowHeight={36} darkMode={true} />
```

## API Reference

### GridProps

| Prop              | Type                                  | Default     | Description                                                 |
| ----------------- | ------------------------------------- | ----------- | ----------------------------------------------------------- |
| `columns`         | `ColumnDefinition[]`                  | required    | Column definitions                                          |
| `dataSource`      | `DataSource<TData>`                   | -           | Data source for fetching data                               |
| `rowData`         | `TData[]`                             | -           | Alternative: raw data array (wrapped in client data source) |
| `rowHeight`       | `number`                              | required    | Height of each row in pixels                                |
| `headerHeight`    | `number`                              | `rowHeight` | Height of header row                                        |
| `overscan`        | `number`                              | `3`         | Number of rows to render outside viewport                   |
| `showFilters`     | `boolean`                             | `false`     | Show filter row below headers                               |
| `filterDebounce`  | `number`                              | `300`       | Debounce time for filter input (ms)                         |
| `darkMode`        | `boolean`                             | `false`     | Enable dark theme                                           |
| `cellRenderers`   | `Record<string, ReactCellRenderer>`   | `{}`        | Cell renderer registry                                      |
| `editRenderers`   | `Record<string, ReactEditRenderer>`   | `{}`        | Edit renderer registry                                      |
| `headerRenderers` | `Record<string, ReactHeaderRenderer>` | `{}`        | Header renderer registry                                    |
| `cellRenderer`    | `ReactCellRenderer`                   | -           | Global fallback cell renderer                               |
| `editRenderer`    | `ReactEditRenderer`                   | -           | Global fallback edit renderer                               |
| `headerRenderer`  | `ReactHeaderRenderer`                 | -           | Global fallback header renderer                             |

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

// Edit renderer receives additional callbacks
interface EditRendererParams extends CellRendererParams {
  initialValue: CellValue;
  onValueChange: (newValue: CellValue) => void;
  onCommit: () => void;
  onCancel: () => void;
}

// Header renderer params
interface HeaderRendererParams {
  column: ColumnDefinition;
  colIndex: number;
  sortDirection?: "asc" | "desc";
  sortIndex?: number; // For multi-column sort
  onSort: (direction: "asc" | "desc" | null, addToExisting: boolean) => void;
}
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
