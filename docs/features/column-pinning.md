# Column pinning and the column window

Columns can be pinned to the inline start or end edge, where they stay visible
while the center columns scroll. Rows and the header mount the admitted pins
plus a bounded window of center columns instead of every displayed column, so
a grid keeps a flat cost while its column count grows to the thousands.

`@gp-grid/core` owns the pins, the region layout, the window and every x
mapping. A wrapper renders the published window and normalizes the inline axis
at its own DOM boundary; framework code never recomputes a region or a window.

## Pin state

`ColumnPin` is `"start"` or `"end"`.

| Where | Meaning |
|---|---|
| `ColumnDefinition.pinned` | Definition default. `undefined` leaves the column in the scrolling center. |
| `ColumnStateUpdate.pinned` | A command. `"start"`/`"end"` set the request, `null` is an explicit unpin that beats a definition default, `undefined` leaves it untouched. |
| `ColumnState.pinned` | The live request stored on the model, `null` while unpinned. `resetColumnState` drops it, restoring the definition default. |
| `ColumnStateSnapshot.pinned` | The requested pin, `null` while unpinned. |
| `ColumnStateSnapshot.region` | The effective region, output-only. `null` while the column is hidden. |

A pin request is not a promise to render as a pin: a column can request a pin
and still be displayed in the center when there is no room (see
[Admission](#admission)). `region` is what actually happened.

Commands and events:

- `GridCore.setColumnPinned(columnId, "start" | "end" | null)`
- `onColumnPinned({ columnId, pinned })` on `GridCoreOptions` and as a prop of
  every wrapper — fired by that command, by the header pin toggle and by a
  cross-region header drag. `setColumnState` stays silent, like the other
  state commands.

## Regions and order

The base order is untouched by pinning. The resolved layout is its stable
partition `start | center | end` by requested pin, so `getLayout`, `indexOf`,
`idAt`, `columnAt`, `getState().order`, `move` and `CellPosition.col` all stay
contiguous in visual order and no consumer has to learn about regions.

- Unpinning returns a column to its base-order slot, not to where it was
  dragged.
- Reordering clamps into the column's own region: only a pin change moves a
  column between regions.
- When one update carries both, pins apply before order.
- Dragging a header across a region boundary makes the column adopt the
  requested pin of the column it lands on, which is what raises
  `onColumnPinned` for a drag.

`ColumnLayoutSnapshot.regions` describes the result:
`[0, centerStart)` are start pins, `[centerStart, centerEnd)` center columns and
`[centerEnd, count)` end pins, with `startWidth`, `endWidth`, `endOffset` (the
viewport x of the end region) and `centerViewportWidth`. Each
`ResolvedColumn` carries its effective `region` and a `regionOffset` that is
local to that region's container.

## Admission

Widths are resolved for every displayed column first, then regions are filled
in this order:

1. Start pins, outer to inner, while `used + width <= viewportWidth`.
2. End pins, outer to inner, on whatever is left.

The first rejection closes its region, so admitted pins are contiguous, never
overlap, and are always fully visible. Start pins win over end pins.

A rejected pin keeps its layout index and renders as a scrolling center column
— its request persists and it is re-admitted as soon as it fits, for example
after the host is widened. An unmeasured viewport (`viewportWidth === 0`, as in
SSR without `initialWidth`) admits every pin.

```
start A 200, B 200, end Z 150 in a 500 px viewport
-> A and B admitted, Z rejected and rendered in the center, center clip 100 px
```

## The mounted column window

`GridState.columnWindow` is the published window, or `null` before the first
layout:

| Field | Contents |
|---|---|
| `layout` | The layout snapshot the window was resolved from. |
| `range` | Half-open displayed-index range of the center columns intersecting `[scrollLeft − columnOverscan, scrollLeft + centerViewportWidth + columnOverscan)`. |
| `start` / `end` | Admitted pin columns, in display order. |
| `center` | The range plus any retained columns (see [Editor retention](#editor-retention)), in display order. |

`columnOverscan` is a `GridCore` option and a wrapper prop: CSS px of center
columns kept mounted past each clip edge. Default `240`; a value that is not
both finite and non-negative throws. The window is empty when the viewport is
measured and the center clip is 0. While the width is unmeasured the window
covers `[0, 1920 + columnOverscan)` so SSR and the pre-measurement frame stay
bounded and non-empty.

The same snapshot object is returned while the layout, the range and the
retained set are unchanged. A `scrollLeft`-only viewport update runs only this
sync: no row requests, no slot sync, no `UPDATE_VISIBLE_RANGE`, and no batch at
all when the range did not move.

## Editor retention

An open editor is not allowed to unmount when its column scrolls out of the
window. Core retains the edit column from `START_EDIT` to `STOP_EDIT`
regardless of the range, so wrappers need no special case for it; pinning,
unpinning or moving the column keeps the edit open by identity. Hiding the
column of an open edit commits it first.

Retention is a bounded, keyed internal facility (`geometryService.retainColumns(key, columnIds)`,
capped at 16 columns grid-wide) that PRD 007 reuses for its own participants.
It is not a public API.

## Inline axis (RTL)

Core stays direction-agnostic: every x it produces or consumes is an offset
from the inline-start edge, and `adapter/inline-axis.ts` is the only
direction-aware code. The exported helpers are:

| Helper | Purpose |
|---|---|
| `readIsRtl(el)` | Computed `direction` of an element; LTR without a DOM (SSR-safe). |
| `toInlineX(x, rtl)` / `toPhysicalX(x, rtl)` | Physical ↔ inline-relative x. |
| `inlineOffset(bounds, clientX)` | Inline-relative x of a pointer event against a client box. |
| `readContainerBounds(el)` | Client-box `ContainerBounds`, `rtl` included. |
| `fixedLeftForInline(el, inlineX, width)` | Inline start → client `left` for a fixed-position portal. |
| `normalizeHorizontalKey(key, rtl)` | Swaps the horizontal arrows so focus moves the way the arrow points. |

`ContainerBounds` describes the client box (`rect.left + clientLeft`,
`clientWidth`, so the right-hand scrollbar in LTR and the left-hand one in RTL
are excluded) and its `scrollLeft` is inline-relative — the DOM value negated
in RTL. Wrappers read the direction at mount and in their existing
`ResizeObserver` callback, so a `dir` flip that changes no size needs a
remount. Horizontal `lineX`/`dropIndicatorX` are viewport x, a fill handle's
`left` is local to its region, and wheel and touch deltas stay physical.

## Overlays, drag and accessibility

- The fill handle renders in a zero-height sticky overlay per pin region and in
  the rows wrapper for the center. `FillHandlePosition` gains `region`, `left`
  is region-local, and the helper returns `null` when a center anchor is
  outside its clip. The peek overlay clamps its inline start to the clip and
  closes when the cell leaves it.
- A center resize line or drop indicator never paints over a pin region, and a
  pin's own overlay renders inside that pin's container; resize auto-scroll
  applies to center columns only.
- Cells and headers are keyed by `columnId`, so a column keeps its DOM node when
  it changes region.
- The grid exposes `role="grid"` with `aria-colcount`/`aria-rowcount`,
  `role="row"` with `aria-rowindex`, and `columnheader`/`gridcell` with a
  1-based displayed `aria-colindex`. Full accessibility qualification is a
  later PRD.

## Custom pin UI

`HeaderRendererParams` gains `pinned` (the requested pin, or `null`) and
`onPinChange(pinned)`, so a custom header can build its own pin control.
`ColumnDefinition.pinned` remains the declarative form for configured pins.

The default header renders a pin action before the column label. Each click
cycles through physical left, physical right and unpinned. In RTL, the wrappers
map those physical sides to the core's logical `end` and `start` values. The wrappers
accept a framework-neutral `pinIcon` value when the default SVG should be
replaced:

```ts
const pinIcon = {
  path: "M1 1h2v2H1z",
  viewBox: "0 0 4 4",
};
```

Pass it as `pinIcon={pinIcon}` in React, `:pin-icon="pinIcon"` in Vue, or
`[pinIcon]="pinIcon"` in Angular. The path is rendered with `currentColor`, so
the standard inactive, hover and active states still apply. The accessible name
describes the next action and comes from `labels.pinLeftColumn`,
`labels.pinRightColumn` or `labels.unpinColumn`.

## Wrapper surface

| | Core | React | Vue | Angular |
|---|---|---|---|---|
| Overscan | `columnOverscan` option | `columnOverscan` prop | `columnOverscan` prop | `columnOverscan` input |
| Pin event | `onColumnPinned` option | `onColumnPinned` prop | `onColumnPinned` prop | `(onColumnPinned)` output |
| Command | `setColumnPinned(id, pin)` | `gridRef.current.core` | template ref `.core` | component `.core` |
| Icon | `GridIcon`, `defaultPinIcon` | `pinIcon` prop | `pin-icon` prop | `pinIcon` input |

A custom adapter renders `state.columnWindow` (`start`, `center`, `end`) and
reads viewport x from `core.geometry`. `getColumnClip(layoutIndex)` returns the
viewport x-range of the region a column renders in, and `hitTest` resolves
start, then end, then center, returning the resolved `region` on its result.
See [Column layout and geometry](./column-layout.md) for the coordinate spaces
and the rest of the geometry queries.
