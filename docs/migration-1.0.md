# Migrating from 0.23.x to 1.0

Every change a 0.23.x application meets, by area, with the reason in a line and before/after code. Where the three wrappers differ the snippet is per framework; where they do not, one snippet covers all of them. The additions of 1.0 (pinning, frozen rows, row heights, auto-fit, column groups, row grouping, server grouping, pivot, write history, transaction refresh) are not listed here; see the [feature docs](./README.md#features). The snippets type-check against the built packages in `benchmarks/consumers/migration-guide.tsx`.

## 1. Packages and entries

- `@gp-grid/vue` requires Vue `^3.5.0` (it uses `useId`). React `^18 || ^19` and Angular `>=18` are unchanged.
- Each package has one entry and one stylesheet (`@gp-grid/<pkg>/dist/styles.css`); there are no subpath entries.
- The Vue and Angular entries no longer export their internals. Removed from `@gp-grid/vue`: `useInputHandler`, `useAutoScroll`, `useFillHandle`, `useFilterPopup`, `useFilterConditions`, `useGridState`, `createInitialState`, `renderCell`, `renderEditCell`, `renderHeader`, `getCellValue`, their option and result types, and the re-exported core helpers `buildCellClasses`, `isCellActive`, `isCellEditing`, `isCellInFillPreview`, `isCellSelected`, `calculateColumnPositions`, `findColumnAtX`, `getTotalWidth`, `isRowVisible`, `FilterPopupState`, `HeaderData`, `PointerEventData`, `SelectionState`. The helpers are still exported by `@gp-grid/core`; the composables and render functions were the component's own plumbing. Removed from `@gp-grid/angular`: `GridHeaderComponent`, `GridBodyComponent`, `GridOverlaysComponent`, `FilterPopupComponent`, `CellPeekComponent`, `ResizeHandleComponent`, their pointer and sort event types, `ActiveFilterPopup`, `EditingCellState`, `ResizeAxis`, `RowClassFn` and `CellClassFn`. `GpGridComponent` renders them; the public pieces for custom renderers (`GroupLabelComponent`, `GroupToggleComponent`, the template and registry types) stay.
- Removed from `@gp-grid/core`: `isSameDay` and `rawValueKey` (internal to filter evaluation). The filter helpers an application may use (`rowPassesFilter`, `evaluateColumnFilter`, the condition evaluators) stay and are [documented](../packages/core/README.md#filter-evaluation-helpers).

```ts
// before
import { isCellSelected } from "@gp-grid/vue";
// after
import { isCellSelected } from "@gp-grid/core";
```

## 2. GridCore namespaces

The root of `GridCore` keeps lifecycle and loading only: `initialize`, `destroy`, `onBatchInstruction`, `setViewport`, `setDataSource`, `refresh`, `refreshFromTransaction`, plus the `geometry`, `selection`, `fill`, `input`, `highlight` and `sortFilter` members. Everything else moved into a namespace, with no forwarders. The same object is what a wrapper ref exposes as `core`.

```ts
// before
core.getRowCount(); core.setCellValue(row, col, value); core.startEdit(row, col);
// after
core.rows.getCount(); core.cells.setValue(row, col, value); core.edit.start(row, col);
```

| Before | After |
|---|---|
| `getRowCount()` | `rows.getCount()` |
| `getRowId(i)` | `rows.getId(i)` |
| `getRowData(i)` | `rows.getData(i)` |
| `hasRow(i)` | `rows.has(i)` |
| `getViewRow(i)` | `rows.getViewRow(i)` |
| `getRecordById(id)` | `rows.getRecordById(id)` |
| `isWritable()` | `rows.isWritable()` |
| `getSlotGeneration(i)` / `isSlotGenerationCurrent(i, g)` / `refreshSlotData()` | the same names on `rows` |
| `getCellValue(row, col)` | `cells.getValue(row, col)` |
| `setCellValue(row, col, value)` | `cells.setValue(row, col, value)` |
| `getFieldValue(i, field)` | `cells.getFieldValue(i, field)` |
| `getCellBounds(rowId, columnId, space?)` | `cells.getBounds(rowId, columnId, space?)` |
| `startEdit` / `updateEditValue` / `commitEdit` / `cancelEdit` / `getEditState` | `edit.start` / `edit.updateValue` / `edit.commit` / `edit.cancel` / `edit.getState` |
| `startPeek` / `stopPeek` / `getPeekState` | the same names on `edit` |
| `pasteClipboardText(text)` | `edit.paste(text)` |
| `getColumns()` / `setColumns(columns)` | `columns.get()` / `columns.set(columns)` |
| `setColumnWidth(i, width)` / `moveColumn(from, to)` / `setColumnPinned(id, pin)` | `columns.setWidth` / `columns.move` / `columns.setPinned` |
| `getColumnState()` / `setColumnState(u)` / `resetColumnState(ids?)` | `columns.getState()` / `columns.setState(u)` / `columns.resetState(ids?)` |
| `setColumnLayout(mode)` | `columns.setLayout(mode)` |
| `setFreezeRows(config?)` / `freezeRowsThrough(i)` / `getFrozenRows()` | `frozenRows.set` / `frozenRows.freezeThrough` / `frozenRows.get` |
| `commitRowDrag(from, to)` / `isRowDragEntireRow()` | `rowDrag.commit` / `rowDrag.isEntireRow` |
| `setSort`, `setFilter`, `getSortModel`, `getFilterModel`, `hasActiveFilter`, `openFilterPopup`, `closeFilterPopup` | the same names on `sortFilter` |
| `setScrollTopOverride(top)` / `isScalingActive()` | `viewport.setTopOverride` / `viewport.isScaling` |
| `getScrollRatio()` / `getMaxFlingVelocity()` / `getRowHeight()` | the same names on `viewport` |
| `getTotalWidth()` | `geometry.getColumnLayout().totalWidth` |
| `getTotalHeight()` | `geometry.getContentSize().height` (header excluded) |
| `getColumnPositions()` | `geometry.getColumnLayout().columns[i].offset` |
| `getVisibleRowRange()` (inclusive) | `geometry.getVisibleRowWindow()` (half-open) |
| `getHeaderHeight()` | removed; the header height is the `headerHeight` option |

`sortFilter.setSort`, `setFilter` and `openFilterPopup` ignore calls while a load is in flight, as the removed root copies did.

## 3. Column definitions and column state

Definitions are immutable input. A resize, a move, a hide or a pin never mutates the caller's objects; the live width, order, visibility and pin per column live in the core, keyed by column id (`colId ?? field`), and come back through `columns.getState()`.

```ts
// before: the grid mutated the caller's definition
columns[2].width = newWidth;
// after: an override by id, reset to return to the definition
core.columns.setState([{ columnId: "city", width: 240 }]);
core.columns.resetState(["city"]);
core.columns.getState(); // [{ columnId: "city", resolvedWidth: 317, ... }]
```

- Every wrapper takes an optional controlled `columnState` input with the same shape (`columnState={[{ columnId: "city", width: 240 }]}` in React, `:column-state` in Vue, `[columnState]` in Angular); `hidden` and `pinned` follow the same shape.
- Replacing `columns` reconciles by id in one batch and keeps the core instance: retained columns keep their user state, sort and filter; removed ones drop theirs. A definition `width` or `hidden` change applies only while the column has no user override for that property.
- `columns.set`, `columns.move`, `columns.setPinned`, `columns.setState` and `columns.resetState` return a `ColumnSchemaResult` (`{ status: "applied" | "unchanged" }` or `{ status: "rejected", error }`) instead of `void`; an object implementing `GridColumnsApi` must return one.
- `ColumnStateSnapshot.width` is present only while an explicit pixel override exists; `resolvedWidth` is the displayed width (`0` while hidden) and is output-only. Restoring a saved snapshot after further edits needs `resetState()` first.
- A declared or overridden width that is not positive and finite falls back to 50 px and warns once per column id.

## 4. Events carry identity

Column and row interaction events are objects with the column or row id and named view indices, in every wrapper. There is no compatibility adapter.

```tsx
// React, before
<Grid onColumnResized={(colIndex, newWidth) => persist(colIndex, newWidth)}
      onColumnMoved={(from, to) => persistOrder(from, to)}
      onRowDragEnd={(src, tgt) => persistRows(src, tgt)} />
// React, after
<Grid onColumnResized={({ columnId, width, viewIndex }) => persist(columnId, width, viewIndex)}
      onColumnMoved={({ columnId, fromViewIndex, toViewIndex }) => persistOrder(columnId, fromViewIndex, toViewIndex)}
      onRowDragEnd={({ rowId, fromViewIndex, toViewIndex }) => persistRows(rowId, fromViewIndex, toViewIndex)} />
```

```vue
<!-- Vue, after; the props are the same names in kebab case -->
<GpGrid :on-column-resized="({ columnId, width, viewIndex }) => persist(columnId, width, viewIndex)" />
```

```ts
// Angular, before: { colIndex, newWidth }, { fromIndex, toIndex }, { source, target }
// Angular, after
onResized(event: ColumnResizedEvent) { persist(event.columnId, event.width, event.viewIndex); }
```

- `onColumnResized.width` is the stored override (and, for a displayed column, its measured width); a resize that never moved commits nothing and fires nothing.
- `CellValueChangedEvent` gained `columnId`.
- `rows.getData(i)` returns the resident source record only; use `rows.getRecordById(id)` for identity-addressed access.
- Edit callbacks carry an `editId`; a callback from a closed editor can no longer act on a newer edit.

## 5. Indices, counts and ARIA rows

- Row and column windows use exclusive end indices: `geometry.getVisibleRowWindow()` replaces the inclusive `getVisibleRowRange()`.
- ARIA rows number the header first in every wrapper: the flat header row is `aria-rowindex="1"`, band `b` is `b + 1`, a body row is its view index plus the header row count plus 1, and `aria-rowcount` includes the header rows. Headers and cells carry `aria-colindex`; the root carries `role="grid"` with `aria-colcount` and `aria-rowcount`, and `role="treegrid"` while a hierarchy is bound.
- Under a hierarchy `rows.getCount()` counts view rows (groups and totals included).

## 6. Geometry is core-owned

Widths, offsets, row bounds and hit testing are resolved once in core and published; a wrapper or custom adapter renders what it is given and never recomputes.

Removed: `calculateScaledColumnPositions`, `ColumnScrollGeometry`, `VisibleColumnInfo`, `InputHandlerDeps`, `InputHandler.updateDeps`, `GridCore.getRowTranslateY`, `getScrollTopForRow`, `getRowIndexAtDisplayY`, `getColumnPositions`, `getVisibleRowRange`, `computeStoredWidthForDisplayed`.

```ts
// before
const { positions, widths } = calculateScaledColumnPositions(columns, viewportWidth);
core.input.updateDeps({ getColumnPositions: () => positions });
// after: render the published layout, query the geometry
for (const column of state.layout.columns) {
  cell.style.insetInlineStart = `${column.offset}px`;
  cell.style.width = `${column.width}px`;
}
core.geometry.getCellBounds(rowIndex, layoutIndex, "viewport");
core.geometry.hitTest({ x, y });
core.geometry.getScrollTarget(row, col);
```

- `columnLayout: "fit" | "fixed"` selects the width mode (`fit` is still the default and expands proportionally, never shrinks); `columns.setLayout(mode)` changes it at runtime.
- An explicit `columnState` or `columnLayout` input seeds the first render, so the server render and the first client frame agree. The unmeasured viewport width is `0` until a wrapper reports one.
- A custom adapter renders `state.columnWindow` (`start`, `center`, `end`, each in its own region container, positioned by `regionOffset`) instead of every `state.layout.columns` entry, and keys cells and headers by `columnId`.
- `DragState.lineX` and `dropIndicatorX` are viewport x; an adapter no longer subtracts `scrollLeft`.
- `ContainerBounds` describes the client box with an inline-start-relative `scrollLeft` and an optional `rtl`; build it with `readContainerBounds(element)`.
- `InputEventAdapter.wheel(event, dampening)` takes the `WheelEvent`; `DragState.rowResize` is required (`null` outside a row drag).

```ts
import { readContainerBounds, toPointerEventData } from "@gp-grid/core";
core.input.handleDragMove(toPointerEventData(event), readContainerBounds(bodyElement));
```

## 7. Row sizing

- `MOVE_SLOT` carries a required `height`; `SlotData.height` and `SlotState.height` are required. A consumer that builds those objects by hand sets them.
- Wrappers write no inline cell height: a cell fills its row through the shipped `.gp-grid-cell { height: 100% }` rule and the row box keeps the pixel height of `slot.height`. A custom stylesheet that sized cells itself can drop that.
- A row's height is set by the application (`core.rowHeights`), by a row resize or by a one-shot fit; the grid never sizes a row from its content.

## 8. Frozen rows and the header

- `frozenRows.set({ count })` freezes the first displayed rows under the fixed header; `frozenRows.get()` reports the effective count. The header never scrolls.
- Frozen rows render in their own block and are published in `state.rowRegions`; a custom adapter identifies a frozen slot by `SlotData.region`, never by `rowIndex < frozenCount`.
- `isRowVisible(row, range, frozenCount = 0)` treats the frozen prefix as always visible; existing two-argument callers keep their behavior.

## 9. Labels

`GridLabels` gained required fields: `pinLeftColumn`, `pinRightColumn`, `unpinColumn`, `frozenRowsLimited`, `columnSchemaErrors` (`GridColumnSchemaErrorLabels`) and `rowGroups` (`GridRowGroupLabels`, with `loadFailed`). A full `GridLabels` literal must include them. `GridLabelOverrides` stays partial and merges the nested objects one level deep, so an application that overrides a few labels changes nothing.

```ts
// a partial override is unchanged
const labels: GridLabelOverrides = { rowGroups: { grandTotal: "Totale" } };
```

## 10. Hierarchies, groups and pivots

- `ViewRow<TData>` is a union: a record row (`kind: "record"`, `id`, `depth`, `viewIndex`, `record?`) or a group or total row. A flat row is a record row of depth 0; narrow on `kind` before reading `record`.
- `GridState.hierarchical` is required (`false` while flat) for a consumer that builds a `GridState` by hand.
- Group and total rows are read-only: `rows.getData` is `undefined` on them, `edit.start` returns `false`, a paste or fill over them reports `CellWriteRejectedEvent.reason: "not-a-record"`, and `rowDrag.commit` under a hierarchy reports `"derived-view"`. No row drag starts while a hierarchy is bound.

```ts
const row = core.rows.getViewRow(i);
if (row?.kind === "record") use(row.record);
```

## 11. Writes, editor commits and history

- An editor commit is coerced by the column's `cellDataType`, like a paste: `"60000"` on a number column stores `60000`; a draft that cannot be converted writes nothing and reports `onWriteRejected` with `reason: "type-mismatch"`, `operation: "edit"`. A 0.x grid stored the draft string.
- A paste reports the targets it skipped (`skipped`, `reason: "not-editable"`) through `onWriteCommitted`, one event per edit, paste, fill or `cells.setValue`; undo and redo are opt-in through `history: { maxEntries }`.
- A columnar source stays read-only: every write is refused and reported with `reason: "read-only-source"`.

## 12. Transactions and refresh

`refreshFromTransaction(result?)` takes the transaction result the mutable source reports. A batch made only of updates redraws the rows that changed without a query, so a row whose sorted or filtered field changed keeps its place until the next query; call `refresh()` to re-sort now. Adds, removes and `clear()` reload as before. The wrappers pass the result themselves.

```ts
source.updateCell(id, "amount", 99);
await source.flushTransactions();
await core.refresh(); // only if the row must move to its sorted place at once
```

## 13. Filters

The grouped filter model (`groups`, one level of `combination`) is unchanged from 0.23. The flat 0.x shape (`conditions` with `nextOperator`) is still accepted by `sortFilter.setFilter` and `evaluateColumnFilter` and normalized on entry; `sortFilter.getFilterModel()` and `DataSourceRequest.filter` always return the grouped shape. `normalizeColumnFilterModel(legacy)` converts a stored filter explicitly.

## 14. Server rendering

Import and construction touch no browser global. Pass the initial sizes the wrapper documents (`initialWidth`/`initialHeight` in Vue, the equivalent inputs elsewhere) so the server render is not 0×0; the configured `headerHeight` and band heights are the server sizes, and client measurements refine them after mount.

## 15. Browsers and keyboard

The conformance suite runs on Chrome in CI for React, Vue and Angular, and once on Firefox and WebKit for each release. For 1.0, Firefox 144 and WebKit 26 pass the same cases as Chrome; the differences are in the harness, not the grid: a programmatic scroll on a compressed grid lands within 4 px on those two engines instead of 2, and WebKit lays out its classic 8 px scrollbars where headless Chrome hides them, which the measurement cases assume. Every documented key works in 1.0: the Alt family for column and row resize, move and fit, Enter, F2, Escape and Tab in a cell, Delete, Ctrl+Z, Ctrl+Y, Ctrl+A, Ctrl+C, Shift+arrows, and Enter or Space on a group row. Sort, the filter popup and pin have no keyboard equivalent in 1.0: they are the header's pointer targets. Header focus in the WAI-ARIA grid shape is a feature after 1.0.
