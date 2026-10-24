# GP-Grid Documentation

A high-performance virtualized data grid for React, Vue and Angular, on a framework-agnostic core.

## Features

- [Sorting](./features/sorting.md) - Column sorting with multi-column support
- [Filtering](./features/filtering.md) - Type-aware filtering with popup UI
- [Column layout and geometry](./features/column-layout.md) - Width modes, overrides, geometry queries and coordinate spaces
- [Column pinning](./features/column-pinning.md) - Start/end pins, viewport admission, the mounted column window, `columnOverscan` and RTL
- [Frozen rows](./features/frozen-rows.md) - Keep the first n displayed rows below the header, effective count and limits, the live announcement and the frozen DOM contract
- [Row heights](./features/row-heights.md) - Per-row heights by identity, the scroll correction a change implies, paging, frozen rows and the published DOM contract
- [Auto-fit and row resize](./features/auto-fit.md) - Row edge resize, one-shot row and column fits, their results and clamps, the edge handles and the grid shortcuts
- [Column groups and header bands](./features/column-groups.md) - Nested group descriptors, validation and budgets, order and fragments, configured band heights, accessibility and SSR
- [Row grouping and aggregation](./features/row-grouping.md) - Dimensions, keys and ids, group order, aggregates, the label column, writes, rejections, expansion state and hierarchies supplied by a data source
- [Server grouping](./features/server-grouping.md) - Groups and leaves paged from an application service: the service contract and protocol rules, paths and ids, placeholders, lazy expansion, errors and retry, budgets, refresh and writes, the reference mock
- [Pivot](./features/pivot.md) - Read-only pivot: generated columns per key tuple and measure, the schema helper and ids, the precomputed and local (`createPivotSource`) compositions, domain, budget, sort and filter, the schema hook per wrapper
- [Write commands and history](./features/writes-and-history.md) - One event per edit, paste, fill or `cells.setValue` with its changes by record id and the targets it skipped, and opt-in undo and redo of those commands
- [Columnar data sources](../packages/core/README.md#columnar-data-source-read-only) - Borrowed columns, read-only access, and revision refresh with inferred or explicit row counts

## Upgrading from 0.23.x

The [migration guide](./migration-1.0.md) lists every change with before/after code per framework.

## Known limitations

- **Keyboard:** sort, the filter popup and pin are pointer targets in the header with no keyboard equivalent. Every other action has a key; see the [migration guide](./migration-1.0.md#15-browsers-and-keyboard).
- **Server grouping:** counts are exact, paging is by position range (no cursor paging), nothing is cached across queries, and the grid shows the aggregates the server sends; see [Limits](./features/server-grouping.md#limits).
- **Pivot:** read-only, with a `maxColumns` budget on the generated schema; see [Limits](./features/pivot.md#limits).
- **Aggregates and columnar sources are read-only:** a write on a group or total row, or on a columnar source, is refused and reported through `onWriteRejected`; see [Row grouping](./features/row-grouping.md) and [Columnar data sources](../packages/core/README.md#columnar-data-source-read-only).
- **Transactions:** an update keeps its row in place until the next query, even when a sorted or filtered field changed; an add or a remove reloads fully; see [Write commands and history](./features/writes-and-history.md).
- **Filters:** the 0.x flat `conditions` shape is accepted on input only; every output is the grouped model; see [Filtering](./features/filtering.md#migrating-flat-condition-models).
- **Server rendering:** the server render uses the configured sizes and no hydration-specific test exists; the client measures after mount.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

## Quick Start

```tsx
import { Grid } from '@gp-grid/react';

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

## Cell text overflow

By default, cell text that exceeds the column width is truncated with an
ellipsis (`…`); hovering the cell shows the full value in a native tooltip.
To wrap long text onto additional lines instead, set `wrapText: true` on a
column. Wrapped text is clipped to the row height (rows do not auto-grow), so
combine it with the built-in peek overlay (double-click a non-editable cell) to
read the full value, or [fit the row](./features/auto-fit.md) to its wrapped
lines once.

```tsx
const columns = [
  { field: 'description', cellDataType: 'text', width: 240, wrapText: true },
];
```

## Packages

- **@gp-grid/core**: Framework-agnostic core library
- **@gp-grid/react**: React adapter and components
