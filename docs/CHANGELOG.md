# Changelog

All notable changes to gp-grid will be documented in this file.

## [Unreleased]

### Added

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
