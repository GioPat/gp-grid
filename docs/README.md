# GP-Grid Documentation

A high-performance virtualized data grid for React applications.

## Features

- [Sorting](./features/sorting.md) - Column sorting with multi-column support
- [Filtering](./features/filtering.md) - Type-aware filtering with popup UI

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

## Quick Start

```tsx
import { Grid } from 'gp-grid-react';

const columns = [
  { field: 'id', cellDataType: 'number', width: 80 },
  { field: 'name', cellDataType: 'text', width: 200 },
  { field: 'price', cellDataType: 'number', width: 120 },
];

const data = [
  { id: 1, name: 'Product A', price: 99.99 },
  { id: 2, name: 'Product B', price: 149.99 },
];

function App() {
  return (
    <div style={{ height: 400 }}>
      <Grid
        columns={columns}
        rowData={data}
        rowHeight={35}
        sortingEnabled={true}
      />
    </div>
  );
}
```

## Packages

- **gp-grid-core**: Framework-agnostic core library
- **gp-grid-react**: React adapter and components
