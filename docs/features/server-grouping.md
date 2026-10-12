# Server grouping

A server grouping source shows a grouped view of a dataset that stays on a
server. The grid asks an application service for the children of one group at a
time, one page at a time, and never downloads the leaves of a collapsed group.
The server owns membership, order, filtering and aggregates; the grid computes
none of them.

Use it when the rows do not fit in the browser, or when the grouping belongs to
the server. When every row is already resident, use the local engine
([`createRowGrouping`](./row-grouping.md)). When the application already holds
the grouped rows, return a
[`HierarchicalRowAccess`](./row-grouping.md#supplying-a-hierarchy-from-a-data-source)
from its own source.

`createServerGroupingSource(service, config)` returns a `DataSource`. Every
query builds a *view*: a `HierarchicalRowAccess` over the loaded group nodes and
counted gaps. The grid binds it like any supplied hierarchy, so group rows, the
label column, the expansion commands, frozen rows, row heights and the DOM are
those of [row grouping](./row-grouping.md). An application that groups on the
server bundles none of the local engine.

`@gp-grid/core` owns geometry, focus and the scroll anchor; the view owns the row
index, the placeholders and the page budget; the service owns the data. A
wrapper renders what the core publishes.

## Configuration

```ts
import { createServerGroupingSource } from "@gp-grid/core"; // or any wrapper package

const source = createServerGroupingSource(service, {
  dimensions: [{ field: "country" }, { field: "city" }],
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "score", aggregate: "avg" },
  ],
  getRowId: (row) => row.id,
  grandTotal: "top",
});
```

| `ServerGroupingConfig<TData>` | Default | Meaning |
|---|---|---|
| `dimensions` | required | Ordered `{ field, id? }`. `id` defaults to `field`, names the level in paths and ids, and must be unique. |
| `measures` | none | `{ field, source?, aggregate }`, sent to the service as is. `aggregate` is a name the server understands; the local engine's are `"sum"`, `"count"`, `"avg"`, `"min"` and `"max"`. Group and total rows show the result under `field`. |
| `getRowId` | required | `(row) => RowId`: the id of a leaf record. |
| `defaultExpandedDepth` | `0` | Groups of a depth below it start expanded; `0` collapses every group. |
| `grandTotal` | none | `"top"` or `"bottom"` adds one total row, filled by the root response's `totals`. |
| `initialState` | none | A `RowGroupingState`, from `getState()` or built from ids (see [Keys, paths and ids](#keys-paths-and-ids)). |
| `cache` | `pageSize` 100, `"balanced"` | `RowCacheOptions`; see [Budgets](#budgets). |
| `maxConcurrentRequests` | `4` | Requests in flight at once. |
| `writable` | `false` | Lets the grid write leaf cells; see [Refresh and writes](#refresh-and-writes). |

There is no `toKey` and no custom aggregator: the server buckets and folds.
Creation throws `RangeError("Invalid serverGrouping.<field>: <value>")` for no
dimension, a repeated dimension id, a repeated measure field, a negative
`defaultExpandedDepth`, a missing `getRowId` or a `maxConcurrentRequests` that is
not positive.

`ServerGroupingSource<TData>` is a `DataSource<TData>`:

| Member | Meaning |
|---|---|
| `loadMode` | `"all"`: the grid loads it with one query, like any source that returns a hierarchy. |
| `writable` | From the configuration. |
| `query(request)` | Releases the current view, sends the root request and resolves with the new view as `access` and `rows: []`. The grid calls it. |
| `getState()` | The expansion by id, kept across queries. |
| `destroy()` | Releases the current view. |

One source serves one grid: every query releases the view of the query before.
Keep it referentially stable (a module constant, `useMemo`, a `shallowRef`, a
class field). A new source is a new data source and starts from its
`initialState`.

Every wrapper re-exports `createServerGroupingSource`, `encodeGroupId`,
`decodeGroupId`, `HierarchyChange` and the service types. The source goes in as
`dataSource`; there are no new props.

```tsx
// React
<Grid columns={columns} dataSource={source} rowHeight={32} groupLabelColumn="country" />
```

```vue
<!-- Vue -->
<GpGrid :columns="columns" :data-source="source" :row-height="32" group-label-column="country" />
```

```html
<!-- Angular -->
<gp-grid [columns]="columns" [dataSource]="source" [rowHeight]="32" groupLabelColumn="country" />
```

```ts
// Core
const core = new GridCore({ columns, dataSource: source, rowHeight: 32 });
```

Do not also set `rowGrouping`: over this source it is rejected with
`hierarchical-source`, as over any supplied hierarchy, and the server's groups
stay. `groupLabelColumn`, `groupLabelRenderer`, `onRowGroupToggled`,
`core.rowGroups` and the labels work as in [row grouping](./row-grouping.md).

## The service

```ts
interface ServerGroupingService<TData> {
  fetchChildren(request: ServerGroupChildrenRequest): Promise<ServerGroupChildrenResponse>;
  fetchLeaves(request: ServerLeavesRequest): Promise<ServerLeavesResponse<TData>>;
}
```

Both methods are required. The service is in-process TypeScript: the wire
format, the transport, retries and timeouts belong to the application. The
requests carry no callbacks: paths are typed steps and aggregates are names.
What a transport must encode is in [Transport](#transport).

### Group children

`fetchChildren` asks for the immediate children of the group at `path`, or of
the root when `path` is `[]`. The children are groups of dimension
`path.length`.

| `ServerGroupChildrenRequest` | Meaning |
|---|---|
| `revision` | `null` on the root request of a new view; afterwards the revision the root response reported. |
| `grouping` | `{ dimensions, measures }` from the configuration. |
| `path` | The parent's path, `[]` for the root. |
| `range` | `{ startRow, endRow }`: the slice of the parent's children to return, counted from 0 in the requested order, `endRow` excluded, as the flat `DataSourceRequest.range`. |
| `sort` | The grid's `SortModel[]`, when set. |
| `filter` | The grid's `FilterModel`, when set. |
| `signal` | Aborted when the response can no longer be used. A service may ignore it. |

| `ServerGroupChildrenResponse` | Meaning |
|---|---|
| `revision` | The data version the answer reflects. |
| `totalCount` | The exact number of the parent's children. |
| `children` | `ServerGroupNode`s: `children[i]` is child `range.startRow + i` of the parent. |
| `totals` | The parent's own aggregates, keyed by measure field. The root's fill the total row. |

| `ServerGroupNode` | Meaning |
|---|---|
| `key` | A string, number, boolean, `null` or `Date`. It is the group row's `value`. |
| `childCount` | The exact number of immediate children: groups of the next dimension, or leaves under a group of the last one. |
| `leafCount` | The exact number of records below the group, the label's `{count}`. |
| `aggregates` | Keyed by measure field. A missing or `null` aggregate is "none", never a loading state: the cell renders empty. |

### Leaves

`fetchLeaves` asks for the records of a *terminal* group, a group of the last
dimension: `path` has one step per dimension. `ServerLeavesRequest` has the same
fields as a children request, with a numeric `revision`. The response is
`ServerLeavesResponse<TData> = { revision, totalCount, rows }`: `rows[i]` is
record `range.startRow + i` of the group's leaves, and a record's id is `getRowId(row)`. The grid
never asks for leaves at the root or under a collapsed group.

### Path steps

```ts
type GroupPathStep = readonly [
  dimensionId: string,
  tag: "z" | "s" | "n" | "b" | "d",
  key: string | number | boolean | null,
];
```

| Tag | Key | Example |
|---|---|---|
| `z` | `null`: a `null`, `undefined` or missing value | `["city", "z", null]` |
| `s` | a string | `["city", "s", "Rome"]` |
| `n` | a number; `-0` is `0` | `["year", "n", 2026]` |
| `b` | a boolean | `["active", "b", true]` |
| `d` | a date, as its timestamp in ms | `["day", "d", 1767225600000]` |

`dimensionId` is the dimension's `id ?? field`. The grid builds a step from the
node key the service returned, so a `Date` key comes back as `["d", timestamp]`
and the service matches it with `getTime()`. A non-finite number (`NaN`,
`±Infinity`) stays a number in a step.

### The order of requests

1. `query` sends the root request: `revision: null`, `path: []`,
   `range: [0, pageSize)` and the query's sort and filter. Its response sets the
   view's revision and the root's count.
2. As rows come into view, the view requests their pages: children pages under
   a group of an inner dimension, leaf pages under a terminal group. Every
   request carries the view's revision, the same sort and filter, and its own
   `signal`.

### Protocol rules

A response is checked before it touches the view. It is a *protocol error* for
its branch when:

- its `revision` differs from the view's (`Stale revision 3, expected 2`);
- `totalCount` is not a non-negative safe integer (`Invalid totalCount: -1`);
- `totalCount` differs from the parent's `childCount` (`totalCount 12 differs from the declared 11`);
- `children` or `rows` is not exactly the range clipped to `totalCount`
  (`Page too long: 101 rows for 100`, `Page too short: 9 children for 10`);
- a node key is an object that is not a `Date` (`Invalid group key at child 4`).

The checks run in that order and the first failure is the message. The root
response of a new view sets the revision and may report any count, but its
length and keys are checked. `childCount` and `leafCount` are not checked on
arrival: a wrong `childCount` sizes the expanded group's placeholders until its
own children response fails the count check.

A protocol error fails its branch like a rejected request (see
[Errors and the retry](#errors-and-the-retry)). A response that arrives after its
group collapsed, after a new query or after `destroy()` is dropped unchecked.

## Keys, paths and ids

A group row's id is `encodeGroupId(path)`. The ids are the local engine's: a
server group and a local group over the same dimension ids and keys share an id.

```ts
import { decodeGroupId, encodeGroupId } from "@gp-grid/core";

encodeGroupId([["country", "s", "Italy"], ["city", "s", "Rome"]]);
// 'gp-group:[["country","s","Italy"],["city","s","Rome"]]'
decodeGroupId('gp-group:[["country","s","Italy"]]'); // [["country", "s", "Italy"]]
decodeGroupId("r1"); // undefined: not a group id
```

| Row | Id |
|---|---|
| Group | `encodeGroupId(path)` |
| Leaf | `getRowId(record)` |
| Total | `"gp-total"` |
| Placeholder | `` `gp-pending:${position}@${parentId}` ``, `position` counting the parent's children from 0 and the root's `parentId` being `encodeGroupId([])` (`"gp-group:[]"`) |

A group row's path is `decodeGroupId(row.id)`: the path its children requests
carry. A record id must not be `"gp-total"` or start with `gp-group:` or
`gp-pending:`. To start with groups open, build `initialState` from ids:

```ts
const source = createServerGroupingSource(service, {
  dimensions: [{ field: "country" }, { field: "city" }],
  getRowId: (row) => row.id,
  initialState: {
    expanded: [
      encodeGroupId([["country", "s", "Italy"]]),
      encodeGroupId([["country", "s", "Italy"], ["city", "s", "Rome"]]),
    ],
    collapsed: [],
  },
});
```

## Placeholders and the loading row

The view counts what it has not loaded. Expanding a loaded group inserts its
`childCount` rows at once, and every row whose page has not arrived is a
*placeholder*. The view stores loaded pages and counts, not one object per
unloaded row.

- `rows.getViewRow(i)` is `undefined` and `rows.has(i)` is `false`. The
  access's `getRow` answers `undefined`, which is what makes a row a
  placeholder.
- `rows.getId(i)` is the pending id. It is deterministic, so a page that
  arrives under the scroll anchor moves nothing.
- Every cell value is `null` and `rows.getData(i)` is `undefined`.
- It takes no input: `edit.start` returns `false`, Enter, Space and a
  double-click do nothing, paste and fill report `onWriteRejected` with
  `reason: "not-a-record"`, and copy yields empty cells.
- Its slot is `loading` (`SlotData.loading`) in the frozen prefix and in the
  suffix alike, and it renders as the cell-less loading row,
  `.gp-grid-row.gp-grid-row--loading`, re-planned when its page arrives. Under
  a hierarchy that row shows a shimmering skeleton bar, drawn by the `::before`
  of `[role="treegrid"] .gp-grid-row--loading` in `:where` rules, so a theme
  restyles or removes it; `prefers-reduced-motion` stops the shimmer.
- A page arrival emits no `DATA_LOADING`, so the grid-level loading overlay only
  shows during a query.

A row height follows its id. Set a leaf's height by its record id and it is
placed when the row loads. A height set on a placeholder belongs to its pending
id, and the row loses it when it loads.

## Lazy expansion and state

Only a loaded group expands: `setExpanded`, `toggle` and the gestures act on
group rows. Expanding is synchronous: the placeholders appear at once and the
pages that come into view are requested.

Collapsing drops the group's branch: its loaded pages, its leaves and its
requests in flight, which are aborted. Expanding it again requests its pages
again. A response that arrives after its group collapsed is dropped, so it never
reopens the group.

`defaultExpandedDepth` opens groups as their pages arrive. With
`defaultExpandedDepth: 1` the groups of the first root page open at once, and
each requests its children when it comes into view. A group of a page that
loads later opens when it arrives.

`core.rowGroups.setExpanded(null, true)` opens every loaded group and sets the
expansion depth to the dimension count, so a group that loads later opens too.
Over 100,000 root groups it opens the groups of the loaded root pages; the
others open with their pages. `setExpanded(null, false)` collapses every group.

`source.getState()` returns the `RowGroupingState` of
[row grouping](./row-grouping.md#expansion-commands-and-state):
`{ expanded, collapsed, expandedDepth? }`. Expansion lives in the source, by id,
across views: after a refresh, a sort or a filter, a group the state opens
reopens when its page loads in the new view.

## Errors and the retry

A page request that rejects, or whose response is a protocol error, fails its
branch.

- Under a group, the group collapses, the collapse is recorded in `getState()`
  and its row carries the message as `error`:
  `rows.getViewRow(i)` is `{ kind: "group", expanded: false, error: "…", … }`.
  Its siblings keep their pages and expansion.
- That row gets `.gp-grid-row--error` and `data-row-error`. Its label cell's
  `title` is `labels.rowGroups.loadFailed`, default
  `"Loading failed. Expand again to retry."`, and the shipped CSS colors the
  label with `--gp-grid-error-text`
  (`:where([data-row-error] .gp-grid-cell--group-label)`).
- Expanding the group again clears `error` and requests its pages again. That is
  the retry: there is no retry command, backoff or error callback.

```ts
const labels = { rowGroups: { loadFailed: "Could not load. Expand to try again." } };
```

The root has no group row. When the root request of a query fails, `query`
rejects and the grid shows its data error (`DATA_ERROR`; the wrappers print
`labels.errorPrefix`). When a later root page fails, the grid shows the same
error until the next query, and that page stays placeholders.

## Budgets

The view keeps a bounded number of loaded pages, configured by the
`RowCacheOptions` a paged flat source uses:

| `cache` field | Default | Meaning |
|---|---|---|
| `pageSize` | `100` | Children or leaves per request. |
| `prefetchPages` | from `eviction` | Pages requested beside each page in view, within the same group. |
| `maxPages` | from `eviction` | Loaded pages kept across the view. |
| `eviction` | `"balanced"` | `"aggressive"` (prefetch 0, 1 page), `"balanced"` (1, 5) or `"conservative"` (2, 10). |

- The pages in view are *required*: every page with a row in the frozen prefix
  or the overscan window. Their prefetch neighbours are wanted too. The rows
  between the frozen prefix and a deep window are never requested.
- At most `maxConcurrentRequests` requests are in flight. Required pages start
  before prefetch pages, in view order. A queued page that stops being wanted,
  after a fast scroll, is never sent. A page in flight is never sent twice and
  a scroll does not abort it.
- Loaded pages above `max(maxPages, required pages)` are evicted, least
  recently required first. A required page is never evicted, and neither is a
  children page holding an expanded group, whose nodes carry the counts of the
  expanded rows. Eviction turns rows back into placeholders and moves no row.
- Collapsing a group is the only unload of its branch. There is no budget on
  expanded branches.
- Prefetch changes request counts. On the balanced preset, expanding a group of
  more than one page sends the page in view and the next one, and a root of more
  than `pageSize` groups sends a second root request right after the first
  load. Set `prefetchPages: 0` when a test or a log needs exact counts.

## Sort and filter

The grid forwards its sort model and filter model in every request of a view:
the root request, every children page and every leaf page carry the same `sort`
and `filter`. The grid does not sort, filter or aggregate. How the sort applies
to groups is the server's choice: the reference mock orders a dimension's groups
by key, descending when that dimension's column is sorted descending, and
orders leaves by the sort model.

A sort or filter change queries again, like any source: a new view, a root
request with `revision: null`, no page kept. Expansion survives by id.

The filter popup has no flat rows to scan: list a filterable column's values in
`ColumnDefinition.distinctValues`.

## Refresh and writes

The source is read-only by default: `rows.isWritable()` is `false`, and
`edit.start` on a leaf returns `false` and reports `onWriteRejected` with
`reason: "read-only-source"`.

With `writable: true` the grid writes leaf cells into the record the service
returned, in place. Group, total and placeholder rows stay read-only. Nothing is
sent to the server and the aggregates and groups do not change: send the change
yourself and call `refresh()` once the server accepted it. A service that
returns its own stored objects, as the in-memory mock does, sees the write in
them. `onCellValueChanged` fires with the leaf's id and needs the grid's
`getRowId`, as always.

```ts
const core = new GridCore<Sale>({
  columns,
  dataSource: source, // created with writable: true
  rowHeight: 32,
  getRowId: (row) => row.id,
  onCellValueChanged: async ({ rowId, field, newValue }) => {
    await api.updateSale(rowId, field, newValue);
    await core.refresh();
  },
});
```

`refresh()` sends a new query. The new view starts from the root page, reopens
the groups the state expands and requests the pages in view again. Under a
hierarchy `refresh()` keeps the scroll anchor and the active cell by id, as
`refreshFromTransaction()` does:

- A row the new view has at once keeps them: a group of the root page, or a
  nested group's nearest ancestor there.
- A row it cannot locate yet, such as a leaf, keeps its old index when that
  index now holds a placeholder, since the row there is unknown rather than
  gone, and the row that loads there takes the cell. With one dimension that is
  the same leaf when the order did not change. With more, the placeholder at
  that index may stand for a group whose page has not loaded, and the cell
  follows that group when its page arrives.
- Otherwise the selection is cleared and the scroll position is kept.

## Transport

The service runs in the browser. When it forwards a request to a server, three
things are not plain JSON:

- `filter` holds `Set` `selectedValues` (raw cell values, `Date`s among them)
  and `Date` condition values. `JSON.stringify` writes a `Set` as `{}`, so
  convert it to an array; a `Date` becomes its ISO string.
- A date key arrives as a `["d", timestamp]` path step and must leave as a
  `Date` node key. A key that comes back as a number is keyed as a number, so
  its group gets another id and its children another path.
- A non-finite number key stays a number in a path step, and `JSON.stringify`
  writes it as `null`.

Path steps and aggregate names travel as they are. `signal` stays on the
client: hand it to `fetch`.

```ts
import type { ServerGroupChildrenResponse, ServerGroupingService, ServerLeavesResponse } from "@gp-grid/core";

// A Set becomes an array; a Date has already become its ISO string through toJSON.
const toJson = (body: unknown): string =>
  JSON.stringify(body, (_key, value: unknown) => (value instanceof Set ? [...value] : value));

const post = async <T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: toJson(body), signal });
  if (response.ok === false) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
};

// Dimensions whose keys are dates: they leave the server as timestamps.
const DATE_FIELDS = new Set(["orderDate"]);

export const salesService: ServerGroupingService<Sale> = {
  fetchChildren: async ({ signal, ...request }) => {
    const response = await post<ServerGroupChildrenResponse>("/api/sales/groups", request, signal);
    const field = request.grouping.dimensions[request.path.length]?.field ?? "";
    if (DATE_FIELDS.has(field) === false) return response;
    const children = response.children.map((node) => ({
      ...node,
      key: typeof node.key === "number" ? new Date(node.key) : node.key,
    }));
    return { ...response, children };
  },
  fetchLeaves: ({ signal, ...request }) => post<ServerLeavesResponse<Sale>>("/api/sales/leaves", request, signal),
};
```

## The reference service

The in-memory mock is the reference implementation. This abridged version
groups by the requested dimensions, orders groups by key and leaves by the sort
model, applies values-mode filters, pages by range, counts exactly, folds the
five built-in names over numeric measures and returns `totals` at the root.

```ts
import type {
  CellValue,
  FilterModel,
  GroupPathStep,
  ServerGroupingService,
  ServerGroupingSpec,
  SortModel,
} from "@gp-grid/core";

export interface Sale {
  id: number;
  country: string;
  city: string;
  amount: number;
  score: number;
}

type Step = [tag: GroupPathStep[1], key: GroupPathStep[2]];
type Measures = ServerGroupingSpec["measures"];

const read = (row: Sale, field: string): unknown => (row as unknown as Record<string, unknown>)[field];
const isBlank = (value: unknown): boolean => value === null || value === undefined;

// The tag and key the grid writes in a path step: a date travels as its timestamp.
const stepOf = (value: unknown): Step => {
  if (isBlank(value)) return ["z", null];
  if (value instanceof Date) return ["d", value.getTime()];
  if (typeof value === "number") return ["n", value + 0];
  if (typeof value === "boolean") return ["b", value];
  return ["s", String(value)];
};
const identity = ([tag, key]: Step): string => `${tag}:${String(key)}`;
// A node key goes back as the grid's value: a Date for a "d" key.
const nodeKey = ([tag, key]: Step): CellValue => (tag === "d" ? new Date(Number(key)) : key);

// Null last; numbers and dates by value, strings by locale.
const compare = (a: unknown, b: unknown): number => {
  if (isBlank(a) || isBlank(b)) return Number(isBlank(a)) - Number(isBlank(b));
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return Number(a) - Number(b);
};

const sortRows = (rows: Sale[], sort: readonly SortModel[] = []): Sale[] =>
  rows.sort((a, b) => {
    for (const { colId, direction } of sort) {
      const order = compare(read(a, colId), read(b, colId));
      if (order !== 0 && direction !== null) return direction === "desc" ? -order : order;
    }
    return 0;
  });

// Values-mode conditions only: a record passes when every selected set holds its value.
const passes = (row: Sale, filter: FilterModel | undefined): boolean =>
  Object.entries(filter ?? {}).every(([field, model]) =>
    model.groups.every((group) =>
      group.conditions.every(
        (condition) => condition.type !== "text" || condition.selectedValues?.has(read(row, field) as CellValue) !== false,
      ),
    ),
  );

const total = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0);
const FOLDS: Record<string, (values: readonly number[]) => CellValue> = {
  sum: (values) => (values.length === 0 ? null : total(values)),
  avg: (values) => (values.length === 0 ? null : total(values) / values.length),
  count: (values) => values.length,
  min: (values) => (values.length === 0 ? null : values.reduce((a, b) => Math.min(a, b))),
  max: (values) => (values.length === 0 ? null : values.reduce((a, b) => Math.max(a, b))),
};

// Numeric measures, keyed by `field` and read from `source ?? field`.
const aggregate = (rows: readonly Sale[], measures: Measures): Record<string, CellValue> =>
  Object.fromEntries(
    measures.map(({ field, source, aggregate: name }) => {
      const values = rows.map((row) => read(row, source ?? field));
      const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return [field, FOLDS[name]?.(numbers) ?? null];
    }),
  );

export const createSalesService = (rows: readonly Sale[]): ServerGroupingService<Sale> => {
  // The data never changes, so every response reports the same revision.
  const revision = 1;

  const matching = (grouping: ServerGroupingSpec, path: readonly GroupPathStep[], filter?: FilterModel) =>
    rows.filter(
      (row) =>
        passes(row, filter) &&
        path.every(
          ([, tag, key], level) => identity(stepOf(read(row, grouping.dimensions[level]!.field))) === identity([tag, key]),
        ),
    );

  return {
    fetchChildren: async ({ grouping, path, range, sort, filter }) => {
      const field = grouping.dimensions[path.length]!.field;
      const below = grouping.dimensions[path.length + 1];
      const members = matching(grouping, path, filter);
      const buckets = new Map<string, { step: Step; rows: Sale[] }>();
      for (const row of members) {
        const step = stepOf(read(row, field));
        const bucket = buckets.get(identity(step)) ?? { step, rows: [] };
        bucket.rows.push(row);
        buckets.set(identity(step), bucket);
      }
      const direction = sort?.some((entry) => entry.colId === field && entry.direction === "desc") ? -1 : 1;
      const groups = [...buckets.values()].sort((a, b) => direction * compare(a.step[1], b.step[1]));
      return {
        revision,
        totalCount: groups.length,
        children: groups.slice(range.startRow, range.endRow).map(({ step, rows: leaves }) => ({
          key: nodeKey(step),
          childCount:
            below === undefined ? leaves.length : new Set(leaves.map((row) => identity(stepOf(read(row, below.field))))).size,
          leafCount: leaves.length,
          aggregates: aggregate(leaves, grouping.measures),
        })),
        ...(path.length === 0 && { totals: aggregate(members, grouping.measures) }),
      };
    },
    fetchLeaves: async ({ grouping, path, range, sort, filter }) => {
      const leaves = sortRows(matching(grouping, path, filter), sort);
      return { revision, totalCount: leaves.length, rows: leaves.slice(range.startRow, range.endRow) };
    },
  };
};
```

The complete mock is `packages/core/tests/server-grouping-mock.ts` with
`mock-grouping-fold.ts`. It adds the local engine's mixed-type group order,
blanks and `Date` values in values filters, any field type in the folds, and the
controls the tests use: `hold()` and `release(count?)` to interleave responses,
`failNext(kind)`, `corruptNext(kind, how)` for each protocol error,
`bumpRevision()` and a `requests` log with each signal's state.

## Server rendering and teardown

The source reads no browser global, and `AbortController` is a platform global
in browsers and Node. As for any hierarchy, React and Vue render the flat shell
on the server, and Angular's server render may already hold the group rows when
the root response arrives before serialization.

`source.destroy()` releases the current view: its requests in flight abort and
late responses are dropped. The grid releases the view it bound on `destroy()`
and handles no later notification. No wrapper destroys a source passed as
`dataSource`: call `destroy()` when you drop it.

## Limits

- Counts are exact: `totalCount`, `childCount` and `leafCount`. Estimated or
  unknown counts are not supported.
- Paging is by position range over a parent's children. Cursor-only paging is not supported.
- No pivot, drill-through or aggregate windows, and no client-side aggregation:
  the grid shows the aggregates the server sends.
- Nothing is cached across queries: a sort, a filter, a refresh or a new source
  drops every page, and only the expansion survives.
- After a refresh the active cell and the anchor follow their row by id when
  the new view has it at once; otherwise they keep their index on the
  placeholder there, which may load as another row (see
  [Refresh and writes](#refresh-and-writes)).
- Expand all opens loaded groups; the rest open as their pages arrive.
- A write changes the cached leaf only, until a refresh.
- `rows.getRecordById(id)` finds a loaded leaf through the view's `locate`. An
  unloaded leaf and a group id answer `undefined`.
- A group row shows no loading state beyond its placeholders, and a failure
  shows only as `error` and the data error.
