# Changelog

All notable changes to gp-grid will be documented in this file.

## [Unreleased]

### Added

#### Core geometry ownership (PRD 003)
- `VirtualAxis`: one numeric size/offset/window abstraction, with an O(1)
  fixed-size axis and a stored-offset prefix axis
- `columnLayout: "fit" | "fixed"` on `GridCore` and as a prop/input of every wrapper, changeable at runtime with `GridCore.columns.setLayout(mode)`
- `core.geometry`: revisioned column-layout snapshots plus row/cell bounds, hit testing and scroll targets in the named `"content"`, `"viewport"` and `"rows"` coordinate spaces
- `GridCore.cells.getBounds(rowId, columnId, space?)` for identity-addressed bounds
- `ColumnStateSnapshot.resolvedWidth` (displayed CSS px, `0` while hidden) and an optional `width` that is present only while an explicit pixel override exists
- `GridState.layout`, `GridState.columnLayout`, `GridState.geometryRevision` and the `setLayout`/`setColumnLayout`/`setGeometryRevision` batch setters
- `SCROLL_TO` now carries an optional `scrollLeft` alongside `scrollTop`
- See [Column layout and geometry](./features/column-layout.md)

#### Column virtualization and pinning (PRD 004)
- Pin state: `ColumnPin` (`"start" | "end"`), `ColumnDefinition.pinned` as a definition default, `ColumnState`/`ColumnStateUpdate.pinned` (`null` unpins even against a definition default), and `ColumnStateSnapshot.pinned` (requested) plus output-only `region` (effective, `null` while hidden)
- `GridCore.columns.setPinned(columnId, pinned)` and the `onColumnPinned({ columnId, pinned })` option, fired by that command, the header toggle and a cross-region header drag; `columns.setState` stays silent
- Region-partitioned layout: `ColumnRegion`, `ResolvedColumn` (`region`, `regionOffset`), `ColumnRegionLayout` and `ColumnLayoutSnapshot.regions`
- `GridState.columnWindow` (`ColumnWindowSnapshot`) with the `SET_COLUMN_WINDOW` instruction and `BatchChangeSetters.setColumnWindow`, replacing per-column iteration with an admitted start/end plus bounded center window
- `columnOverscan` (CSS px per side, default `240`) on `GridCore` and as a prop/input of every wrapper
- `core.geometry.getColumnClip(layoutIndex)` and the resolved `region` on `hitTest` results
- Inline-axis adapter kit: `readIsRtl`, `toInlineX`, `toPhysicalX`, `inlineOffset`, `readContainerBounds`, `fixedLeftForInline` and `normalizeHorizontalKey`, plus `ContainerBounds.rtl`
- `GridIcon`/`defaultPinIcon` and the wrapper `pinIcon` values; `HeaderRendererParams.pinned`/`onPinChange` for custom pin UI
- `GridLabels.pinLeftColumn`/`pinRightColumn`/`unpinColumn`; the default header cycles through pin left, pin right and unpin
- `FillHandlePosition.region` (its `left` is now region-local)
- See [Column pinning](./features/column-pinning.md)

#### Frozen rows (PRD 005)
- `freezeRows: { count, maxCount?, minSuffixHeight? }` on `GridCoreOptions` and as a prop/input of every wrapper: the displayed rows `[0, count)` stay below the header while the rest scroll. Defaults `count 0`, `maxCount 100`, `minSuffixHeight 64`; a value that is not a non-negative safe integer (or a `minSuffixHeight` that is not finite and `>= 0`) throws a `RangeError` naming the field. The option is the initial configuration; the runtime setter below replaces it.
- `GridCore.frozenRows.set(config?)` and `GridCore.frozenRows.freezeThrough(viewIndex)`: `set` replaces the whole configuration, omitted fields taking the option defaults, so the result never depends on earlier calls; `freezeThrough` changes only the count; a value-equal call emits no batch and fires no event
- Reactive `freezeRows` prop/input in all three wrappers (React effect, Vue watcher, Angular effect), applied through the runtime setter so a count change keeps the core and the mounted grid in place — no remount
- `GridCore.frozenRows.get(): FrozenRowsState` (`requestedCount`, `effectiveCount`, `limit: null | "maxCount" | "viewport" | "cache"`) and the `onFrozenRowsChanged(state)` option/prop/output, fired on every published change of the effective count or its limit, never for the core's first resolution and never per scroll
- `GridCoreOptions.labels` (`GridLabelOverrides`), so a core-only consumer can localize the announcement the core formats
- `core.geometry.getRowRegions()`, `getRowClip(viewIndex)`, `getRowScrollRange()`, `hasVerticalScrollRange()` and `getRowScrollEdges(scrollTop, containerHeight)`, plus `GridHit.rowRegion`, the optional `isRowVisible(row, range, frozenCount)` parameter and `SlotData.region`/`loading`. A frozen row never needs vertical movement (`getScrollTarget` omits `scrollTop`), and the block stays part of the row extent, so `SET_CONTENT_SIZE.height` and the capped scroll range are unchanged.
- `SET_ROW_REGIONS` and `SET_ANNOUNCEMENT` with `BatchChangeSetters.setRowRegions`/`setAnnouncement` and the `GridState.rowRegions`/`GridState.announcement` fields (seeded at zero frozen rows)
- The frozen DOM contract: `.gp-grid-frozen-rows` (sticky frozen center cells) and the sibling `.gp-grid-frozen-pins` layer (frozen start/end pins), the static `.gp-grid-row--loading` placeholder for an unavailable frozen row, and the `.gp-grid-visually-hidden` live-region rule
- `FillHandlePosition.rowRegion` and `RowDragState.dropIndicatorRegion`
- Paging: with a positive count a paginated source requests the prefix pages plus the visible suffix blocks, never the pages between them, and keeps the prefix resident across scrolling
- See [Frozen rows](./features/frozen-rows.md)

### Changed

#### GridCore API (1.0)
- **Breaking (0.x → 1.0):** GridCore API grouped into namespaces (`rows`, `cells`, `edit`, `columns`, `frozenRows`, `rowDrag`, `viewport`), typed by the exported `GridRowsApi`, `GridCellsApi`, `GridEditApi`, `GridColumnsApi`, `GridFrozenRowsApi`, `GridRowDragApi` and `GridViewportApi`. No forwarders remain. The root keeps `initialize`, `destroy`, `onBatchInstruction`, `setViewport`, `setDataSource`, `refresh`, `refreshFromTransaction` and the `geometry`, `selection`, `fill`, `input`, `highlight` and `sortFilter` members. `sortFilter.setSort`, `setFilter` and `openFilterPopup` ignore calls while a load is in flight, as the removed root copies did.

| Before | After |
|---|---|
| `getRowCount()` | `rows.getCount()` |
| `getRowId(i)` | `rows.getId(i)` |
| `getRowData(i)` | `rows.getData(i)` |
| `hasRow(i)` | `rows.has(i)` |
| `getViewRow(i)` | `rows.getViewRow(i)` |
| `getRecordById(id)` | `rows.getRecordById(id)` |
| `isWritable()` | `rows.isWritable()` |
| `getSlotGeneration(i)` | `rows.getSlotGeneration(i)` |
| `isSlotGenerationCurrent(i, g)` | `rows.isSlotGenerationCurrent(i, g)` |
| `refreshSlotData()` | `rows.refreshSlotData()` |
| `getCellValue(row, col)` | `cells.getValue(row, col)` |
| `setCellValue(row, col, value)` | `cells.setValue(row, col, value)` |
| `getFieldValue(i, field)` | `cells.getFieldValue(i, field)` |
| `getCellBounds(rowId, columnId, space?)` | `cells.getBounds(rowId, columnId, space?)` |
| `startEdit(row, col)` | `edit.start(row, col)` |
| `updateEditValue(value, editId?)` | `edit.updateValue(value, editId?)` |
| `commitEdit(editId?)` / `cancelEdit(editId?)` | `edit.commit(editId?)` / `edit.cancel(editId?)` |
| `getEditState()` | `edit.getState()` |
| `startPeek` / `stopPeek` / `getPeekState` | `edit.startPeek` / `edit.stopPeek` / `edit.getPeekState` |
| `pasteClipboardText(text)` | `edit.paste(text)` |
| `getColumns()` / `setColumns(columns)` | `columns.get()` / `columns.set(columns)` |
| `setColumnWidth(i, width)` | `columns.setWidth(i, width)` |
| `moveColumn(from, to)` | `columns.move(from, to)` |
| `setColumnPinned(id, pin)` | `columns.setPinned(id, pin)` |
| `getColumnState()` / `setColumnState(u)` / `resetColumnState(ids?)` | `columns.getState()` / `columns.setState(u)` / `columns.resetState(ids?)` |
| `setColumnLayout(mode)` | `columns.setLayout(mode)` |
| `setFreezeRows(config?)` | `frozenRows.set(config?)` |
| `freezeRowsThrough(i)` | `frozenRows.freezeThrough(i)` |
| `getFrozenRows()` | `frozenRows.get()` |
| `commitRowDrag(from, to)` | `rowDrag.commit(from, to)` |
| `isRowDragEntireRow()` | `rowDrag.isEntireRow()` |
| `setSort`, `setFilter`, `getSortModel`, `getFilterModel`, `hasActiveFilter`, `openFilterPopup`, `closeFilterPopup` | same names on `sortFilter` |
| `setScrollTopOverride(top)` | `viewport.setTopOverride(top)` |
| `isScalingActive()` | `viewport.isScaling()` |
| `getScrollRatio()` / `getMaxFlingVelocity()` / `getRowHeight()` | `viewport.getScrollRatio()` / `viewport.getMaxFlingVelocity()` / `viewport.getRowHeight()` |
| `getTotalWidth()` | `geometry.getColumnLayout().totalWidth` |
| `getTotalHeight()` | `geometry.getContentSize().height` (header excluded) |
| `getColumnPositions()` | `geometry.getColumnLayout().columns[i].offset` |
| `getVisibleRowRange()` (inclusive) | `geometry.getVisibleRowWindow()` (half-open) |
| `getHeaderHeight()` | removed; the header height is the `headerHeight` option |

#### Column virtualization and pinning (PRD 004)
- **Breaking (0.x → 1.0):** `lineX` and `dropIndicatorX` on drag state are viewport x; a wrapper no longer subtracts its own `scrollLeft`. Custom adapters render them directly and remain direction-agnostic.
- **Breaking (0.x → 1.0):** `ContainerBounds` now describes the client box (`rect.left + clientLeft`, `clientWidth`, so the scrollbar is excluded on either side) with an inline-start-relative `scrollLeft` (the DOM value negated in RTL) and an optional `rtl`. Build it with `readContainerBounds` instead of hand-assembling the fields.
- **Breaking (0.x → 1.0):** `GridLabels` gained the required fields `pinLeftColumn`, `pinRightColumn` and `unpinColumn`; a full `GridLabels` object literal must include them. `GridLabelOverrides` stays fully optional.
- Wrappers render `state.columnWindow` instead of every `state.layout.columns` entry, and key cells and headers by `columnId`, so a column keeps its DOM node when it changes region.
- A `scrollLeft`-only viewport update performs no row work: no source queries, no slot sync and no batch unless the mounted range moved.
- The column of an open editor stays mounted outside the window until the edit commits or cancels; hiding that column commits the edit first.
- Focus and keyboard navigation step to the next displayed column instead of a hidden one.
- Column-move targets and their drop indicator stay inside the visible viewport; mounted overscan columns become targets only after auto-scroll reveals them.
- Core CSS and wrapper inline styles use logical properties (`inset-inline-start`, `border-inline-end`), and the wrappers read `dir` at mount and on resize — a `dir` flip without a resize needs a remount.
- Headers and cells expose `aria-colindex`, and the grid exposes `role="grid"` with `aria-colcount`/`aria-rowcount`.

#### Frozen rows (PRD 005)
- **Breaking (0.x → 1.0):** `GridLabels` gained the required field `frozenRowsLimited` (default `"{effective} of {requested} rows frozen"`), so a full `GridLabels` object literal must include it. `GridLabelOverrides` stays fully optional: overriding only this label needs only that key.
- Frozen rows render in their own sticky block before the rows wrapper and are published in `state.rowRegions`; a wrapper identifies a frozen slot by `SlotData.region`, never by `rowIndex < frozenCount`.
- A frozen row is always visible for selection and class purposes: `isRowVisible` treats `[0, frozenCount)` as inside any window and its third parameter defaults to `0`, so existing callers keep today's behavior.
- Vertical auto-scroll zones follow the frozen band and the suffix clip on a body-relative pointer y. In flat mode the top zone is 40 px instead of `40 + headerHeight`, because the zone's rectangle already excludes the header.
- An unavailable frozen row renders a cell-less `.gp-grid-row--loading` placeholder instead of triggering the grid-level loading overlay; the overlay still reacts to missing suffix rows only.
- Growing the frozen prefix corrects the scroll position to `max(0, logicalTop − Δ)` in the same batch as the region publication, so the first visible suffix row stays below the bigger block; shrinking is uncorrected and the read-time clamp holds the logical top, uncovering the newly unfrozen rows.
- An open edit whose row changes region is committed by a freeze or unfreeze command (cancelled only when its assignment is already stale), like an edit in a hidden column; a row that stays in its region keeps its editor and draft.

### Removed

#### Frozen rows (PRD 005)
- The React package's unused internal `useAutoScroll` hook — core computes the auto-scroll zones. The exported Vue `useAutoScroll` composable is unchanged.

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
- `GridCore.getRowTranslateY`, `getScrollTopForRow`, `getRowIndexAtDisplayY` — migrate to `core.geometry` (`getRowBounds`, `getScrollTarget`, `hitTest`). `getColumnPositions` and `getVisibleRowRange` are removed too (see the namespace migration below).
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
core.columns.setState([{ columnId: "name", width: 240 }]);
core.columns.getState(); // [{ columnId: "name", width: 240, resolvedWidth: 240, ... }]

// reset removes the override and restores the proportional width
core.columns.resetState(["name"]);
core.columns.getState(); // [{ columnId: "name", resolvedWidth: 317, ... }]
```

Restoring an earlier snapshot after further edits requires a reset first:

```ts
const saved = core.columns.getState();
// ...further edits...
core.columns.resetState();
core.columns.setState(saved); // `resolvedWidth` is output-only and ignored on input
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
core.columns.setState([{ columnId: "name", width: 0 }]);
// [gp-grid] Invalid width for column "name"
```

Pinned columns (PRD 004):

```ts
// declarative definition default
const columns = [{ field: "id", pinned: "start" }, { field: "name" }];

// runtime command; `null` unpins even against a definition default
core.columns.setPinned("name", "end");
core.columns.setPinned("name", null);
core.columns.getState(); // region tells you where it actually rendered

// event on GridCore and every wrapper
new GridCore({ columns, onColumnPinned: ({ columnId, pinned }) => { /* ... */ } });
```

Rendering the mounted window (custom adapters and wrappers):

```ts
// before: every displayed column, positioned by its content offset
for (const column of state.layout.columns) { /* ... */ }

// after: pins plus the bounded center window, each in its own region container
const { start, center, end } = state.columnWindow ?? {};
for (const column of center) {
  cell.style.insetInlineStart = `${column.regionOffset}px`;
}
```

Viewport-space drag overlays and inline-relative input:

```ts
// before: a wrapper converted content x and assembled the bounds by hand
line.style.left = `${dragState.lineX - container.scrollLeft}px`;

// after: `lineX`/`dropIndicatorX` are already viewport x
line.style.left = `${dragState.lineX}px`;

// and its input bounds come from the adapter kit, so RTL is a value, not a branch
import { readContainerBounds, toPointerEventData } from "@gp-grid/core";
core.input.handleDragMove(toPointerEventData(event), readContainerBounds(bodyEl));
```


#### Identity, column state and schema lifecycle (PRD 002)
- `GridCore.columns.setState(updates)`, `columns.resetState(columnIds?)` and `columns.getState()`; an optional controlled `columnState` input on every wrapper
- `GridCore.rows.getViewRow(viewIndex)` and `rows.getRecordById(rowId)` for identity-addressed record access
- `rows.getSlotGeneration`/`rows.isSlotGenerationCurrent` and a monotonically increasing slot assignment `generation`
- Edit session token: `EditState.editId`, `editId` on `START_EDIT`, and an optional `editId` argument on `edit.updateValue`/`edit.commit`/`edit.cancel`; wrapper editor callbacks are tagged automatically, so a callback from a closed editor can no longer act on a newer edit
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
- **Breaking (0.x → 1.0):** `CellValueChangedEvent` gained `columnId`, and `rows.getData` returns the currently resident source record only
- Column definitions are immutable caller input; live width/order/visibility state is keyed by column id in the core, so resize/move never mutate the caller's objects or array
- Replacing `columns` reconciles by id in one instruction batch: retained columns keep user state, sort and filter; removed columns drop their state, headers and caches; the core instance survives
- `ColumnFilterModel` now exposes `groups`; canonical conditions no longer expose `nextOperator`
- Filter popups in React, Vue, and Angular use group cards with separate condition/group operators
- Grid label props use `GridLabelOverrides`, allowing individual nested operator overrides
- `FilterModel` type changed from `Record<string, string>` to `Record<string, ColumnFilterModel>`
- Header rendering now includes sort/filter indicators and icons
- `sortFilter.setFilter()` accepts canonical grouped filters plus legacy flat/string inputs for migration

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
