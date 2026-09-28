# Row heights

Rows are `rowHeight` pixels tall by default. An application can give a row a
height of its own, addressed by row identity, so the row keeps that height
wherever it moves.

`@gp-grid/core` owns the heights, the axis they feed, the scroll correction a
change implies and the placement that survives sort, filter and paging; a
wrapper renders `SlotData.height` and computes nothing. The command surface is
state only — this feature has no resize gesture (that is PRD 007).

## Default height

`rowHeight` (CSS px, finite and `> 0`) is the creation-time height of every row,
and the default of `headerHeight`. It is also the size a row falls back to when
its override is dropped, so changing `rowHeight` moves every row that has no
height of its own.

```ts
const core = new GridCore({
  columns,
  dataSource,          // with getRowId
  rowHeight: 32,
  headerHeight: 36,
  getRowId: (row) => row.id,
});
```

## Setting heights

`GridCore.rowHeights` is the command surface, reachable from every wrapper's
core handle:

| Command | Effect |
|---|---|
| `set(updates)` | Store `{ rowId, height }` pairs and place the ones the source holds. Later entries win over earlier ones for the same `rowId`. |
| `reset(rowIds?)` | Drop the named heights, or every height when `rowIds` is omitted. |
| `getOverrides()` | Every stored height in insertion order, including the ones still waiting for their row, so an application can persist and restore them. |

```tsx
// React
gridRef.current?.core.rowHeights.set([{ rowId: 2, height: 96 }]);
gridRef.current?.core.rowHeights.reset([2]);
```

```ts
// Vue — the exposed core
gridRef.value?.core.rowHeights.set([{ rowId: 2, height: 96 }]);
```

```ts
// Angular — the exposed core
grid.core.rowHeights.set([{ rowId: 2, height: 96 }]);
```

Every `height` must be finite and `> 0`; `set` is all or nothing, so a single
invalid entry throws
`RangeError('Invalid row height for row "<rowId>": <height>')` and applies
nothing. A value equal to `rowHeight` is stored and listed, but it places
nothing and emits no instruction. `set` and `reset` are no-ops after
`destroy()`, and `getOverrides()` is then empty.

## Identity

A `rowId` is the stable identity the grid already uses: the value of `getRowId`,
or the identity a columnar source publishes through its row access.

- **With stable identity** the height follows the row through sort, filter,
  refresh and pagination, because placement is resolved again against the new
  order. An ID the source does not hold yet stays pending.
- **Without stable identity** an integer `rowId` in `[0, rowCount)` places at
  that view index, and the placement is revision-scoped: the next data revision
  — a sort, a filter, a refresh, a transaction, a paginated cache reset, a
  data-source swap or a row move — drops it. Use `getRowId` if a height must
  outlive one.

Nothing is inferred: an override sets a height, never measures one, and a row
without an override is exactly `rowHeight` tall.

## Scrolling and anchoring

Applying a height is a size change, and a size change moves the rows below it.
The grid keeps the viewport still instead of letting the content jump:

1. Before the change it captures the row at the clip top, with the offset from
   that row's edge to the clip (`clipTop = logicalTop + frozenExtent`).
2. It applies the geometry, then restores the scroll position so that row keeps
   its viewport position, clamped to its own new height when the row itself is
   the anchor.

That correction runs in the same instruction batch as the geometry, the content
size and the row sync, so a consumer never observes the intermediate state. It
applies to `set`, to `reset` and to a height placed when its page arrives. It
does **not** apply to a viewport resize, to a sort or filter, to a data revision
or to a user scroll — those keep their own anchoring rules.

A data revision re-resolves every placed height against the new order. That pass
reads the resident rows, so it costs O(resident) once per revision rather than
per scroll or per query; a paginated source only holds a few pages, while a
consumer that keeps a million object rows resident and sets heights pays it on
each sort or refresh.

Under scroll compression the axis extent can exceed the DOM's usable scroll
height. The last row is then reached by the scroll range the grid publishes, and
the mapping is proportional: at extreme compression (10,000,000 rows, for
example) a single 32 px row is finer than the DOM's granularity, so programmatic
or keyboard navigation is the reliable way to reach it.

## Paging

A height whose row is not loaded is stored and pending, not lost. When the page
holding that row arrives, the grid places it in the same batch as the arrival —
including the anchoring above — so the visible rows do not move. Eviction never
unplaces a height: a row that scrolls out of the cache keeps its height, and the
placement is re-resolved from the resident rows when it comes back.

## Frozen rows

Frozen rows take part in the same axis, so their heights add to the frozen band
extent and to the suffix's offset below it. Growing a frozen row grows the band;
the first suffix row keeps its *offset below the band*, which means its viewport
top legitimately moves by the band's growth while its content offset is
unchanged. The layout a wrapper reads is `state.rowRegions.frozenExtent`.

## Geometry and DOM contract

The core publishes the height with the row it belongs to:

| Surface | Contents |
|---|---|
| `SlotData.height` | Height of that mounted row, in CSS px. It changes in the same `MOVE_SLOT` instruction as `slot.translateY`. |
| `core.geometry.getRowBounds(viewIndex, space)` | `{ start, end }` in the named space; `end - start` is the row's height. |
| `core.geometry.getContentSize().height` | Row extent alone. The `SET_CONTENT_SIZE.height` instruction carries the header band as well. |
| `RowDragState.sourceRowHeight` | Height of the row a row drag started on, for the drag ghost. |

A wrapper renders each row box with `slot.height` and leaves the cells without
an inline height: `.gp-grid-cell { height: 100% }` in the shipped stylesheet
fills the row, so a cell can never disagree with the box that holds it. A row
whose height changes re-publishes one `MOVE_SLOT` per mounted slot and nothing
else.

## Limits

- Commands are O(K) in the number of overrides: storage, placement and the axis
  input are all sized by the overrides, never by the row count. A height update
  over 10,000 overrides and 10,000,000 rows stays under a millisecond, and every
  axis lookup stays under a microsecond.
- Nothing is measured or inferred. Auto height and auto fit are PRD 007.
- Re-resolving placements after a data revision is O(resident rows), once per
  revision (see [Scrolling and anchoring](#scrolling-and-anchoring)).
- Compression trades precision for reach: a row can be finer than the DOM's
  scroll granularity at extreme row counts.
