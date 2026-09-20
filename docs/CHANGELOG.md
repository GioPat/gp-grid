# Changelog

All notable changes to gp-grid will be documented in this file.

## [Unreleased]

### Added

#### Core geometry ownership (PRD 003)
- `VirtualAxis`: one numeric size/offset/window abstraction, with an O(1)
  fixed-size axis and a stored-offset prefix axis
- `columnLayout: "fit" | "fixed"` on `GridCore` and as a prop/input of every wrapper, changeable at runtime with `GridCore.setColumnLayout(mode)`
- `core.geometry`: revisioned column-layout snapshots plus row/cell bounds, hit testing and scroll targets in the named `"content"`, `"viewport"` and `"rows"` coordinate spaces
- `GridCore.getCellBounds(rowId, columnId, space?)` for identity-addressed bounds
- `ColumnStateSnapshot.resolvedWidth` (displayed CSS px, `0` while hidden) and an optional `width` that is present only while an explicit pixel override exists
- `GridState.layout`, `GridState.columnLayout`, `GridState.geometryRevision` and the `setLayout`/`setColumnLayout`/`setGeometryRevision` batch setters
- `SCROLL_TO` now carries an optional `scrollLeft` alongside `scrollTop`
- See [Column layout and geometry](./features/column-layout.md)

### Changed

#### Core geometry ownership (PRD 003)
- Column widths, offsets and row geometry are resolved once in core; wrappers render `state.layout.columns` instead of computing scaled positions. `fit` is still the default and expands proportionally, but it never shrinks.
- A manual resize writes the pixel override directly; it is no longer back-solved from the displayed width. Applying a column state `width` and resetting it are exact inverses.
- `onColumnResized.width` is the stored override and, for a displayed column, its measured width.
- An explicit `columnState`/`columnLayout` input seeds the deterministic first render (SSR) against `initialWidth`.
- The unmeasured viewport width used by the core is `0` until a wrapper reports one.
- `ViewportState` stores raw DOM scroll samples; conversion to logical coordinates happens in geometry.
- Angular observes the body scroll container (not the outer container) for its viewport measurements.
- `packages/angular` body scroller declares `min-width: 0` so a host resize reaches it.

### Removed

#### Core geometry ownership (PRD 003)
- `calculateScaledColumnPositions` — migrate to the core-resolved `state.layout.columns` (or `core.geometry.getColumnLayout()`) and select a mode with `columnLayout`
- `ColumnScrollGeometry`, `VisibleColumnInfo` — migrate to `core.geometry` bounds and `getScrollTarget`
- `InputHandlerDeps` and `InputHandler.updateDeps` — custom adapters construct `new InputHandler(core)`; geometry comes from the core
- `GridCore.getRowTranslateY`, `getScrollTopForRow`, `getRowIndexAtDisplayY` — migrate to `core.geometry` (`getRowBounds`, `getScrollTarget`, `hitTest`). `getColumnPositions` and `getVisibleRowRange` remain as deprecated forwarders and are removed in 1.1.
- Resize back-solving (`computeStoredWidthForDisplayed`) and the wrapper-local scaled-width calculations

### Migration examples

Removed proportional helper:

```ts
// before
const { positions, widths } = calculateScaledColumnPositions(columns, viewportWidth);

// after — a wrapper renders the core-resolved snapshot
for (const column of state.layout.columns) {
  cell.style.left = `${column.offset}px`;
  cell.style.width = `${column.width}px`;
}
```

Width persistence and reset:

```ts
// an override is the only source of `width`
core.setColumnState([{ columnId: "name", width: 240 }]);
core.getColumnState(); // [{ columnId: "name", width: 240, resolvedWidth: 240, ... }]

// reset removes the override and restores the proportional width
core.resetColumnState(["name"]);
core.getColumnState(); // [{ columnId: "name", resolvedWidth: 317, ... }]
```

Restoring an earlier snapshot after further edits requires a reset first:

```ts
const saved = core.getColumnState();
// ...further edits...
core.resetColumnState();
core.setColumnState(saved); // `resolvedWidth` is output-only and ignored on input
```

Offscreen scroll alignment:

```ts
// before: an unmounted row was always top-aligned
core.getScrollTarget(row, col); // aligns the start or the snapped end
```

Removed architecture helpers (custom adapters):

```ts
// before
core.input.updateDeps({ getColumnPositions: () => positions, ... });

// after
core.geometry.getCellBounds(rowIndex, layoutIndex, "viewport");
core.geometry.hitTest({ x, y });
```

Invalid widths and diagnostics:

```ts
// a declared/overridden width that is not positive and finite falls back to 50
// and warns once per column id
core.setColumnState([{ columnId: "name", width: 0 }]);
// [gp-grid] Invalid width for column "name"
```


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
