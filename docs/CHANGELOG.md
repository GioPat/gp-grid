# Changelog

All notable changes to gp-grid will be documented in this file.

## [Unreleased]

### Added

#### Identity, column state and schema lifecycle (PRD 002)
- `GridCore.setColumnState(updates)`, `resetColumnState(columnIds?)` and `getColumnState()`; an optional controlled `columnState` input on every wrapper
- `GridCore.getViewRow(viewIndex)` and `getRecordById(rowId)` for identity-addressed record access
- `getSlotGeneration`/`isSlotGenerationCurrent` and a monotonically increasing slot assignment `generation`
- Edit session token: `EditState.editId`, `editId` on `START_EDIT`, and an optional `editId` argument on `updateEditValue`/`commitEdit`/`cancelEdit`; wrapper editor callbacks are tagged automatically, so a callback from a closed editor can no longer act on a newer edit
- `createMutableClientDataSource` implements `DataSource.getRecordById` through its ID index
- Object-shaped column/row events with stable identity: `onColumnResized({ columnId, width, viewIndex })`, `onColumnMoved({ columnId, fromViewIndex, toViewIndex })`, `onRowDragEnd({ rowId, fromViewIndex, toViewIndex })`

#### Sorting
- Global `sortingEnabled` option to enable/disable sorting across the grid
- Per-column `sortable` option in column definitions
- Stacked sort arrows (up/down) in sortable column headers
- Active sort direction highlighted, inactive direction dimmed
- Multi-column sort support with sort index indicator

#### Filtering
- Explicit one-level condition groups remove ambiguity from mixed AND/OR filters
- Legacy flat condition models are normalized without changing their left-to-right semantics
- Per-column `filterable` option in column definitions
- Filter icon in column headers (funnel icon)
- Header-based filter popup system
- Type-aware filter UI:
  - **Text columns**: Checkbox list with distinct values, search input, Select All/Deselect All, blanks option
  - **Number columns**: Operators (=, !=, >, <, >=, <=, between, blank, notBlank)
  - **Date columns**: Operators (=, !=, >, <, between, blank, notBlank) with date inputs
- Multiple conditions with AND/OR combination
- Advanced filter model (`ColumnFilterModel`) with typed conditions

#### Text wrapping
- Fixed long cell text hard-clipping mid-character: default cells now truncate with an ellipsis (`…`).
- Per-column `wrapText` option to wrap long cell text onto multiple lines (clipped to the fixed row height).

### Changed
- **Breaking (0.x → 1.0):** `onColumnResized`/`onColumnMoved`/`onRowDragEnd` now take object payloads with `columnId`/`rowId` and named view indices in all wrappers; positional callbacks are no longer supported
- **Breaking (0.x → 1.0):** `CellValueChangedEvent` gained `columnId`, and `getRowData` returns the currently resident source record only
- Column definitions are immutable caller input; live width/order/visibility state is keyed by `ColumnId` in the core, so resize/move never mutate the caller's objects or array
- Replacing `columns` reconciles by id in one instruction batch: retained columns keep user state, sort and filter; removed columns drop their state, headers and caches; the core instance survives
- `ColumnFilterModel` now exposes `groups`; canonical conditions no longer expose `nextOperator`
- Filter popups in React, Vue, and Angular use group cards with separate condition/group operators
- Grid label props use `GridLabelOverrides`, allowing individual nested operator overrides
- `FilterModel` type changed from `Record<string, string>` to `Record<string, ColumnFilterModel>`
- Header rendering now includes sort/filter indicators and icons
- `setFilter()` accepts canonical grouped filters plus legacy flat/string inputs for migration

### Fixed
- Centered the remove-condition and remove-group glyphs within their buttons
- Rendered each condition/group combination selector once for its scope instead of showing tied duplicates
- Ensured active filter toggles and focus outlines retain the theme primary color against generic application button styles
- Matched the selected Values/Condition branch to the blue AND/OR state, removed its dark padded track, and exposed toggle state with `aria-pressed`

## [0.1.6] - 2024-12-23

### Added
- Transaction management system for live data manipulation
- `TransactionManager` class for batching data changes
- `IndexedDataStore` for efficient data lookups
- `createMutableClientDataSource` for reactive data sources
- Grid instructions for row add/remove/update operations

## [0.1.5] - 2024-12-XX

### Added
- Drag and fill functionality (vertical only)
- Fill handle on selected cells for editable columns
- Auto-scroll during fill drag near viewport edges

### Fixed
- Fill handle now restricted to vertical direction to avoid data type issues
