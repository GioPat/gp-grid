# Row grouping and aggregation

Rows can be grouped by ordered dimensions, expanded and collapsed, with
aggregates under their own columns. A group row is an ordinary row of cells: its
expander and label sit in one label column and each aggregate sits under the
column it belongs to. There is no full-width group row and no generated column.

The grid renders a **hierarchy**: view rows of kind `record`, `group` or
`total`. A hierarchy comes from the local engine (`createRowGrouping`, over rows
loaded in full) or from the data source itself (rows the application grouped).
Both reach the grid through one contract, `HierarchicalRowAccess`.

`@gp-grid/core` owns the view index, focus, the scroll anchor and the write
guards; the provider owns membership and aggregate values; a wrapper renders
what the core publishes. A grid without `rowGrouping` binds no hierarchy.

## Configuration

```ts
import { createRowGrouping } from "@gp-grid/core"; // or any wrapper package

const columns = [
  { field: "country", cellDataType: "text", width: 180 },
  { field: "city", cellDataType: "text", width: 140 },
  { field: "name", cellDataType: "text", width: 140, editable: true },
  { field: "amount", cellDataType: "number", width: 120, editable: true },
  { field: "score", cellDataType: "number", width: 100, valueFormatter: (v) => Number(v).toFixed(1) },
];

const grouping = createRowGrouping({
  dimensions: [{ field: "country" }, { field: "city" }],
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "score", aggregate: "avg" },
  ],
  grandTotal: "top",
});
```

| `RowGroupingConfig` | Default | Meaning |
|---|---|---|
| `dimensions` | required | Ordered `RowGroupDimension`s: `{ field, id?, toKey? }`. `id` defaults to `field` and names the bucketing. |
| `measures` | none | `RowGroupMeasure`s: `{ field, source?, aggregate }`. Group and total rows expose the result under `field`, so the column with that `field` shows it; `source`, `field` by default, is the leaf field folded. |
| `defaultExpandedDepth` | `0` | Groups of a depth below it start expanded; `0` collapses every group. |
| `grandTotal` | none | `"top"` or `"bottom"` adds one total row; omitted adds none. |
| `initialState` | none | A `RowGroupingState` from an earlier `getState()`. |

Column definitions carry no grouping or aggregate flag. `createRowGrouping`
throws `RangeError("Invalid rowGrouping.<field>: <value>")` for no dimension, a
repeated dimension id, a repeated measure field, an unknown built-in aggregate
name or a negative depth.

One `RowGrouping` serves one grid, and a new configuration is a new
`createRowGrouping` call. Keep the object referentially stable (a module
constant, `useMemo`, a `shallowRef`, a class field): a new object regroups.

```tsx
// React
<Grid columns={columns} rowData={rows} rowHeight={32} getRowId={(row) => row.id}
  rowGrouping={grouping} groupLabelColumn="country"
  onRowGroupToggled={(event) => console.log(event.rowId, event.expanded)}
  onRowGroupingRejected={(rejection) => console.warn(rejection.reason)} />
```

```vue
<!-- Vue -->
<GpGrid :columns="columns" :row-data="rows" :row-height="32" :get-row-id="(row) => row.id"
  :row-grouping="grouping" group-label-column="country"
  :on-row-group-toggled="(event) => console.log(event.rowId, event.expanded)"
  :on-row-grouping-rejected="(rejection) => console.warn(rejection.reason)" />
```

```html
<!-- Angular -->
<gp-grid [columns]="columns" [rows]="rows" [rowHeight]="32" [getRowId]="getRowId"
  [rowGrouping]="grouping" groupLabelColumn="country"
  (onRowGroupToggled)="onToggled($event)"
  (onRowGroupingRejected)="onRejected($event)" />
```

```ts
// Core
const core = new GridCore({ columns, dataSource, rowHeight: 32, rowGrouping: grouping });
core.rowGroups.setGrouping(null);     // back to the flat rows, no query
core.rowGroups.setGrouping(grouping); // regroup the resident rows, no query
```

`rowGrouping` is reactive in every wrapper: a changed value reaches the core
through `rowGroups.setGrouping`, never a new core. Angular's published input
typings do not accept `null` or `undefined` under strict templates, like
`columnGroups`: bind a `RowGrouping`, and cast to ungroup
(`null as unknown as RowGrouping`).

The engine groups the complete filtered and sorted result of a source loaded in
full, object or columnar. It reads fields through the source's value access, so
a columnar source is grouped without materializing records.

## Keys and ids

A key is the normalized raw value of the dimension field, or `toKey(value)`.

- `undefined`, a missing property and `null` share one null bucket, for object
  and columnar sources alike.
- Strings, numbers and booleans are keyed by type and value: `""`, `0`, `false`
  and `"0"` are four groups, and `1` and `"1"` are two. `-0` is `0`.
- A `Date` is keyed by its timestamp and never equals a number; its group row's
  `value` is a `Date`.
- An object value needs a `toKey`; without one the grouping is rejected with
  `object-key`. No bucket function is built in.

```ts
const byDecade = createRowGrouping({
  dimensions: [
    { field: "age", id: "decade", toKey: (value) => (typeof value === "number" ? Math.floor(value / 10) * 10 : null) },
    { field: "age" },
  ],
});
```

A group id is `"gp-group:"` plus the JSON of its path, one
`[dimensionId, typeTag, key]` triple per level, and the total row is
`"gp-total"`. The dimension `id` is part of the group id, so two bucketings of
one field never share ids. Labels, formatters and locale never enter an id:
expansion survives a `valueFormatter` change. Treat ids as opaque and read them
from `rows.getViewRow(viewIndex)?.id`, the toggle event or `getState()`.

A group row's `field` is the dimension's field and its `value` the key (the
`toKey` result when there is one). A record row's id is its source identity
(`getRowId`), or its flat position without one, and its `depth` is the number of
dimensions.

## Order

The sort model drives three orders:

1. **A sorted dimension column** orders the groups of its level by key, in that
   direction.
2. Otherwise, when **the first sorted column is a measure field**, every level
   without a sorted dimension orders its groups by that aggregate.
3. Otherwise keys ascend.

Leaves keep the order of the sorted flat result inside their group.

Keys or aggregates of different types order by type first: number, date,
boolean, string, object, then null last. Values of one type compare with the
same comparator the sort uses (`compareValues`). A descending direction reverses
the whole order, the type order included.

Filters apply before grouping: groups, counts and totals describe the filtered
rows. Collapsing changes the row count and the scroll extent, never an
aggregate.

## Aggregates

| `aggregate` | Result | Null rules |
|---|---|---|
| `"sum"` | Sum of the finite numbers | `null` when the group has none; non-numbers, `NaN` and `±Infinity` are skipped |
| `"avg"` | Sum divided by the count of finite numbers | `null` when the group has none |
| `"count"` | Count of non-null values | `0` for none |
| `"min"` / `"max"` | Extremum of the non-null values, by `compareValues` | `null` when every value is null |
| `RowGroupAggregator` | `result(state)` | Receives every value, a missing one as `null` |

Every group folds its own leaves, so a parent `avg` is the average of its
leaves, not of its children's averages. The total row folds every filtered leaf.

```ts
import type { CellValue, RowGroupAggregator } from "@gp-grid/core";

const distinct: RowGroupAggregator<Set<CellValue>> = {
  init: () => new Set(),
  add: (seen, value) => (value === null ? seen : seen.add(value)),
  result: (seen) => seen.size,
  merge: (into, from) => {
    for (const value of from) into.add(value);
    return into;
  },
};

createRowGrouping({
  dimensions: [{ field: "country" }],
  measures: [{ field: "city", aggregate: distinct }],
});
```

- `init()` must return a fresh state on every call: each group's state is
  retained for later refolds.
- `merge(into, from)` is optional. With it a parent combines its children's
  states instead of rereading their leaves. It must leave `from` intact, because
  a child's state is merged again by every later refold of its parent. Every
  built-in has one.

A group or total row answers `null` for a column that is not a measure `field`.
Numeric aggregates are displayed unrounded (an `avg` can print many decimals):
give the measure's column a `valueFormatter` that rounds.

## The label column and group cells

The label column is `groupLabelColumn` when that column is displayed, else the
first displayed column (`resolveGroupLabelColumnId(layout, preferred?)`). On a
group or total row its cell holds the expander and the label; on every row of a
hierarchy it is indented by the row's depth.

The label is `formatGroupLabel(row, columns, labels)`: the key through the
`valueFormatter` of the column whose `field` is the dimension's field,
`labels.blanks` for the null bucket, placed in `labels.rowGroups.label`
(`"{value} ({count})"`, `{count}` being the group's records). The total row
prints `labels.rowGroups.grandTotal` (`"Grand total"`, token `{count}`). With a
`toKey` the formatter receives the key, not a raw value.

`groupLabelRenderer` replaces the label text, beside the expander. It receives
`GroupLabelRendererParams = { row, viewIndex, label, toggle }`: `row` is the
`HierarchyGroupRow` or `HierarchyTotalRow`, `label` the formatted text, and
`toggle()` flips the group as a gesture (a no-op on the total row).

| | React | Vue | Angular |
|---|---|---|---|
| Label column | `groupLabelColumn` prop | `groupLabelColumn` prop | `groupLabelColumn` input |
| Label renderer | `ReactGroupLabelRenderer` | `VueGroupLabelRenderer` (function or component) | `GroupLabelRendererTemplate` (`TemplateRef<{ $implicit: GroupLabelRendererParams }>`) |

```tsx
// React
<Grid columns={columns} rowData={rows} rowHeight={32} rowGrouping={grouping}
  groupLabelRenderer={({ row, label }) => (row.kind === "total" ? <b>{label}</b> : label)} />
```

```html
<!-- Angular -->
<ng-template #groupLabel let-params>{{ params.label }}</ng-template>
<gp-grid [columns]="columns" [rows]="rows" [rowHeight]="32"
  [rowGrouping]="grouping" [groupLabelRenderer]="groupLabel" />
```

Every other cell of a group or total row:

- **With an aggregate** it is a normal cell with the aggregate as its value. The
  column's `valueFormatter` and `cellRenderer` apply; the renderer is called
  with `rowKind: "group" | "total"` and `rowData` undefined.
- **Without one** (`null`) it renders empty and calls neither the column's
  `cellRenderer` nor the global one, and the peek does not open on it.
  `isEmptyGroupCell(rowKind, value)` makes that decision for every wrapper.

`CellRendererParams.rowKind` is `"record"` on the record rows of a hierarchy and
absent while the grid is flat, so a renderer that reads `rowData` should branch
on it.

Group and total labels are `GridLabels.rowGroups` (`label`, `grandTotal`),
merged one level deep from `labels`.

## Pointer and keyboard

| Gesture | Effect |
|---|---|
| Pointer down on the expander | Toggles the group; the cell beneath is not selected |
| Double-click on any cell of a group row | Toggles the group |
| Enter or Space with the active cell on a group row | Toggles the group |
| F2, Delete, Backspace, typing on a group or total row | Nothing |
| Double-click on a non-editable total row cell | The peek, when the cell has an aggregate |
| Arrow keys, selection, copy | Group and total rows are ordinary rows |

Nothing toggles a total row. The expander is `aria-hidden` and pointer-only;
Enter and Space are its keyboard equivalent.

`onRowGroupToggled({ rowId, expanded })` fires once per group a pointer or key
gesture toggled, the renderer's `toggle()` included. The commands
(`rowGroups.setExpanded`, `toggle`, `setGrouping`) stay silent.

## Expansion commands and state

`core.rowGroups` (`GridRowGroupsApi`):

| Command | Effect |
|---|---|
| `isActive()` | Whether a hierarchy is bound. |
| `setExpanded(ids, expanded)` | Expand or collapse the given groups; `null` targets every group. Returns `RowGroupResult`. |
| `toggle(id)` | Flip one visible group; `"unchanged"` for a hidden or unknown id. |
| `setGrouping(grouping \| null)` | Regroup the resident flat rows with no query; `null` returns to them. Returns `RowGroupingResult`. |

`RowGroupResult` is `{ status: "applied" | "unchanged" | "unsupported" }`;
`"unsupported"` means no hierarchy, a provider without `setExpanded` or a
destroyed core. `RowGroupingResult` adds
`{ status: "rejected", rejection }`.

```ts
gridRef.current?.core?.rowGroups.setExpanded(null, true); // expand all, no remount
```

A change of the view rows (a toggle, `setGrouping`, a regroup after a write) is
one batch: an open edit is committed, the row at the clip top keeps its viewport
offset, the frozen prefix is re-resolved, and the active cell stays on its row.
A collapse that hides the active cell moves it to the collapsed ancestor, in the
same column, and a row that no longer exists clears the selection. No query is
issued and unchanged records are not re-sorted.

`grouping.getState()` returns `RowGroupingState = { expanded, collapsed }`: the
group ids toggled away from `defaultExpandedDepth`. Pass it as `initialState` to
a new `createRowGrouping` to restore it. Expansion is kept by group id, so a
group that survives a filter, a sort, a transaction or a refresh keeps its
state.

## Writes

- A cell is writable when the source is writable and its row is a record row
  with a record. Group labels, aggregate cells and columnar leaves are
  read-only.
- `edit.start` on a group or total row returns `false` with no event.
- Paste and fill write the record rows and skip every group or total target,
  each reported through `onWriteRejected` with `reason: "not-a-record"`;
  `cells.setValue` on such a row reports the same reason.
- No row drag starts while a hierarchy is bound, and `rowDrag.commit` reports
  `reason: "derived-view"` with `operation: "row-move"`.
- `CellWriteRejectedEvent.reason` is
  `"read-only-source" | "not-a-record" | "derived-view"`.
- An editor commit is coerced by the column's `cellDataType`, like paste, so an
  edited `number` measure enters `sum` and `avg` as a number.
- **A measure edit** refolds the aggregates on the edited row's path, the total
  row included.
- **A dimension edit** regroups. The record moves to its group, every collapsed
  ancestor of its new position expands so it stays visible, and the active cell
  follows the record. That expansion is recorded in `getState()` and fires no
  `onRowGroupToggled`.
- Copy reads cell values, so aggregates are copied.
- `onCellValueChanged` requires `getRowId`, also when the hierarchy comes from
  the data source.

A transaction (`useGridData`, `createMutableClientDataSource`) or a refresh
rebuilds the grouping in one synchronous pass and keeps surviving expansion, the
active record and the anchor. A sort or filter change rebuilds it too and
returns to the top, as in a flat grid.

## Rejections

A grouping that cannot apply is rejected: the grid renders the source's rows,
`onRowGroupingRejected(rejection)` is called and the console warns once per
reason (`[gp-grid] rowGrouping rejected: <reason> (<field>); the grouping is not applied.`).
`RowGroupingRejection` is `{ reason, field? }`.

| `reason` | Cause |
|---|---|
| `partial-source` | Paginated loading, or a response with fewer rows than its `totalRows`. A page cache is never grouped as if it were the dataset. |
| `hierarchical-source` | The source already returned a hierarchy. That hierarchy stays bound, so the grid is not flat. |
| `unknown-field` | A dimension `field` or a measure's read field (`source ?? field`) is neither a declared column field nor a field of the columnar source. `field` names it. |
| `object-key` | An object value in a dimension without `toKey`. `field` names the dimension. |

The callback fires on every load while the rejection applies, not once per
configuration. A dimension edit that would produce `object-key` keeps the groups
it had.

## Supplying a hierarchy from a data source

An application that already holds grouped rows returns a
`HierarchicalRowAccess` as `DataSourceResponse.access`, with `rows` empty. It
imports types only: no engine, no `createRowGrouping`.

```ts
interface HierarchicalRowAccess<TData = unknown> extends RowAccess {
  readonly hierarchical: true;            // the flag the grid detects
  readonly rowCount: number;              // view rows; every index in [0, rowCount) is resident
  readonly revision?: number;
  getRowId(viewRow: number): RowId;       // cheap, unique within the hierarchy
  getRow(viewRow: number): HierarchyRow | undefined;
  getValue(viewRow: number, field: string): CellValue; // an aggregate or null on group and total rows
  locate(id: RowId): number;              // the row, its nearest visible ancestor when hidden, or -1
  setExpanded?(ids: readonly RowId[] | null, expanded: boolean): boolean; // whether view rows changed
  getRecord?(viewRow: number): TData | undefined;                         // source record of a record row
  recordsChanged?(changes: readonly HierarchyRecordChange[]): boolean;    // whether view rows moved
  release?(): void;
}

type HierarchyRow =
  | { kind: "record"; id: RowId; depth: number }
  | { kind: "group"; id: RowId; depth: number; expanded: boolean; childCount: number; leafCount: number; field: string; value: CellValue }
  | { kind: "total"; id: RowId; depth: 0; leafCount: number };
```

```ts
import type { DataSource, HierarchicalRowAccess, HierarchyRow, CellValue } from "@gp-grid/core";

interface Entry {
  row: HierarchyRow;
  values: Record<string, CellValue>;
}

const createSalesSource = (build: (expanded: ReadonlySet<string>) => Entry[]): DataSource<never> => {
  const expanded = new Set<string>();
  return {
    loadMode: "all",
    query: async () => {
      let entries = build(expanded);
      const access: HierarchicalRowAccess = {
        hierarchical: true,
        get rowCount() {
          return entries.length;
        },
        getRowId: (viewRow) => entries[viewRow]?.row.id ?? viewRow,
        getRow: (viewRow) => entries[viewRow]?.row,
        getValue: (viewRow, field) => entries[viewRow]?.values[field] ?? null,
        locate: (id) => entries.findIndex((entry) => entry.row.id === id),
        setExpanded: (ids, open) => {
          const before = expanded.size;
          for (const id of ids ?? entries.filter((e) => e.row.kind === "group").map((e) => e.row.id)) {
            if (open) expanded.add(String(id));
            else expanded.delete(String(id));
          }
          entries = build(expanded);
          return expanded.size !== before;
        },
      };
      return { rows: [], totalRows: access.rowCount, access };
    },
  };
};
```

That `locate` answers `-1` for a hidden row; a complete provider answers the
index of its nearest visible ancestor, so a collapse keeps the active cell and
the anchor on the group row.

- A capability is the presence of its method. Without `setExpanded` the
  expansion commands return `"unsupported"` and nothing toggles. Without
  `getRecord` every row is record-less and read-only. Without `recordsChanged`
  a write refreshes its own row only.
- `recordsChanged` is called once per edit commit, paste or fill, with every
  cell written (`{ viewRow, field }`, indices as of the write). `true` moves the
  view rows through the anchored batch above; `false` refreshes the mounted
  rows.
- Ids must be unique among the rows of one hierarchy and stable across queries:
  focus, the anchor, row heights and expansion follow them. Two groups with the
  same label and different ids stay distinct.
- Sort and filter reach the provider in the query request, as for any source.
  The grid does not regroup, re-aggregate or filter a supplied hierarchy, and a
  `rowGrouping` set over one is rejected with `hierarchical-source`.
- A supplied hierarchy has no flat rows for the filter popup to scan: list a
  filterable column's values in `ColumnDefinition.distinctValues`.
- A new query (a refresh, `refreshFromTransaction`, a sort or filter) replaces
  the access; the previous one is released through `release?.()`.
- Every row a hierarchy declares is resident. Placeholder rows, loading state
  per branch and paged children are not part of this contract.

`isHierarchicalRowAccess(access)` tests the flag. `rows.getViewRow(viewIndex)`
returns `ViewRow<TData>`: the `HierarchyRow` plus `viewIndex`, with `record?` on
record rows; a flat row is a record row of depth 0. `rows.getData(viewIndex)` is
`undefined` on a group or total row.

## Sorting, filtering, frozen rows and row heights

- **Sorting and filtering** work on the flat rows first; see [Order](#order).
- **Frozen rows** freeze the first `count` view rows, whatever their kind, and
  the count is re-resolved after every toggle. A top total row stays in view
  with `freezeRows: { count: 1 }`.
- **Row heights** are stored by row id. A height on a group row uses the group
  id; a height on a leaf waits while the leaf is collapsed away and is placed
  again when it returns.
- **Row drag** is disabled while a hierarchy is bound.

## DOM and accessibility

- The root is `role="treegrid"` while a hierarchy is bound
  (`GridState.hierarchical`), `role="grid"` otherwise.
- Every row of a hierarchy carries `aria-level` (`depth + 1`),
  `data-row-kind` (`record`, `group` or `total`) and `--gp-grid-group-depth`. A
  group row adds `aria-expanded` and `.gp-grid-row--group`; a total row
  `.gp-grid-row--total`.
- The label column's cell is `.gp-grid-cell--group-indent` on every row; its
  inline-start padding grows by `--gp-grid-group-indent` (default `20px`) per
  depth.
- On a group or total row the label cell is also `.gp-grid-cell--group-label`
  and holds `span.gp-grid-group-toggle[aria-hidden="true"]`
  (`.gp-grid-group-toggle--expanded` while expanded, `--none` on the total row)
  and `span.gp-grid-group-label`.
- Every cell of a group or total row is `aria-readonly="true"`.
- The expander mirrors in RTL and does not animate under
  `prefers-reduced-motion`. The visuals are `:where` rules.

A custom adapter reads the row from `ASSIGN_SLOT.row` (`SlotData.row`, absent
while flat) and the mode from `DATA_LOADED.hierarchical`
(`GridState.hierarchical`), and routes the expander through
`InputEventAdapter.groupTogglePointerDown(rowIndex, event)` or
`core.input.handleGroupToggle(rowIndex, pointerType?)`.

## Wrapper surface

| | Core | React | Vue | Angular |
|---|---|---|---|---|
| Grouping | `rowGrouping` option, `rowGroups.setGrouping` | `rowGrouping` prop | `rowGrouping` prop | `rowGrouping` input |
| Label column | `resolveGroupLabelColumnId` | `groupLabelColumn` prop | `groupLabelColumn` prop | `groupLabelColumn` input |
| Label renderer | `formatGroupLabel` | `groupLabelRenderer` prop | `groupLabelRenderer` prop | `groupLabelRenderer` input |
| Toggle event | `onRowGroupToggled` option | `onRowGroupToggled` prop | `onRowGroupToggled` prop | `(onRowGroupToggled)` output |
| Rejection | `onRowGroupingRejected` option | `onRowGroupingRejected` prop | `onRowGroupingRejected` prop | `(onRowGroupingRejected)` output |
| Commands | `core.rowGroups` | `gridRef.current.core.rowGroups` | `grid.value.core.rowGroups` | `grid.core.rowGroups` |

Every wrapper re-exports `createRowGrouping`, `isHierarchicalRowAccess` and the
contract types. Vue also exports `renderGroupLabel`, and `useGpGrid` takes
`rowGrouping`, `onRowGroupToggled` and `onRowGroupingRejected` and returns
`handleGroupTogglePointerDown(rowIndex, event)` for a custom expander. Angular
exports its label-cell parts, `GroupToggleComponent` (`span[gpGridGroupToggle]`)
and `GroupLabelComponent` (`span[gpGridGroupLabel]`).

## Server rendering

The engine reads no browser global. React and Vue create their core after
mount, so their server render is the flat shell with `role="grid"`, and the
hierarchy appears with the first client load. Angular creates its core in
`ngOnInit`, so its first load can land before serialization: its server render
may already be `role="treegrid"` with the collapsed total and group rows.

After `destroy()` the commands return `"unsupported"` and the bound hierarchy is
released.

## Limits

- The engine needs every row resident: a paginated source or a short response is
  rejected (`partial-source`).
- Every source change (a transaction, a refresh, a sort, a filter, a dimension
  edit) rebuilds the grouping in one synchronous pass over the flat rows, about
  a second at 1,000,000 object rows. Updates proportional to the change are not
  part of 1.0.
- A toggle copies no leaf and rebuilds the visible index in O(visible groups):
  under 2 ms at 1,000 groups, about 30 ms at 500,000.
- Each group's aggregate state is retained, which makes a measure edit a path
  refold (under 4 ms at 1,000,000 rows) and costs memory at very high
  cardinality.
- `rowGroups.toggle(recordId)` and other lookups of an arbitrary record id scan
  the flat rows.
- A pinned label cell inside the frozen pin layer does not get the group row's
  background.
- Not included: full-width group rows, grouping flags on `ColumnDefinition`,
  built-in date or number buckets, sticky total rows, group selection, record
  reordering in a grouped view, and remote or paged groups.
