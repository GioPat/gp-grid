# Auto-fit and row resize

A user can drag a row edge to resize the row, and fit a row or a column to its
rendered content once: by a double-click on its edge, by a grid shortcut or by a
command. Nothing observes content. A fit is one measurement that becomes a
stored size, so a row is `rowHeight` until someone resizes or fits it, and a
column keeps its width until someone resizes or fits it again.

`@gp-grid/core` owns every size, the clamps, the scroll correction and the
events. The DOM reads a fit needs live in the adapter kit's
`createDomMeasurementHost`, which every wrapper builds in the browser; the rest
of core never reads the DOM.

## Configuration

| Option | Default | Meaning |
|---|---|---|
| `rowResize` | `false` | The user can resize rows: the row edge drag and double-click, Alt+ArrowUp/Down and Alt+Shift+Enter. |
| `autoFit.maxColumnWidth` | `600` | Widest width a column fit sets, in px. |
| `autoFit.minRowHeight` | `rowHeight` | Shortest height a row fit sets, in px. |
| `autoFit.maxRowHeight` | `10 × rowHeight` | Tallest height a row fit, a row drag or a row key sets, in px. |
| `onRowResized` | — | `{ rowId, height, viewIndex }`, once per row a drag, a key or a fit changed. |
| `measurementHost` | — | The reads a fit goes through. Wrappers pass their own; a core-only consumer passes `createDomMeasurementHost(() => root)`. |

Every `autoFit` value must be finite and `> 0`, and `maxRowHeight` must not be
below `minRowHeight`; otherwise the core throws
`RangeError("Invalid autoFit.<field>: <value>")`. `autoFit` is read at creation.

`rowResize` is changeable at runtime: `core.rowHeights.setResizable(enabled)`
turns it on or off without emitting anything, `isResizable()` reads it, and every
wrapper applies a changed prop or input through it.

| | Core | React | Vue | Angular |
|---|---|---|---|---|
| Row resize | `rowResize` option, `rowHeights.setResizable` | `rowResize` prop | `rowResize` prop | `rowResize` input |
| Bounds | `autoFit` option | `autoFit` prop | `autoFit` prop | `autoFit` input |
| Row event | `onRowResized` option | `onRowResized` prop | `onRowResized` prop | `(onRowResized)` output |
| Column event | `onColumnResized` option | `onColumnResized` prop | `onColumnResized` prop | `(onColumnResized)` output |

A column with `resizable: false` has no edge handle and ignores Alt+ArrowLeft/Right
and Alt+Enter. The commands below are not gated: `columns.fit` fits any mounted
column, and `rowHeights.fit` works while `rowResize` is off.

## Commands

`core.rowHeights.fit(rowIds?)` fits rows and `core.columns.fit(columnIds?)` fits
columns. Both are synchronous and return their result. Omitted ids mean every
mounted row, or every mounted displayed column.

```tsx
// React
const result = gridRef.current?.core?.columns.fit(["name"]);
gridRef.current?.core?.rowHeights.fit();
```

```ts
// Vue — the exposed core
gridRef.value?.core.columns.fit(["name"]);
```

```ts
// Angular — the exposed core
grid.core?.rowHeights.fit([2, 3]);
```

| Status | Meaning |
|---|---|
| `"applied"` | At least one displayed size changed. |
| `"unchanged"` | Every fitted size was already displayed. The sizes are still stored. |
| `"unsupported"` | No host (a server render, a core without `measurementHost`, or after `destroy()`), or the host answered `null`: no root, or a root with a zero client size. |
| `"stale"` | The host read under a layout revision that is not the core's. Nothing is applied. |

```ts
interface RowFitResult {
  status: FitStatus;
  consideredColumns: number; // distinct columns whose cells were read
  rows: { rowId: RowId; height: number; clamped: "min" | "max" | null }[];
  skipped: { rowId: RowId; reason: "not-mounted" }[];
}

interface ColumnFitResult {
  status: FitStatus;
  scope: "rendered";
  consideredRows: number; // distinct rows whose cells were read
  columns: { columnId: string; width: number; clamped: "min" | "max" | null }[];
  skipped: { columnId: string; reason: "unknown" | "hidden" | "not-mounted" }[];
}
```

### Fit after the render

The host reads the layout revision from the root's `data-layout-revision`, which
every wrapper renders from `columnWindow.layout.revision`, so it follows the core
only once the wrapper has rendered. A fit in the same task as a column layout
change returns `"stale"`. Such changes include a width change (a fit, a resize,
`setState`), a move, a pin, a hide or show, `columns.set` or `setGroups` when the
order or the band count changes, `setLayout`, and a viewport width change in
`"fit"` mode. Call the fit
after the render that follows the change, for example from a
`requestAnimationFrame` callback; a `"stale"` fit applied nothing, so it can be
repeated. A row height change and a band height change do not move the
revision.

## What a fit reads

- **Rows.** The mounted cells of each row (`[data-cell-row]`), frozen rows
  included. The row takes its tallest cell.
- **Columns.** The header cell (`[data-col-index]`) and the mounted body cells
  (`[data-cell-col]`) of each column. The column takes the widest of them,
  rounded up to a whole pixel.
- Editing cells are skipped. A box includes its padding and borders, and custom
  renderers are measured from their rendered DOM.
- The host sets the measured dimension to its intrinsic size (`width:
  max-content` or `height: auto`), reads every box, and restores the previous
  inline value, all in one synchronous call. It writes through the CSSOM, so a
  strict CSP does not block it, and leaves no measuring style behind.
- A fit issues no data request and never loads a row.

**The scope is the mounted window.** A row or a column that is not mounted is
skipped as `"not-mounted"`, and a column fit considers only the mounted rows.
Widening columns can unmount others and narrowing can mount new ones, so
`columns.fit()` without ids can apply again on a second call.

**Wrapped text.** A row fit measures a `wrapText` cell at the column's current
width, so it fits the wrapped lines. A column fit measures single-line
`max-content`, so a long `wrapText` column lands on `maxColumnWidth`.

**Fractional heights.** A row fit stores the border-box height as measured, which
can be fractional (`137.5`); a column fit rounds up.

## Clamps and storage

- **Rows** clamp into `[minRowHeight, maxRowHeight]` and are stored as
  [row heights](./row-heights.md): `getOverrides()` lists them, they follow
  their row by identity, and the change runs through the same anchored size
  change as `rowHeights.set`, so a fit above the viewport keeps the first visible
  row in place and a frozen row grows the frozen band.
- **Columns** clamp into `[minWidth ?? 50, min(maxWidth ?? ∞, maxColumnWidth)]`
  and are stored as pixel overrides in one batch, like `columns.setState`. A
  `maxWidth` below the minimum wins.
- `clamped` reports which bound applied.

`onRowResized` fires once per row and `onColumnResized` once per column whose
displayed size changed. `rowHeights.set` and `columns.setState` stay silent.

## Reset

A fitted or resized size is an ordinary override:

- `core.rowHeights.reset(rowIds?)` drops row heights.
- `core.columns.setState([{ columnId, width: null }])` drops a column's pixel
  override and restores its declared width (and its `"fit"` share).
  `columns.resetState(columnIds?)` drops the whole column state.

There is no reset key or gesture.

## Edge handles

Both handles are pointer targets only: `aria-hidden="true"`, no role, label or
`tabindex`, and no key handler. The grid stays a single tab stop, and the grid
shortcuts below are their keyboard equivalent.

| Handle | Where | Drag | Double-click |
|---|---|---|---|
| `.gp-grid-header-resize-handle` | The inline-end edge of a resizable column's header cell. | Resizes the column. | Fits the column. |
| `.gp-grid-row-resize-handle` | While `rowResize` is on, the bottom edge of every non-editing cell, in every region and in the frozen band, so the whole row edge is a target whatever the column order. | Resizes the row into `[16, maxRowHeight]` and commits `rowHeights.set` on release. | Fits the row. |

- Both handles stop propagation on pointer down and double-click, so a cell never
  selects, edits or peeks through them; a double-click elsewhere in a cell keeps
  its edit or peek meaning.
- A press that never moved commits nothing and fires no event, on both axes.
- The row handle sits inside the cell (`inset-inline: 0; bottom: 0; height: 5px`,
  24 px on coarse pointers) because the cell clips its overflow, and the fill
  handle stacks above it. It has no visual of its own: its cursor marks the edge,
  and `--active` marks every handle of the dragged row as a styling hook.
- During a row drag, `DragState.rowResize` is
  `{ rowIndex, rowId, initialHeight, currentHeight, lineY, region }`, and wrappers
  draw `.gp-grid-row-resize-line` at the header height plus `lineY`.

## Grid shortcuts

The keys act on the active cell while no editor is open. A handled key prevents
the default, so the browser's Alt+Arrow history navigation does not run; a key
with no target is left to the browser and moves no focus. In RTL the horizontal
arrows are swapped, so the key toward the inline end grows or moves forward.

| Key | Action |
|---|---|
| Alt+ArrowRight / Alt+ArrowLeft | Grow / shrink the column by 8 px, clamped like a drag, unless `resizable` is false. |
| Alt+ArrowDown / Alt+ArrowUp | Grow / shrink the row by 4 px into `[16, maxRowHeight]`, while `rowResize` is on. |
| Alt+Shift+ArrowRight / Alt+Shift+ArrowLeft | Move the column after the next / before the previous displayed column of its region, unless `movable` is false. The active cell follows its column. |
| Alt+Enter | Fit the column, unless `resizable` is false. |
| Alt+Shift+Enter | Fit the row, while `rowResize` is on. |

Alt+Enter in an open editor still commits it. A step that changes a size fires
one `onColumnResized` or `onRowResized`, and a move fires `onColumnMoved`.

## Server rendering and teardown

No wrapper builds a host on the server, so a fit there returns `"unsupported"`
and touches no browser global; so does a fit after `destroy()`. A server render
uses `rowHeight` for every row.

## Limits

- One fit reads every targeted mounted cell once, in one synchronous call; its
  cost is bounded by the mounted window, not by the row or column count.
- Nothing fits rows or columns that are not mounted, and there is no continuous
  sizing: content that changes after a fit keeps the fitted size.
- `autoFit` is creation-only.
