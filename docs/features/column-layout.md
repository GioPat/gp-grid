# Column layout and geometry

`@gp-grid/core` owns grid geometry. Column widths, offsets, row bounds, hit
testing and scroll targets are resolved in one place and published to the
wrappers as a revisioned snapshot; a framework wrapper never recomputes a
position or a width.

Keeping these calculations in a dedicated service gives rendering, pointer
input, keyboard navigation and overlays the same answers. A resize or reorder
can update one layout snapshot instead of requiring React, Vue and Angular to
keep separate formulas in sync. The numeric service can also be tested without
a browser, while wrappers concentrate on measurement and rendering.

This provides a shared place to add variable row heights and frozen regions:
their coordinate rules can be implemented once and consumed by every wrapper.
The benefit is consistency and easier maintenance; bundle size and scrolling
performance still need measurement as the service grows.

## Displayed-width modes

`columnLayout` selects how displayed column widths are resolved. It is a
`GridCore` option and a prop/input of `Grid` (React), `GpGrid` (Vue) and
`gp-grid` (Angular). Default: `"fit"`.

| Mode | Behaviour |
|---|---|
| `"fit"` | Columns without an explicit pixel override expand proportionally so their total reaches the viewport width. `fit` only ever expands: a base total that already reaches or overflows the viewport keeps the declared/overridden widths. |
| `"fixed"` | Displayed width equals the base width. Remaining space stays empty and the grid scrolls horizontally. |

Base width is the normalized pixel override when one exists, otherwise the
normalized declared `width`. A width that is not positive and finite falls back
to `50` px (`DEFAULT_MIN_COLUMN_WIDTH`) and is diagnosed once per column id.

### Overrides are exact

Manual resize and `setColumnState([{ columnId, width }])` store a pixel
override. In `fit` mode an override keeps that exact width and the slack is
shared by the columns that have no override:

```
100 / 100 in a 300 px viewport  ->  150 / 150
override the first to 100      ->  100 / 200
reset the first                ->  150 / 150
```

When every displayed column is overridden the slack stays empty. `resetColumnState`
removes the override; a definition width is never back-solved from a displayed
width.

`GridCore.getColumnState()` reports an optional `width` (present only while an
override exists) plus `resolvedWidth`, the displayed CSS px (`0` while hidden).
`resolvedWidth` is output-only.

### Changing the mode at runtime

- Core: `core.setColumnLayout("fixed")`
- React: the `columnLayout` prop
- Vue: the `column-layout` prop
- Angular: the `columnLayout` input

A mode change republishes the layout without recreating the core. Setting the
mode it already has emits nothing.

## Geometry queries

`core.geometry` is a read-only view of the committed layout:

| Query | Answer |
|---|---|
| `revision` | Committed layout revision. Versions columns, the row axis, viewport dimensions and mapping parameters — not raw scroll positions. |
| `getColumnLayout()` | `{ revision, mode, columns, totalWidth }`; each displayed column carries `columnId`, `layoutIndex`, `column`, `offset` and `width`. |
| `getRowWindow()` / `getVisibleRowWindow()` | Half-open `{ start, end }`, overscanned / exact. |
| `getRowBounds(i, space?)` / `getColumnBounds(layoutIndex, space?)` | `{ start, end }` in the requested space. |
| `getCellBounds(rowIndex, layoutIndex, space?)` | `{ top, left, width, height, columnId, coordinateSpace }`. |
| `getRowEdgeOffset(boundaryIndex, space?)` | Row boundary offset, including the end insertion edge `rowCount`. |
| `hitTest({ x, y, scrollTop?, scrollLeft? })` | `{ row, displayIndex, col, columnId? }`. `row` and `displayIndex` (index into the displayed columns) are raw axis sentinels: `-1` before, `count` past the end. `col` is the layout index, or `-1` outside a column. |
| `getScrollTarget(rowIndex, layoutIndex, from?)` | DOM `{ scrollTop?, scrollLeft? }` for the axes that must move. |
| `getContentSize()` | Logical body `{ width, height, coordinateSpace: "content" }`. |

`GridCore.getCellBounds(rowId, columnId, space?)` resolves identities through
the bounded current row window and the resident records. It never scans or
materializes a remote or columnar dataset, so a columnar identity outside the
current window answers `undefined`; callers that hold a view index can query
any valid row through `core.geometry`.

## Coordinate spaces

Three named spaces, all in CSS px:

- **`content`** — logical, uncompressed coordinates. `x` starts at the first
  displayed column's left edge, `y` at row 0's top edge; the header is
  excluded. This is the space of the scrollable content.
- **`viewport`** — content minus the logical scroll offsets, relative to the
  body client area's top-left corner (inside its border). The default for
  bounds queries. A portalled overlay adds the body client area's screen
  origin.
- **`rows`** — local to the rows wrapper, the space of `MOVE_SLOT.translateY`.
  Equal to `content` unless vertical scrolling is compressed; adapter-only.

In compressed mode, with logical top `L`, effective DOM top `D` and
first-visible-row offset `A`: a row's wrapper position is `rowOffset − A` and
the wrapper offset is `D − (L − A)`, so
`wrapperOffset + rowPosition − D === rowOffset − L` at any scroll fraction,
including fractional touch overrides.

Windows are half-open (`[start, end)`). Legacy inclusive APIs are adapted at
the boundary as `{ start, end: end - 1 }`, which is `{ start: 0, end: -1 }`
for an empty range.

Browser adapters supply raw DOM scroll samples and normalized dimensions;
the core maps them to logical coordinates and clamps them. Compressed-scroll
conversion lives in `ScrollVirtualizationManager` and is reached through
`core.geometry`; a width-only viewport update performs no row work. A scroll
sample outside the reachable range is answered from its clamped value and
corrected with `SCROLL_TO` in the same batch. A measured zero-height viewport
renders an empty window; until the first measurement the core assumes 600 px.

## Standalone helpers

`calculateColumnPositions`, `getTotalWidth` and `findColumnAtX` remain
supported for simple known-width lists. They operate on exactly the supplied
list (including hidden entries) and do not apply the grid's fallback width or
width modes. `calculateScaledColumnPositions` was removed in 1.0 — see the
[migration entries](../CHANGELOG.md).
