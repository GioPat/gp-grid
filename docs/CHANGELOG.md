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

#### Row heights (PRD 006)
- `GridCore.rowHeights` (`GridRowHeightsApi`): `set([{ rowId, height }])` stores heights by row identity, `reset(rowIds?)` drops the named ones or all of them, and `getOverrides()` lists every stored height in insertion order, including the ones still waiting for their row. `set` is all or nothing: a `height` that is not finite and `> 0` throws `RangeError('Invalid row height for row "<rowId>": <height>')` and applies nothing. A value equal to `rowHeight` is stored, places nothing and emits nothing, and both commands are no-ops after `destroy()`.
- `RowHeightUpdate` (`{ rowId: RowId, height: number }`), the command and listing payload
- Heights by identity: with `getRowId` (or a columnar source's row access) a height follows its row through sort, filter, refresh, row moves and paging; without a stable identity an integer `rowId` in `[0, rowCount)` places at that view index and is dropped at the next data revision. An ID the source does not hold yet stays pending.
- Scroll anchoring (D5): a height change captures the row at the clip top and restores the scroll position so that row keeps its viewport position, in the same batch as the geometry, the content size and the row sync. A viewport resize, a sort or filter, a data revision and a user scroll keep their own anchoring rules.
- Paging (D7): a height for a row on an unloaded page is stored and pending, and is placed in the batch that carries its arrival — anchoring included — so the visible rows do not move. Eviction never unplaces a height.
- `SlotData.height` on every mounted slot, published in the same `MOVE_SLOT` instruction as `slot.translateY`, so a wrapper sizes a row box from the instruction alone
- `RowDragState.sourceRowHeight`, so a row drag ghost matches the row it started on instead of the configured default
- `SET_CONTENT_SIZE.height` follows the row extent plus the header band, so a height change reaches the scroll range; the compressed last-row stop is preserved
- `GridViewportApi.getTopOverride()`, so a momentum fling notices a scroll correction another actor made while it was in flight and maps its logical position through the current scroll ratio
- `PendingScrollLatch` in the adapter kit: it holds `SCROLL_TO` corrections outside the render state until the wrapper writes them, so batches coalesced into one render cannot drop a correction and taking it costs no extra render. React and Vue use it.
- See [Row heights](./features/row-heights.md)

#### Auto-fit and column groups (PRD 007)
- `rowResize` (default `false`) on `GridCoreOptions` and as a prop/input of every wrapper: the row edge drag and double-click, Alt+ArrowUp/Down and Alt+Shift+Enter. `GridCore.rowHeights.setResizable(enabled)` changes it at runtime without emitting anything and `isResizable()` reads it; the wrappers apply a changed prop through it.
- One-shot fits: `GridCore.rowHeights.fit(rowIds?)` and `GridCore.columns.fit(columnIds?)` return `RowFitResult` / `ColumnFitResult` with a `FitStatus` (`"applied"`, `"unchanged"`, `"unsupported"`, `"stale"`), the fitted entries with their `FitClamp`, and the skipped ids with a reason. Omitted ids mean every mounted row or displayed column. A row fit stores row heights like `rowHeights.set`; a column fit stores pixel overrides in one batch. A fit reads mounted cells only and issues no data request.
- `autoFit: { maxColumnWidth?, minRowHeight?, maxRowHeight? }` (defaults `600`, `rowHeight` and `10 × rowHeight`), creation-only; an invalid value throws `RangeError("Invalid autoFit.<field>: <value>")`
- `MeasurementHost`, `RowMeasurement`, `ColumnMeasurement` and the `measurementHost` option; `createDomMeasurementHost(getRoot)` in the adapter kit. Every wrapper builds one in the browser and renders `data-layout-revision` on its grid root.
- `onRowResized({ rowId, height, viewIndex })` (`RowResizedEvent`) on `GridCore` and every wrapper, once per row a drag, a key or a fit changed; `onColumnResized` also fires for a fit and a key
- Edge handles: a double-click on `.gp-grid-header-resize-handle` fits the column, and while `rowResize` is on every non-editing cell renders `div.gp-grid-row-resize-handle[aria-hidden="true"]` along its bottom edge; `.gp-grid-row-resize-line` previews a row drag. `DragState.rowResize` (`RowResizeDragState`), the `"row-resize"` drag type, `InputHandler.handleRowResizeMouseDown` and `handleResizeDoubleClick(target: ResizeTarget)`, and the adapter's `rowResizePointerDown` and `resizeDoubleClick`.
- Grid shortcuts on the active cell: Alt+ArrowLeft/Right (column width ±8 px), Alt+ArrowUp/Down (row height ±4 px), Alt+Shift+ArrowLeft/Right (move the column within its region), Alt+Enter (fit the column) and Alt+Shift+Enter (fit the row); `KeyEventData.altKey`
- `ColumnState.width` and `ColumnStateUpdate.width` accept `null`, which drops the pixel override
- Nested column groups: `ColumnGroupDefinition` (`groupId`, `headerName?`, `wrapHeaderText?`, `headerRenderer?`, `children`) and `ColumnGroupChild`, the `columnGroups` option/prop/input, and `ColumnGroupHeaderParams` for group renderers. A hierarchy is validated before adoption; a rejection is a `ColumnSchemaError` (`code`, `source`, `id?`, `limit?`, `message`) passed to the new `onColumnSchemaRejected` option/prop/output and announced through the live region.
- `columnGroupLimits: { maxDepth?, maxNodes?, maxFragments? }` (defaults `64`, `100,000`, `100,000`), creation-only; an invalid value throws `RangeError("Invalid columnGroupLimits.<field>: <value>")`
- `GridCore.columns.set(columns, groups?)`, `columns.setGroups(groups)`, `columns.getGroups()` and `columns.getGroup(groupId)`; `createColumnGroupLookup(groups)` resolves group definitions before a core exists
- `ColumnDefinition.wrapHeaderText` and `.gp-grid-header-cell--wrap`; `.gp-grid-header-group` for fragments
- Header bands: the `headerBandHeights` option/prop/input, `GridCore.header` (`GridHeaderApi`: `getBands()`, `setBandHeights(heights)`) and `HeaderBandLayout`; `SET_HEADER_BANDS` (`SetHeaderBandsInstruction`), `GridState.headerBands` and `BatchChangeSetters.setHeaderBands`; `createInitialState` takes `initialHeaderHeight`, `initialHeaderBandHeights` and `initialColumnGroups`. A band change is one anchored batch.
- Header runs and fragments: `HeaderRun`, `HeaderFragment` and `HeaderFragments`, published in `ColumnWindowSnapshot.groups`
- Header layout helpers for adapters: `escapeDomIdPart`, `leafHeaderId`, `fragmentHeaderId`, `leafHeaderBox`, `fragmentHeaderBox` and `resolveHeaderAssociations` (`HeaderAssociationInput`, `HeaderAssociations`, `HeaderBox`)
- Group renderers: React `ReactGroupHeaderRenderer` and `ReactHeaderRendererRegistry`; Vue `VueGroupHeaderRenderer`, `VueHeaderRendererRegistry` and `renderGroupHeader`; Angular `AngularColumnGroupDefinition`, `AngularColumnGroupChild`, `GroupHeaderRendererTemplate` and `HeaderRendererRegistry`
- Grouped header DOM: a `role="rowgroup"` header root with one `role="row"` per band owning its cells through `aria-owns`, fragments with `aria-colspan` and `aria-rowindex`, and leaf headers with `aria-rowspan` and `aria-describedby`; every header cell carries an escaped `id`
- See [Auto-fit and row resize](./features/auto-fit.md) and [Column groups and header bands](./features/column-groups.md)

#### Row grouping (PRD 008)
- `createRowGrouping(config): RowGrouping`, the local grouping engine: ordered `dimensions` (`RowGroupDimension`: `field`, `id?`, `toKey?`), `measures` (`RowGroupMeasure`: `field`, `source?`, `aggregate`), `defaultExpandedDepth` (default `0`, every group collapsed), `grandTotal: "top" | "bottom"` and `initialState`. An invalid configuration throws `RangeError("Invalid rowGrouping.<field>: <value>")`. It groups the complete filtered and sorted result of a source loaded in full, object or columnar, without materializing columnar records.
- The `rowGrouping` option/prop/input, reactive through `GridCore.rowGroups.setGrouping(grouping | null)`, which regroups the resident rows with no query. `groupLabelColumn` and `groupLabelRenderer` are props/inputs of every wrapper.
- `GridCore.rowGroups` (`GridRowGroupsApi`): `isActive()`, `setExpanded(ids | null, expanded)`, `toggle(id)` and `setGrouping`, returning `RowGroupResult` (`"applied"`, `"unchanged"`, `"unsupported"`) and `RowGroupingResult` (plus `{ status: "rejected", rejection }`)
- `onRowGroupToggled({ rowId, expanded })` (`RowGroupToggledEvent`), once per group a pointer or key gesture toggled, and `onRowGroupingRejected(rejection)` (`RowGroupingRejection`: `reason` `"partial-source" | "hierarchical-source" | "unknown-field" | "object-key"`, `field?`) on `GridCore` and every wrapper. A rejected grouping renders the source's rows and warns once per reason.
- Hierarchical row access: `HierarchicalRowAccess<TData>` (`hierarchical: true`, `getRowId`, `getRow`, `getValue`, `locate`, and the optional `setExpanded`, `getRecord` and `recordsChanged`), `HierarchyRow` (`HierarchyRecordRow`, `HierarchyGroupRow`, `HierarchyTotalRow`), `HierarchyRowKind`, `HierarchyRecordChange` and `isHierarchicalRowAccess`. A data source returns one as `DataSourceResponse.access` to supply rows it grouped itself, without the engine.
- Typed keys and ids: `undefined` and `null` share one bucket; strings, numbers and booleans are keyed by type and value, a `Date` by its timestamp, and an object needs `toKey`. A group id is `"gp-group:"` plus the JSON of its path and the total row is `"gp-total"`; labels and formatters never enter an id.
- Group order: a sorted dimension column orders its groups by key, a measure column sorted first orders groups by that aggregate, and keys ascend otherwise. Mixed-type keys and aggregates order by type (number, date, boolean, string, object, null last), then by `compareValues`.
- Aggregates: `"sum"`, `"count"`, `"avg"`, `"min"`, `"max"` (`RowGroupBuiltInAggregate`) and a custom `RowGroupAggregator<S>` (`init`, `add`, `result`, optional `merge`). Every group folds its own leaves and retains its state; `init()` must return a fresh state and `merge(into, from)` must leave `from` intact.
- Expansion state: `RowGrouping.getState(): RowGroupingState` (`expanded`, `collapsed`) and `RowGroupingConfig.initialState`; expansion survives a sort, a filter, a transaction and a refresh by group id
- Group rows as rows of cells: the label column holds `span.gp-grid-group-toggle` and `span.gp-grid-group-label`, aggregates render under their own columns, and the label column is indented by depth on every row. `resolveGroupLabelColumnId`, `formatGroupLabel` and `isEmptyGroupCell` are exported for adapters; `GroupLabelRendererParams` (`row`, `viewIndex`, `label`, `toggle`) and `CellRendererParams.rowKind` type the renderers.
- Input: a pointer down on the expander, a double-click on a group row, and Enter or Space with the active cell on a group row toggle it. `InputHandler.handleGroupToggle(rowIndex, pointerType?)` and the adapter's `groupTogglePointerDown(rowIndex, event)`.
- Writes under a hierarchy: a measure edit refolds the aggregates on its path; a dimension edit regroups, expands the record's new ancestor groups (without `onRowGroupToggled`) and moves the active cell with the record. Paste and fill skip group and total rows.
- `ASSIGN_SLOT.row` and `DATA_LOADED.hierarchical`; the styles `.gp-grid-row--group`, `.gp-grid-row--total`, `.gp-grid-cell--group-label`, `.gp-grid-cell--group-indent`, `.gp-grid-group-toggle` (`--expanded`, `--none`), `.gp-grid-group-label` and the custom properties `--gp-grid-group-depth` and `--gp-grid-group-indent`
- Accessibility: the rows of a hierarchy carry `aria-level` and `data-row-kind`, a group row `aria-expanded`, and every cell of a group or total row `aria-readonly="true"`
- `GridLabelOverrides.rowGroups` (`GridRowGroupLabels`: `label`, default `"{value} ({count})"`, and `grandTotal`, default `"Grand total"`)
- Wrapper renderers: React `ReactGroupLabelRenderer`; Vue `VueGroupLabelRenderer` and `renderGroupLabel`; Angular `GroupLabelRendererTemplate`, `GroupToggleComponent` and `GroupLabelComponent`. Vue's `useGpGrid` takes `rowGrouping`, `onRowGroupToggled` and `onRowGroupingRejected` and returns `handleGroupTogglePointerDown`.
- See [Row grouping and aggregation](./features/row-grouping.md)

#### Scroll motion
- `GridCore.viewport.isScrollMotionActive()` and `interruptScrollMotion()`: whether a touch fling or a wheel glide is still moving the content, and a command that stops it where it is. An adapter registers its motion with `viewport.setScrollMotionHandle(handle)` / `clearScrollMotionHandle(handle)` (`ScrollMotionHandle`: `isActive()`, `interrupt()`); `TouchScrollController` does so on attach and exposes `interrupt()`.
- `InputHandler.handleWheel(deltaY, deltaX, dampening, deltaMode?)` takes the `WheelEvent.deltaMode`: line and page deltas (modes 1 and 2) are converted to pixels (40 and 800 per unit) before dampening

### Changed

#### Typed edit commits
- An editor commit is coerced by the column's `cellDataType`, like paste: `"60000"` on a `number` column stores `60000`. A draft that cannot be converted writes nothing and keeps the previous value; a value a custom `editRenderer` already typed is stored unchanged. This applies to flat grids too.

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

#### Row heights (PRD 006)
- **Breaking (0.x → 1.0):** `MOVE_SLOT` now carries a required `height`, and `SlotData.height` and `SlotState.height` are required fields, so a consumer that builds those objects by hand must set them
- **Breaking (0.x → 1.0):** the Angular `GridBodyComponent` and `GridOverlaysComponent` `rowHeight` inputs are removed; those components are internal and the grid component's own `rowHeight` input is unchanged
- Wrappers no longer write an inline cell height. A cell fills its row through the shipped `.gp-grid-cell { height: 100% }` rule, and the row box keeps an explicit pixel height taken from `slot.height`, so a cell can never disagree with its row.
- A row whose height changes re-publishes one `MOVE_SLOT` per mounted slot, so a wrapper can key off the instruction alone
- Applying a height is an atomic size change: geometry, the content size, the scroll correction and the row sync land in one batch, and an overscan row that is no longer needed is unmounted in the same one
- A data revision re-resolves placements against the new order in one resident-row pass, once per revision rather than per scroll or query

#### Auto-fit and column groups (PRD 007)
- **Breaking (0.x → 1.0):** `GridLabels` gained the required nested field `columnSchemaErrors` (`GridColumnSchemaErrorLabels`: `cycle`, `duplicateGroup`, `repeatedLeaf`, `unknownLeaf`, `missingLeaf`, `multipleParents`, `idCollision`, `malformed` and `limit`, with the tokens `{id}` and `{limit}`), so a full `GridLabels` object literal must include it. `GridLabelOverrides` stays fully optional and merges it one level deep, like `operators`.
- **Breaking (0.x → 1.0):** `columns.set`, `columns.move`, `columns.setPinned`, `columns.setState` and `columns.resetState` return a `ColumnSchemaResult` (`{ status: "applied" | "unchanged" }` or `{ status: "rejected", error }`) instead of `void`, so an object implementing `GridColumnsApi` must return one
- **Breaking (0.x → 1.0):** `@gp-grid/vue` requires Vue `^3.5.0` (npm peer range and JSR import), for `useId`
- **Breaking (0.x → 1.0):** ARIA rows number the header first in every wrapper. The flat header row carries `aria-rowindex="1"` and band `b` carries `b + 1`; a body row's `aria-rowindex` is its view index plus the header row count plus 1, and the root's `aria-rowcount` is the row count plus the header row count.
- A column resize that never moved commits nothing and fires no `onColumnResized`
- The column resize handle carries `aria-hidden="true"` and is a pointer target only
- `DisplayedColumn.headerBand` (a leaf's first band, `0` while flat) and `ColumnLayoutSnapshot.bandCount` (`1` while flat), both part of the snapshot comparison
- `ColumnWindowSnapshot.groups` (`{ start, center, end }`, empty and shared while flat)
- `GridState.headerBands`: the header height is core-owned, and the wrappers render the header, the body sizer, the loading overlay, the drop indicator and the resize line from `headerBands.totalHeight`. `SET_CONTENT_SIZE.height` is the row extent plus that total.
- `DragState.rowResize` is a required field (`null` outside a row drag), so a custom adapter that builds a `DragState` must set it
- While groups are active the depth-first leaf order of the descriptors is the default column order, the order new leaves take on replacement and the order `columns.resetState()` restores
- Every leaf header carries an `id`, and the header cells of a grouped grid are absolutely placed in their region container from the band offsets

#### Row grouping (PRD 008)
- **Breaking (0.x → 1.0):** `GridLabels` gained the required nested field `rowGroups` (`GridRowGroupLabels`: `label` and `grandTotal`), so a full `GridLabels` object literal must include it. `GridLabelOverrides` stays fully optional and merges it one level deep.
- **Breaking (0.x → 1.0):** `ViewRow<TData>` is a union: a record row (`kind: "record"`, `id`, `depth`, `viewIndex`, `record?`) or a group or total row (`HierarchyGroupRow | HierarchyTotalRow` plus `viewIndex`). A flat row is a record row of depth 0, so code that reads `record` must narrow on `kind` first.
- **Breaking (0.x → 1.0):** `GridState.hierarchical` is a required field (`false` while flat), so a consumer that builds a `GridState` by hand must set it
- `CellWriteRejectedEvent.reason` is `"read-only-source" | "not-a-record" | "derived-view"`: a write that targets a group or total row reports `"not-a-record"`, and `rowDrag.commit` under a hierarchy reports `"derived-view"` with `operation: "row-move"`
- `SlotData.row` (`HierarchyRow`) is set on every slot of a hierarchy and absent while flat
- The root is `role="treegrid"` while a hierarchy is bound and `role="grid"` otherwise
- Under a hierarchy `rows.getCount()` counts view rows, `rows.getData(viewIndex)` is `undefined` on a group or total row, and `edit.start` on such a row returns `false`
- A group or total row cell without an aggregate renders empty and calls no cell renderer, and `edit.startPeek` returns `false` on it; an aggregate cell calls the renderer with `rowKind` and no `rowData`
- No row drag starts while a hierarchy is bound
- A transaction refresh under a hierarchy reloads through the full query path and keeps the active record and the scroll anchor by row id

#### Vue rendering
- Scrolling no longer re-renders every mounted row and cell. A cell re-renders when its row is re-assigned (`slot.generation`) or when a batch can change core-backed content; a batch that only places rows and columns leaves it alone. `useGpGrid().renderToken` still bumps once per batch.
- `GpGrid` passes rows a stable `displayedIndexOf` that is rebuilt only when the column layout changes
- A hover change no longer re-renders every cell: the hover position reaches cells and rows through `provide`/`inject`, and their classes are computed, so only the cells whose highlight classes change re-render. Row and cell styles are strings, which Vue writes only when they change.

#### Wheel scrolling on scaled grids
- A dampened wheel delta keeps its fraction: `TouchScrollController.scrollByWheel(domDy)` accumulates it and drives the core through the synthetic scroll override, once per frame, and hands the top back to native scroll 150 ms after the last wheel event. Writing the dampened delta to `scrollTop` directly lost every trackpad delta under 5 px (the DOM rounds each write), so momentum stopped abruptly and speed stepped. All three wrappers use it and fall back to the direct write when no controller is attached.

#### Scroll motion
- A press while a touch fling or a wheel glide is moving the content only stops it: the cell, header, column and row resize handles, the fill handle and the group expander swallow that press, so it selects, sorts, drags and toggles nothing, and the header click and double-click that belong to it are ignored for 500 ms. A touch press leaves the stop to the touch scroller, which carries the fling's velocity into the next flick.
- On a scaled grid a large wheel delta (a mouse notch) glides to its target over a few frames instead of jumping, in one frame under `prefers-reduced-motion`; when the wheel rests the fractional top is kept instead of snapping to the rounded DOM value
- `InputHandler.handleWheel` dampens `dy` only: `dx` is returned undampened, because only the vertical axis is scaled
- **Breaking (0.x → 1.0):** `InputEventAdapter.wheel(event, dampening)` takes the `WheelEvent` instead of `(deltaY, deltaX, dampening)`, so it can read `deltaMode`

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
- Angular refreshes the grid after a `MutableDataSource` transaction (`updateRow`, `addRows`, `removeRows`, `updateCell`), as React and Vue do
- `GpGrid.vue` no longer destroys a caller-provided `dataSource` on unmount or when the prop changes; only a source it built from `rowData` is destroyed. A replaced source's transaction subscription is released.
- Vue's `useGpGrid` destroys its core, and a source it built from `rowData`, on unmount, and applies transactions through `refreshFromTransaction`
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
