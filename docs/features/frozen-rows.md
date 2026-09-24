# Frozen rows

The first `n` displayed rows can stay fixed below the header while every later
row scrolls. The prefix is positional — the displayed indices `[0, count)`,
which never include column header bands — and it persists across sort, filter
and data changes, so "freeze through row 3" keeps meaning the same rows of the
current projection.

`@gp-grid/core` owns the frozen/suffix split, the extents, the effective count
and its limits, the scroll mapping and the paging; a wrapper renders the
published layout and computes nothing.

## Configuration

`freezeRows` is a `GridCore` option and a prop/input of every wrapper.

| Field | Default | Meaning |
|---|---|---|
| `count` | `0` | Requested prefix size: displayed rows `[0, count)`. |
| `maxCount` | `100` | Upper bound applied before the viewport and cache limits. |
| `minSuffixHeight` | `64` | CSS px of suffix viewport kept below the prefix, so freezing never fills the body. |

```ts
const core = new GridCore({
  columns,
  dataSource,
  rowHeight: 32,
  freezeRows: { count: 3, maxCount: 100, minSuffixHeight: 64 },
});
```

`count` and `maxCount` must be non-negative safe integers (a missing `count`
fails too) and `minSuffixHeight` must be finite and `>= 0`; anything else
throws `RangeError("Invalid freezeRows.<field>: <value>")`. A `freezeRows`
value that is present but not an object (including `null`) throws
`RangeError("Invalid freezeRows: <value>")`. An absent option behaves exactly
like `{ count: 0 }`: no frozen container, no extra instruction and the flat DOM
and geometry unchanged.

`count` is a request, not a promise — see the next section for what actually
happens. Freezing every row is a valid outcome: the block then needs no suffix
and ignores `minSuffixHeight`.

`freezeRows` is the initial configuration. It can be replaced after mount with
[`frozenRows.set`](#runtime-changes) — that is how a wrapper applies a changed
prop or input — and a value-equal call emits nothing.

## Effective count and limits

`GridCore.frozenRows.get()` answers `FrozenRowsState` and is readable before
`initialize()`:

| Field | Contents |
|---|---|
| `requestedCount` | The configured `count`. |
| `effectiveCount` | How many rows are actually frozen, `0 .. requestedCount`. |
| `limit` | The constraint that last reduced the count: `null`, `"maxCount"`, `"viewport"` or `"cache"`. |

Resolution order:

1. Start at `min(count, rowCount)`. A row-count shortfall is not a limit, and
   neither is a zero request or an empty data set — both answer `0` with
   `limit: null`.
2. Apply `maxCount`.
3. Apply the viewport constraint to a positive candidate:
   `frozenExtent(n) + minSuffixHeight <= viewportHeight` (the all-rows candidate
   needs no suffix and is tested on its own). Extents come from the row axis,
   not from `n × rowHeight`. While the body is unmeasured the core uses its
   600 px estimate, the same value paging uses; the first measurement
   recomputes and only then may fire `onFrozenRowsChanged`.
4. For paginated sources, apply the cache constraint: the largest count no
   greater than the viewport-admitted one that also fits the page budget. If no
   positive count fits, the result is `0` with `limit: "cache"` — the cache
   never errors, and the suffix keeps the flat paging policy.

`limit` names the last constraint that reduced the count, so a viewport-limited
count reports `"viewport"` even when `maxCount` also applied. The result is a
pure function of the current inputs: it is kept, not re-derived per frame, and
recomputed after row-count, size, viewport or cache-configuration changes — a
plain scroll never changes it.

## Changes and the live announcement

`onFrozenRowsChanged(state)` is a `GridCore` option and a prop of every
wrapper.

- The core's first resolution is the baseline and never fires. That baseline is
  taken over the empty axis, so with a client source the first batch that knows
  the row count publishes `effectiveCount: n` and fires exactly once with
  `limit: null`; with a paginated source the prefix arrives with its first page
  and fires the same `0 → n` transition once.
- Every later published change of `effectiveCount` **or** `limit` fires,
  including `limit` returning to `null` when a constraint stops applying. A
  layout change that leaves both fields equal is silent, so scrolling and
  resize do not spam the callback.

`GridLabels.frozenRowsLimited` is the label behind the accessible
announcement. It is a required key with the default
`"{effective} of {requested} rows frozen"` and the tokens `{effective}` and
`{requested}`; `GridLabelOverrides` stays fully optional, so overriding one
label needs only that key. The core formats the text and publishes it with
`SET_ANNOUNCEMENT` on every `limit` change — including the return to `null` —
in the same batch as the region layout. Each wrapper renders one visually
hidden `role="status" aria-live="polite"` region backed by the core's
`:where(.gp-grid-visually-hidden)` rule, keyed by the announcement revision so
each message is read once.

## Paging

With a positive requested count a paginated source requests the union of the
prefix pages and the blocks under the visible suffix, never the pages in
between, and keeps the prefix resident while the suffix scrolls. A frozen row
missing from the cache renders a placeholder — the suffix's grid-level loading
overlay is not shown for it. When the page budget cannot admit any positive
prefix, `limit` is `"cache"`, `effectiveCount` is `0` and the grid renders the
full suffix as a flat grid.

## Geometry and DOM contract

`core.geometry` exposes the region queries:

| Query | Result |
|---|---|
| `getRowRegions()` | `RowRegionLayout`: `frozenCount`, `frozenExtent`, `suffixViewportHeight`, `frozen`. Never `null`, reused while unchanged. |
| `getRowClip(viewIndex)` | Viewport y-range the row renders in: `[0, frozenExtent)` for a frozen row, `[frozenExtent, viewportHeight)` for a suffix row. `undefined` outside the axis. |
| `getRowScrollRange()` / `hasVerticalScrollRange()` | The reachable logical (content) scroll range of the row axis. |
| `getRowScrollEdges(scrollTop, containerHeight)` | The auto-scroll rectangle and its two vertical step limits. |
| `hitTest(point).rowRegion` | `"frozen"`, `"suffix"` or `null` for the `-1`/`count` sentinels; `region` stays the column field. |

A frozen row never needs vertical movement, so `getScrollTarget` omits
`scrollTop` for it. The public helper `isRowVisible(row, range, frozenCount = 0)`
treats `[0, frozenCount)` as visible for any range. `SlotData.region` says which
container a slot belongs to, and `SlotData.loading` marks an unavailable frozen
row (a suffix slot is never `loading`).

The rendered contract has two layers inside the existing sizer, before the rows
wrapper, and both render only while `effectiveCount > 0`:

- `.gp-grid-frozen-rows` is a sticky block at the sizer level with height
  `frozenExtent`. It holds the frozen **center** cells on the 0-based local row
  grid, so they scroll horizontally with the rest of the center region.
- `.gp-grid-frozen-pins` is a sibling sticky layer above the block holding one
  `.gp-grid-frozen-pin-row` per frozen row, with the frozen **start** and
  **end** pinned cells. The pins stick on the inline axis because the layer is
  at the sizer level; a pin inside the horizontally scrolling block would ride
  its content box out of the viewport. Every logical cell still has exactly one
  element: center columns in the block, pinned columns in the layer.

The pin layer is `role="presentation"` and its cells keep `role="gridcell"` and
`aria-colindex`, so each frozen `aria-rowindex` appears on exactly one
`role="row"` (the block's). That split is qualified by ARIA parity with the
suffix rows' shipped pattern — the same presentational wrappers around
`role="gridcell"` cells — so it adds no semantic divergence; the screen-reader
pass over that shared pin-container pattern stays with PRD 011.

An unavailable frozen row renders one `.gp-grid-row.gp-grid-row--loading` box
with the row's geometry, `role="row"` and `aria-rowindex` but **no cells**, so a
custom cell renderer never receives a missing row. Core CSS gives it a static
`--gp-grid-bg-alt` background with no animation, and it gets no pin row. The
rows wrapper, sizer and header are unchanged, and `SET_CONTENT_SIZE.height`
still describes the row extent — the block is part of it, not an addition.

Overlays follow the row they target: `FillHandlePosition.rowRegion` and
`RowDragState.dropIndicatorRegion` are both a `RowRegion`, and a frozen drop
position renders at the frozen band's bottom edge inside the frozen container.

## Wrapper surface

| | Core | React | Vue | Angular |
|---|---|---|---|---|
| Option | `freezeRows` | `freezeRows` prop | `freezeRows` prop | `freezeRows` input |
| Runtime change | `core.frozenRows.set(config)`, `core.frozenRows.freezeThrough(i)` | `freezeRows` prop | `freezeRows` prop | `freezeRows` input |
| Change event | `onFrozenRowsChanged` option | `onFrozenRowsChanged` prop | `onFrozenRowsChanged` prop | `(onFrozenRowsChanged)` output |
| Query | `core.frozenRows.get()` | `gridRef.current.core` | template ref `.core` | component `.core` |
| Labels | `labels` option | `labels` prop | `labels` prop | `labels` input |

A custom adapter renders `state.rowRegions` and `state.announcement` and reads
the rest from `core.geometry` (see [Column layout and geometry](./column-layout.md)
for the coordinate spaces).

## Runtime changes

`core.frozenRows.set(config?)` replaces the whole configuration and re-resolves
the prefix. Omitted `maxCount` and `minSuffixHeight` take the option defaults,
so `{ count: 5 }` always means the same thing regardless of earlier calls, and
`undefined` unfreezes. A call whose request equals the current
one — a fresh object with equal fields included — emits no batch and fires no
event, which is what lets a wrapper call it on every prop identity change.

`core.frozenRows.freezeThrough(viewIndex)` is the same command with
`count = viewIndex + 1` over the current configuration, so limits survive; `-1`
unfreezes and a fractional index throws the option's `RangeError`. The requested
count survives sort, filter and data-source changes, like the option.

Growing the block keeps the suffix anchored: with `L` the logical top and `Δ`
the extent delta, the same batch carries `SCROLL_TO` `newTop = max(0, L − Δ)`,
so the first visible suffix row stays visible below the bigger block and no
suffix content offset moves. Shrinking is deliberately uncorrected: the
reachable maximum does not depend on the frozen extent, so the read-time clamp
holds `L` and the block uncovers the rows beneath it. The active cell and the
selection are positional and stay untouched.

An open edit whose row changes region is committed before the new layout
publishes (cancelled only when its assignment is already stale), exactly as
hiding a column commits its editor; a row that stays in its region keeps its
editor and draft.

React applies a changed `freezeRows` prop with an effect, Vue with a watcher and
Angular with an effect over its input. None of them joins the core-recreation
dependencies, so the count changes in place — no remount, no new core and no
scroll reset. `labels` stays creation-only: `ViewSync` builds its label
formatting once, so changing the localized wording still needs a new grid.
