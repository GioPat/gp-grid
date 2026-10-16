# Pivot

A pivot shows the values of some dimensions as generated columns, with an
aggregate at every intersection of a row group and a column key. It is
read-only.

A pivot reaches the grid through the contracts it already has:

- **Rows** are a [`HierarchicalRowAccess`](./row-grouping.md#supplying-a-hierarchy-from-a-data-source):
  one group row per key at every *row dimension*, plus an optional total row.
  A group row of the last row dimension is *terminal*: it has no leaves and no
  expander. There are no record rows.
- **Columns** are ordinary column definitions. A *generated column* shows one
  measure at one *leaf tuple*, a path over every *pivot dimension*; a *row
  total* column shows one measure over every tuple. The *label column* leads
  them and holds the group label and the expander.
- **Headers** are [column groups](./column-groups.md): one group per tuple
  prefix, nested per pivot dimension, so a pivot over `year > quarter` has a
  year band, a quarter band and the leaf band.
- **A cell** is `getValue(viewRow, columnId)`. It is `null` when the
  intersection has no records and when its aggregate is `null`; both render as
  the empty group cell.

The grid learns nothing about pivoting: no new row kind, prop or renderer
parameter. The *schema* (the generated columns and their groups) goes in
through the column API and the rows through the data source, by two commands:
one frame may show the new columns over the previous rows.

## Compositions

| Composition | What the application does | Engine bundled |
|---|---|---|
| [Precomputed](#precomputed) | Computes or fetches the keys and the cells, builds the schema with `buildPivotSchema` and returns the rows from its own source | None |
| [Local](#local-engine) | Wraps a flat source that holds every record in `createPivotSource` | The pivot engine |

Every composition uses the same [ids](#ids) and the same schema helper, so the
same keys give the same columns and headers. There is no pivot over
[server grouping](./server-grouping.md)'s service: a server that computes a
pivot supplies it [precomputed](#precomputed).

## Childless group rows

A group row with `childCount` 0 is childless. Its expander is
`.gp-grid-group-toggle--none`, as on the total row, the row has no
`aria-expanded`, the label renderer's `toggle()`, a double-click, Enter and
Space do nothing, and `core.rowGroups.toggle(id)` answers `unchanged`.
`rowGroups.setExpanded(ids, …)` skips visible childless ids. Every terminal
row of a pivot is childless; `leafCount` still counts its records, which the
label prints as `{count}`.

## Ids

| Element | Id | Example |
|---|---|---|
| Label column | `PIVOT_LABEL_COLUMN_ID` | `"gp-pivot-label"` |
| Generated column | `encodePivotColumnId(path, measure)` | `gp-pivot:[["year","n",2024],["quarter","s","Q1"]]\|amount` |
| Row total | `encodePivotColumnId([], measure)` | `gp-pivot:[]\|amount` |
| Header group | `encodePivotGroupId(prefix)` | `gp-pivot-group:[["year","n",2024]]` |
| Row totals group | `encodePivotGroupId([])` | `gp-pivot-group:[]` |
| Group row | `encodeGroupId(path)` | `gp-group:[["region","s","North"]]` |
| Total row | `"gp-total"` | |

A path is a list of [`GroupPathStep`](./server-grouping.md#path-steps)s,
`[dimensionId, tag, key]`, written as JSON exactly as group ids write it: `z`
null, `s` string, `n` number, `b` boolean, `d` a date as its timestamp. A
dimension with `toKey` tags the key `toKey` returns, so a month string is an
`s` step. `decodePivotColumnId(id)` returns `{ path, measure }`, or `undefined`
for any other string; a measure field may contain `|`. A generated column's
`field` is its id.

The format is a compatibility promise from 1.0: ids depend on no label,
formatter or locale, so column state saved by id stays valid across versions
and releases. Nothing outside the grid has to build or parse one: a supplier
builds its schema with `buildPivotSchema` and answers cells through
`decodePivotColumnId`, an application stores ids as opaque strings, and a
server exchanges typed paths, never ids.

## The schema

```ts
import { buildPivotSchema, type GroupPathStep, type PivotMeasure } from "@gp-grid/core"; // or any wrapper package

const measures: PivotMeasure[] = [
  { field: "amount", aggregate: "sum", column: { width: 100 } },
  { field: "n", source: "amount", aggregate: "count", column: { headerName: "Sales" } },
];
const y = (year: number): GroupPathStep => ["year", "n", year];
const q = (quarter: string): GroupPathStep => ["quarter", "s", quarter];

const schema = buildPivotSchema(
  [[y(2024), q("Q1")], [y(2024), q("Q2")], [y(2025), q("Q1")]],
  { measures, rowTotals: true, labelColumn: { headerName: "Region / City" } },
);
// schema.columns: the label column, 3 tuples × 2 measures, 2 row totals
// schema.columnGroups: "gp-pivot-label", 2024 > (Q1, Q2), 2025 > Q1, Total
```

`buildPivotSchema(keys, options)` takes the leaf tuples in column order. The
schema is the label column, then one column per measure for each tuple in
measure order, inside one group per tuple prefix, then with `rowTotals` one
column per measure under a group headed by `rowTotalsHeader`. Without keys it is the label
column, and the row totals when asked.

| `PivotSchemaOptions` | Default | Meaning |
|---|---|---|
| `measures` | required | `PivotMeasure[]`: a [`RowGroupMeasure`](./row-grouping.md#aggregates) plus an optional `column`, a `Partial<ColumnDefinition>` over the generated column's defaults. |
| `labelColumn` | none | Overrides the label column's defaults. |
| `rowTotals` | `false` | Adds the row total columns. |
| `rowTotalsHeader` | `"Total"` | Header of the row totals group. |
| `formatKey` | see below | `(step) => string`: the header text of a tuple step. |

| Column | Defaults | Fixed |
|---|---|---|
| Label | `headerName: ""`, `width: 200`, `cellDataType: "text"` | `colId` and `field` (`"gp-pivot-label"`), `filterable: false` |
| Generated and row total | `headerName: measure.field`, `width: 120`, `cellDataType: "number"` | `colId` and `field` (the id), `editable: false`, `filterable: false` |

The default `formatKey` prints `"(Blanks)"` for a `z` step, a `d` timestamp as
its UTC date `YYYY-MM-DD`, and `String(key)` otherwise, so a schema reads the
same on the server and in every time zone. `formatKey` does not reach the row
totals header; `rowTotalsHeader` names it.

`buildPivotSchema` throws a `RangeError` when the keys cannot nest:

| Message | Cause |
|---|---|
| `Invalid pivot keys: tuple 0 is empty` | An empty tuple, whose ids would collide with the row totals |
| `Invalid pivot keys: tuple 1 has 1 steps, expected 2` | A tuple of another length than the first |
| `Invalid pivot keys: tuple 1 level 1 is "month", expected "quarter"` | A step whose dimension id differs from the first tuple's |
| `Invalid pivot keys: tuple 2 repeats an earlier prefix` | Keys not grouped by prefix, or a repeated tuple |

## Precomputed

An application that already has a pivot builds the schema from its keys and
returns its group rows as a hierarchy, with `rows: []`. It imports the helper,
the id encoders and types, and bundles no engine. A pivot a server computed
arrives the same way: the source fetches the keys and the cells and returns
them as a hierarchy with ids from the [encoders](#ids).

```ts
import {
  buildPivotSchema,
  encodeGroupId,
  encodePivotColumnId,
  type CellValue,
  type DataSource,
  type GroupPathStep,
  type HierarchicalRowAccess,
  type HierarchyRow,
} from "@gp-grid/core";

const year = (key: number): GroupPathStep => ["year", "n", key];
const schema = buildPivotSchema([[year(2024)], [year(2025)]], {
  measures: [{ field: "amount", aggregate: "sum" }],
  rowTotals: true,
});

const north = encodeGroupId([["region", "s", "North"]]);
// One row dimension, so every group row is terminal: childCount 0.
const rows: HierarchyRow[] = [
  { kind: "group", id: north, depth: 0, expanded: false, childCount: 0, leafCount: 3, field: "region", value: "North" },
];
const cells: Record<string, Record<string, CellValue>> = {
  [north]: {
    [encodePivotColumnId([year(2024)], "amount")]: 15,
    [encodePivotColumnId([year(2025)], "amount")]: 7,
    [encodePivotColumnId([], "amount")]: 22,
  },
};

const source: DataSource<never> = {
  loadMode: "all",
  query: async () => {
    const access: HierarchicalRowAccess = {
      hierarchical: true,
      rowCount: rows.length,
      getRowId: (viewRow) => rows[viewRow]?.id ?? viewRow,
      getRow: (viewRow) => rows[viewRow],
      getValue: (viewRow, columnId) => cells[String(rows[viewRow]?.id)]?.[columnId] ?? null,
      locate: (id) => rows.findIndex((row) => row.id === id),
    };
    return { rows: [], totalRows: access.rowCount, access };
  },
};
// <Grid columns={schema.columns} columnGroups={schema.columnGroups} dataSource={source} … />
```

With more row dimensions the outer group rows count their child groups and
implement `setExpanded`, as any [supplied hierarchy](./row-grouping.md#supplying-a-hierarchy-from-a-data-source).
A new revision of the pivot is a new schema through the column props and a new
query (`core.refresh()`). The conformance fixture
`playgrounds/vite-react/src/conformance-pivot-external.ts` is a complete
example with two levels, two revisions and 1,000 tuples.

## Local engine

`createPivotSource(source, config)` wraps a flat data source that holds every
record, object or columnar, and is itself a data source. Every query reads the
inner rows, builds the row groups and the tuples, folds every measure per group
and tuple, and answers a hierarchy.

```ts
import { createClientDataSource, createPivotSource, type PivotConfig } from "@gp-grid/core"; // or any wrapper package

const config: PivotConfig = {
  rows: [{ field: "region" }, { field: "city" }],
  pivots: [{ field: "year" }, { field: "quarter" }],
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "n", source: "amount", aggregate: "count", column: { headerName: "Sales" } },
  ],
  rowTotals: true,
  grandTotal: "top",
  defaultExpandedDepth: 1,
};
const source = createPivotSource(createClientDataSource(sales), config);
```

| `PivotConfig` | Default | Meaning |
|---|---|---|
| `rows` | required | `RowGroupDimension[]` (`{ field, id?, toKey? }`), outermost first. Every level is a group level; the last is terminal. |
| `pivots` | required | `RowGroupDimension[]`, outermost header band first. Their keys make the tuples. |
| `measures` | required | `PivotMeasure[]`: one generated column per tuple each, in this order. The [aggregates](./row-grouping.md#aggregates) are row grouping's: a built-in name or a `RowGroupAggregator`. |
| `domain` | none | Fixed keys of a pivot dimension, by its id; see [Domain](#domain). |
| `rowTotals` | `false` | One column per measure over every tuple. |
| `rowTotalsHeader` | `"Total"` | Header of the row totals group. |
| `grandTotal` | none | `"top"` or `"bottom"` adds the total row. |
| `defaultExpandedDepth` | `0` | Groups of a depth below it start expanded. A value past the last non-terminal level acts as that level. |
| `initialState` | none | A `RowGroupingState`, from `getState()` or built from group ids. |
| `maxColumns` | `1000` | The most generated columns a schema may have; see [Budget](#budget). |
| `labelColumn` | none | As in `PivotSchemaOptions`. |
| `formatKey` | as above | As in `PivotSchemaOptions`. |

Keys are [row grouping's](./row-grouping.md#keys-and-ids): `null` and
`undefined` share the blank key, values are keyed by type and value, a `Date`
by its timestamp, and an object needs `toKey`. A dimension's id is
`id ?? field`; group row ids and tuple steps use it.

Creation throws `RangeError("Invalid pivot.<field>: <value>")`:

| Message | Cause |
|---|---|
| `Invalid pivot.rows: []` | No row dimension |
| `Invalid pivot.pivots: []` | No pivot dimension |
| `Invalid pivot.measures: []` | No measure |
| `Invalid pivot.rows.id: city`, `Invalid pivot.pivots.id: region` | A repeated dimension id; `rows` and `pivots` share one set of ids |
| `Invalid pivot.measures.field: amount` | A repeated measure field |
| `Invalid pivot.measures.aggregate: median` | An unknown aggregate name |
| `Invalid pivot.defaultExpandedDepth: -1` | A negative or `NaN` depth |
| `Invalid pivot.maxColumns: 0` | A `maxColumns` that is not positive |
| `Invalid pivot.domain: region` | A `domain` key that is no pivot dimension id |
| `Invalid pivot.domain.year: [object Object]` | A domain value that is an object other than a `Date` |

`PivotSource<TData>` is a `DataSource<TData>`:

| Member | Meaning |
|---|---|
| `loadMode` | `"all"`. |
| `writable` | `false`. |
| `query(request)` | Pivots the inner rows and resolves with the view as `access` and `rows: []`. The grid calls it. |
| `getSchema()` | The last built schema, `null` before the first query. |
| `subscribeSchema(listener)` | Calls `listener(schema)` when a query builds a schema with other column or group ids; returns the unsubscribe. |
| `getState()` | The expansion by id, kept across queries. |
| `destroy()` | Drops the listeners and releases the view the grid holds; a later query builds a new one. |

### The query

The inner source gets `{ range: { startRow: 0, endRow: Number.MAX_SAFE_INTEGER }, filter, valueFormatters }`
from the request, and no sort. The query rejects, and the grid shows its data
error, with:

| Message | Cause |
|---|---|
| `pivot needs every row` | The inner source is paginated, or its response holds fewer rows than its `totalRows` |
| `pivot reads unknown field quarter` | A dimension or measure field (`source ?? field`) that a columnar inner source lacks |
| `pivot key of year is an object; add toKey` | An object key in a row or pivot dimension without `toKey`; names the dimension id |
| `pivot generates 8 columns, over maxColumns 7` | The schema is over budget |
| `Superseded by a later query` | A later query, or `destroy()`, came before this one resolved |

### The schema hook

A schema with other ids than the last one is passed to every listener,
synchronously, before the query that built it resolves. The application hands
it to the grid as `columns` and `columnGroups`. An unchanged schema notifies
nothing and `getSchema()` keeps the same object. Until the first query, show
`buildPivotSchema([], config)`: the label column, and the row totals when
`rowTotals` is set.

```ts
// Core
const initial = buildPivotSchema([], config);
const core = new GridCore({ columns: initial.columns, columnGroups: initial.columnGroups, dataSource: source, rowHeight: 32 });
const stop = source.subscribeSchema((schema) => core.columns.set(schema.columns, schema.columnGroups));
```

```tsx
// React
const [schema, setSchema] = useState(() => source.getSchema() ?? buildPivotSchema([], config));
useEffect(() => {
  const current = source.getSchema();
  if (current) setSchema(current);
  return source.subscribeSchema(setSchema);
}, [source]);

<Grid columns={schema.columns} columnGroups={schema.columnGroups} dataSource={source}
  rowHeight={32} groupLabelColumn={PIVOT_LABEL_COLUMN_ID} />
```

```ts
// Vue (script setup)
const schema = shallowRef(source.getSchema() ?? buildPivotSchema([], config));
const stop = source.subscribeSchema((next) => (schema.value = next));
onUnmounted(stop);
// <GpGrid :columns="schema.columns" :column-groups="schema.columnGroups" :data-source="source" … />
```

```ts
// Angular (component fields)
protected readonly source = createPivotSource(createClientDataSource(sales), config);
protected readonly schema = signal(this.source.getSchema() ?? buildPivotSchema([], config));
private readonly stop = this.source.subscribeSchema((next) => this.schema.set(next));
// ngOnDestroy(): this.stop();
// <gp-grid [columns]="schema().columns" [columnGroups]="schema().columnGroups" [dataSource]="source" … />
```

The columns and the rows still arrive by two commands, in whichever order the
wrapper applies them: one frame may show the new columns over the previous
rows. Column state follows the ids that survive a schema change (a width, a
pin, an order); an id that leaves and returns takes its definition defaults.
Do not also set `rowGrouping`: over a hierarchy it is rejected with
`hierarchical-source`.

### Domain

`domain` fixes the keys of a pivot dimension, in column order:
`domain: { quarter: ["Q1", "Q2", "Q3", "Q4"] }`.

- Every listed key appears under every parent tuple, with or without records;
  its cells are `null`. Without a domain a level has the keys found in its
  parent's records, ascending in the [group order](./row-grouping.md#order).
- Domain values are keys: `toKey` does not apply to them, `null` is the blank
  key, a `Date` is its timestamp, and a repeated value counts once.
- A record whose key is outside the domain reaches the row totals and the
  grand total only. Its group row stays, with its `leafCount`.
- A tuple left without a leaf tuple below it is dropped. A key of a level
  without a domain only exists where records have it, so an empty domain key
  of a non-last dimension is kept only when every dimension below it has a
  domain too.

### Budget

The generated columns are the leaf tuples times the measures, plus one per
measure with `rowTotals`; the label column does not count. A query whose
schema would exceed `maxColumns` rejects with
`pivot generates N columns, over maxColumns M` once the tuples are known and
before any measure is read. Domain keys without records count. 007's
[header budgets](./column-groups.md) apply to the groups as well.

### Sort and filter

The pivot orders the row groups from the request's sort model, and the inner
source gets no sort. The first entry with a direction that names one of these
decides, and the others are skipped:

| Sorted column | Order of every row level |
|---|---|
| A generated column, or a row total with `rowTotals` | By that column's value at each group; ties by key ascending |
| The label column | By key, in that direction |
| None | Keys ascending |

Values and keys of different types order as in [row grouping](./row-grouping.md#order),
and a descending sort reverses the whole order. A sort on a record field has
no column to name and is skipped.

The request's filter model reaches the inner source unchanged, so the records
are filtered before they are pivoted. Neither the generated columns nor the
label column is filterable. The grid keeps sort and filter entries only for the ids of its current columns: a
schema change drops the entries of the ids that left and queries again.

### Expansion and state

Expansion lives in the source by group id, as in
[server grouping](./server-grouping.md#lazy-expansion-and-state), and survives
every query: a refresh, a sort, a filter, a new key. Terminal groups take no
part: `setExpanded` ignores them and `setExpanded(null, true)` opens every
other group. `source.getState()` returns the
[`RowGroupingState`](./row-grouping.md#expansion-commands-and-state) to pass
back as `initialState`. `core.rowGroups`, `onRowGroupToggled`,
`groupLabelColumn` and `groupLabelRenderer` work as in row grouping.

### Read-only

Every cell is read-only: the source is not writable, every row is a group or
total row, and every generated column is `editable: false`. There is no
`getRecordById`, `moveRow` or `recordsChanged`: nothing in a pivot is a record.
The pivot does not listen to its inner source. After a change to the inner
records (a mutable source's transaction, flushed), call `core.refresh()`: the
query pivots again and notifies a changed schema.

## Server rendering and teardown

`buildPivotSchema` and the engine read no browser global. As for any
hierarchy, React and Vue render the flat shell on the server and Angular may
already render the group rows. `getSchema()` is `null` until a query
resolved: a server render shows the schema the application passes, so an
application that wants the generated headers in its HTML awaits one
`source.query(…)` first and passes `source.getSchema()`.

`source.destroy()` drops the listeners and releases the view the grid holds,
which then reads as empty; a later query builds a new view, so a React effect
cleanup may destroy a `useMemo` source and StrictMode's second mount keeps
working. No wrapper destroys a source passed as `dataSource`.

## Limits

- One value per cell: an empty intersection and a `null` aggregate are both
  `null`. A renderer that needs the difference reads the application's data.
- No retained state for an absent column: an id that leaves and returns takes
  its definition defaults.
- No incremental update: every change is a new query over every inner row.
- No leaves and no drill-through: the last row level is childless.
- No `getRecordById`; `rows.getRecordById(id)` answers `undefined`.
- The schema and the rows are not applied in one batch.
- No pivot over [server grouping](./server-grouping.md)'s service, no
  column-group collapse, field chooser or aggregate editing, and no grid over
  both `rowGrouping` and a pivot source.
- Limits beyond `maxColumns` are 007's header budgets.
