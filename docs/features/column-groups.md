# Column groups and header bands

Column headers can nest in groups: a group has a stable id and ordered children,
each a nested group or a leaf column id. The hierarchy is caller-supplied, of
any finite depth within configurable budgets, and the flat column API is
unchanged. The header is a stack of bands with configured heights, shared by
every pin region.

`@gp-grid/core` owns validation, the leaf order, the band layout, the header
runs and the anchor a band change preserves; a wrapper renders the published
fragments and bands and computes nothing.

## Descriptors

```ts
interface ColumnGroupDefinition {
  groupId: string;          // distinct from every other group id and every column id
  headerName?: string;      // default: groupId
  wrapHeaderText?: boolean; // default: false
  headerRenderer?: string | ((params: ColumnGroupHeaderParams) => unknown);
  children: readonly ColumnGroupChild[];
}

type ColumnGroupChild = ColumnGroupDefinition | string; // a string is a leaf ColumnId
```

Every column of the schema, hidden ones included, is referenced exactly once,
and an ungrouped column is a string at the root. Branches can have different
depths, and the root can hold several groups. The grid never mutates the
descriptors.

```ts
const columns = [
  { field: "id", cellDataType: "number", width: 80 },
  { field: "name", cellDataType: "text", width: 160 },
  { field: "age", cellDataType: "number", width: 80 },
  { field: "city", cellDataType: "text", width: 140 },
  { field: "salary", cellDataType: "number", width: 120 },
];

const columnGroups: ColumnGroupChild[] = [
  "id",
  {
    groupId: "person",
    headerName: "Person",
    children: [{ groupId: "basics", headerName: "Basics", children: ["name", "age"] }, "city"],
  },
  { groupId: "pay", headerName: "Pay", children: ["salary"] },
];
```

That hierarchy has three bands: `Person` and `Pay` in band 0, `Basics` in band 1,
`name` and `age` in band 2, while `id` spans bands 0–2 and `city` and `salary`
span bands 1–2.

```tsx
// React
<Grid columns={columns} columnGroups={columnGroups} headerBandHeights={[40]}
  onColumnSchemaRejected={(error) => console.warn(error.message)} />
```

```vue
<!-- Vue -->
<GpGrid :columns="columns" :column-groups="columnGroups" :header-band-heights="[40]"
  :on-column-schema-rejected="(error) => console.warn(error.message)" />
```

```html
<!-- Angular: AngularColumnGroupChild[] -->
<gp-grid [columns]="columns" [columnGroups]="columnGroups" [headerBandHeights]="[40]"
  (onColumnSchemaRejected)="onRejected($event)" />
```

```ts
// Core
const core = new GridCore({ columns, dataSource, rowHeight: 32, columnGroups, headerBandHeights: [40] });
```

## Validation and errors

A hierarchy is validated in one iterative depth-first pass over an explicit
stack, so deep input never overflows the call stack. The pass returns the first
error it meets in traversal order. A group is checked for `malformed`, `cycle`,
`multipleParents`, `duplicateGroup` and `idCollision`, in that order; a leaf for
`unknownLeaf` or `repeatedLeaf`. `missingLeaf` is checked after the pass.

| Code | Meaning |
|---|---|
| `malformed` | The root is not an array, or a child is neither a string nor an object with a non-empty string `groupId` and an array `children`. A group with no children is accepted. |
| `cycle` | A group contains itself. |
| `multipleParents` | The same group object appears under two parents. |
| `duplicateGroup` | Two groups share a `groupId`. |
| `idCollision` | A `groupId` equals a column id. |
| `unknownLeaf` | A leaf names no column of the schema. |
| `repeatedLeaf` | A column is referenced more than once. |
| `missingLeaf` | A column of the schema is not referenced. |
| `limit` | A budget is exceeded (see below). |

A rejected change returns `{ status: "rejected", error }` with
`ColumnSchemaError = { code, source, id?, limit?, message }`. `source` is the
command it came from (`"groups"`, `"move"`, `"pin"` or `"state"`), `id` the group
or column the error names, `limit` the budget's name, and `message` the label
`labels.columnSchemaErrors[code]` formatted with `{id}` and `{limit}`. The
columns, the hierarchy, the layout and the bands stay as they were, the core
calls `onColumnSchemaRejected(error)` and publishes the message through the
polite live region it shares with the frozen-rows announcement.

At creation a rejected `columnGroups` leaves the grid flat and warns once
(`[gp-grid] columnGroups rejected, the grid stays flat: <message>`), with no
callback and no announcement.

The core keeps the last valid hierarchy, but a wrapper keeps the prop it was
given and re-applies it with every later `columns` change, each time with another
callback and announcement. Restore a valid hierarchy after
`onColumnSchemaRejected`.

## Budgets

`columnGroupLimits` bounds the work and the metadata a hierarchy can cost. Each
value is a positive safe integer, otherwise the core throws
`RangeError("Invalid columnGroupLimits.<field>: <value>")`. It is read at
creation.

| Budget | Default | Counts |
|---|---|---|
| `maxDepth` | `64` | Groups above any group or column, so the band count is at most `maxDepth + 1`. |
| `maxNodes` | `100,000` | Groups and column references in one hierarchy. |
| `maxFragments` | `100,000` | Header runs across every band and region, after a change is laid out. |

`maxDepth` and `maxNodes` are checked as each node is visited, before anything is
stored, so an over-budget hierarchy is rejected after at most `maxNodes + 1`
visits and allocates nothing sized by it. `maxFragments` is checked against the
runs of the resulting layout. The accepted hierarchy is kept as a node table plus
the parent and depth of each leaf, proportional to the hierarchy.

A guarded command that would exceed `maxFragments` returns `limit` and changes
nothing. A change that is not guarded (a viewport width that admits a pin, a
width command, a fit or `setLayout`) and exceeds it keeps the band count and
publishes no fragments until the runs fit again.

The pre-mount seed (`createInitialState`, used for the server render and the
first client frame) adopts `initialColumnGroups` under the **default** budgets,
so with custom budgets the seed and the core can disagree about a hierarchy near
a limit until the core's first batch.

## Commands and order

| Command | Effect |
|---|---|
| `columns.set(columns, groups?)` | Replace the definitions and the hierarchy together. `groups` replaces it, `null` makes the grid flat, and `undefined` keeps the active one, validated against the new column ids. |
| `columns.setGroups(groups)` | Replace the hierarchy over the current columns; `null` makes the grid flat. The same array again is `"unchanged"`. |
| `columns.getGroups()` | The active hierarchy as passed, or `null` while flat. |
| `columns.getGroup(groupId)` | The active group with that id, as passed; `undefined` while flat or for an unknown or leaf id. |

`columns.set`, `setGroups`, `move`, `setPinned`, `setState` and `resetState`
return a `ColumnSchemaResult`: `{ status: "applied" | "unchanged" }` or
`{ status: "rejected", error }`. A flat grid never rejects a move, a pin or a
state change.

- **Membership** changes only through `columns.set(columns, groups)` and
  `setGroups(groups)`. A move, a pin and a hide change the order, the region or
  the visibility of a leaf, never its parent, so a leaf moved between two leaves
  of another group splits that group into several fragments.
- **Order.** While groups are active, the depth-first leaf order of the
  descriptors is the default order, the order new leaves take on replacement and
  the order `columns.resetState()` restores. Retained user order keeps its
  precedence across a replacement. `columns.resetState()` is the way back to
  descriptor order, and it also drops widths and pins. `setGroups(null)` restores
  the definitions' own order as the default.
- **Wrappers** apply `columnGroups` with `columns` through one
  `core.columns.set(columns, columnGroups ?? null)` call whenever either changes.
  A core-only consumer that calls `columns.set(columns)` with groups active
  re-validates the active hierarchy against the new ids, so a column added or
  removed without a matching hierarchy is rejected.
- Resize, fit and keyboard commands target a leaf. A group has no resize, fit,
  move, sort, filter, collapse or expand of its own.

## Bands and their heights

`bandCount` is `1 +` the greatest depth of a visible leaf, taken from the whole
visible hierarchy, so scrolling never changes it. A leaf at depth `d` starts in
band `d` and spans to the last band, so every leaf header ends on the body
boundary. A group with no visible leaf renders nothing, and a hidden leaf
occupies no span.

Band `b` is `headerBandHeights[b]`, else `headerHeight`; entries past the band
count are ignored. `headerBandHeights` is a `GridCore` option and a prop/input of
every wrapper, applied at runtime through `core.header`:

| `core.header` | Effect |
|---|---|
| `getBands()` | `HeaderBandLayout = { count, heights, offsets, totalHeight }`; `offsets[b]` is the top of band `b`. One band of `headerHeight` while flat; reused while unchanged. |
| `setBandHeights(heights)` | Replace the whole list. A value-equal list emits nothing. A height that is not finite and `> 0` throws `RangeError("Invalid headerBandHeights[<band>]: <value>")` and applies nothing. A no-op after `destroy()`. |

Every band change, of the heights or of the band count, is one atomic update: the
core captures the row at the clip top, lowers the body height by the header's
growth, refreshes the geometry and restores the anchor, so the first visible row
keeps its offset below the header. One batch carries `SET_HEADER_BANDS`,
`SET_CONTENT_SIZE`, `SET_ROW_REGIONS`, the slot instructions and any `SCROLL_TO`.
A header that grows until the frozen rows no longer fit lowers the effective
frozen count with `limit: "viewport"`.

## Fragments

A **run** is a maximal contiguous set of displayed leaves with the same ancestor,
in one band and one region; a **fragment** is a rendered run. A group can have
several fragments in one region and across regions, and repeated labels are
fragments of one group.

```ts
interface HeaderFragment {
  groupId: string;
  band: number;
  region: "start" | "center" | "end";
  runIndex: number;          // position among the group's runs in this region
  firstDisplayIndex: number; // first leaf in ColumnLayoutSnapshot.columns
  leafCount: number;
  regionOffset: number;      // inline offset inside the region container
  width: number;             // the leaves' displayed widths together
  fragmentId: string;        // "<groupId>:<region>:<runIndex>"
}
```

`ColumnWindowSnapshot.groups` publishes `{ start, center, end }`: every pin run
plus the center runs that intersect the mounted center window, so the fragments
move in the same `SET_COLUMN_WINDOW` instruction as the columns. Runs are rebuilt
when the layout or the hierarchy is replaced, in O(displayed leaves × depth),
and never on scroll. A fragment renders at its full run width and its region
clips it, so a label can scroll out of view inside a wide fragment.

## Header renderers and clipping

A group's `headerRenderer` is a function or a key of the wrapper's
`headerRenderers` registry, which columns and groups share. It receives
`ColumnGroupHeaderParams = { group, groupId, band, region, leafCount, columnIds }`,
`columnIds` being the spanned leaves in display order. Without one the fragment
renders `span.gp-grid-header-text` with `headerName ?? groupId`. The global
`headerRenderer` does not apply to groups.

| | React | Vue | Angular |
|---|---|---|---|
| Group renderer | `ReactGroupHeaderRenderer` | `VueGroupHeaderRenderer` (function or component) | `TemplateRef<{ $implicit: ColumnGroupHeaderParams }>` (`GroupHeaderRendererTemplate`) |
| Registry | `ReactHeaderRendererRegistry` | `VueHeaderRendererRegistry` | `HeaderRendererRegistry` |
| Descriptor type | `ColumnGroupChild` | `ColumnGroupChild` | `AngularColumnGroupChild` |

Angular ignores a function renderer on a group, as it does on a leaf, and renders
the text.

A header taller than its band is clipped: the shipped CSS gives
`.gp-grid-header-cell` `overflow-y: clip`. `wrapHeaderText: true`, on a column
or a group, adds `.gp-grid-header-cell--wrap`, which lets `.gp-grid-header-text`
wrap and caps it at the cell's height. Header text never sizes a band.

## DOM and accessibility

A flat grid keeps its header DOM: the header root is `role="row"` with
`aria-rowindex="1"`, and each leaf header gains an `id`.

A grouped grid (`headerBands.count > 1`) keeps the three region containers:

- The header root is `role="rowgroup"`. Its first children are one empty
  `div[role="row"][aria-rowindex=b+1]` per band, whose `aria-owns` lists the
  fragments of band `b` and the leaves starting in band `b`, across the regions
  in display order.
- A fragment is `div.gp-grid-header-cell.gp-grid-header-group[role="columnheader"]`
  with `id`, `data-group-id`, `data-band`, `data-fragment`, `aria-colindex` (its
  first leaf's), `aria-colspan` (its leaf count) and `aria-rowindex` (`band + 1`),
  absolutely placed at `offsets[band]` with the band's height. It has no pointer
  or key handler, no focusable child and no `data-col-index`, so it is never
  measured or used as a filter anchor.
- A leaf header gains `aria-rowindex` (`headerBand + 1`), `aria-rowspan` (the
  bands it spans) and `aria-describedby` listing its mounted ancestor fragments,
  outermost first; it starts at `offsets[headerBand]` and ends on the body
  boundary.
- Ids are `<instance>-<fragmentId>` for a fragment and `<instance>-h-<columnId>`
  for a leaf. The instance comes from `useId` in React and Vue and from a per-app
  counter in Angular (`ng-0`). Every part goes through one escape: a character
  outside `[A-Za-z0-9]`, `-` and `_` included, becomes `_<hex code point>_`, so
  ids are valid IDREFs, distinct inputs never collide and a leaf id never equals
  a fragment id.

**Row numbering.** The header bands are the first ARIA rows in every mode. A body
row's `aria-rowindex` is its view index plus the band count plus 1, and the
grid's `aria-rowcount` is the row count plus the band count.

Keyboard navigation, focus and events address leaves by `columnId`; fragments are
not focusable.

The helpers every wrapper uses are exported from `@gp-grid/core` for custom
adapters: `escapeDomIdPart`, `leafHeaderId`, `fragmentHeaderId`, `leafHeaderBox`,
`fragmentHeaderBox` and `resolveHeaderAssociations`.

## Wrapper surface

| | Core | React | Vue | Angular |
|---|---|---|---|---|
| Hierarchy | `columnGroups` option, `columns.set`, `columns.setGroups` | `columnGroups` prop | `columnGroups` prop | `columnGroups` input |
| Budgets | `columnGroupLimits` option | `columnGroupLimits` prop | `columnGroupLimits` prop | `columnGroupLimits` input |
| Band heights | `headerBandHeights` option, `header.setBandHeights` | `headerBandHeights` prop | `headerBandHeights` prop | `headerBandHeights` input |
| Rejection | `onColumnSchemaRejected` option | `onColumnSchemaRejected` prop | `onColumnSchemaRejected` prop | `(onColumnSchemaRejected)` output |
| Header wrap | `wrapHeaderText` on a column or a group | same | same | same |

`columnGroups` and `headerBandHeights` are reactive; `columnGroupLimits` is
creation-only. A custom adapter renders `state.headerBands` (from
`SET_HEADER_BANDS`, `BatchChangeSetters.setHeaderBands`) and
`state.columnWindow.groups`, never one from the other, and takes the header
height from `headerBands.totalHeight`. `DisplayedColumn.headerBand` is a leaf's
first band and `ColumnLayoutSnapshot.bandCount` the band count.

## Server rendering

A server render uses the configured band heights and renders the fragments of the
seeded window (`initialWidth`). React and Vue resolve a fragment's group through
`createColumnGroupLookup(columnGroups)` until their core exists, so the server
render, hydration and the mounted grid print the same label, `--wrap` and
renderer output; Angular creates its core on the server too and reads
`columns.getGroup`. Custom adapters seed the same state with
`createInitialState({ initialColumns, initialHeaderHeight, initialHeaderBandHeights, initialColumnGroups })`;
a missing `initialHeaderHeight` seeds 0 px bands.

## Limits

- Validation is O(nodes) per `columns.set` or `setGroups`; run building is
  O(displayed leaves × depth) once per layout; a scroll sample does a binary
  search per band over the center runs.
- Depth is bounded only by `maxDepth`; arbitrary depth does not promise constant
  work per visible column.
- The run count is not public; `maxFragments` counts runs, not mounted fragments.
- `columnGroupLimits` and `autoFit` are creation-only.
