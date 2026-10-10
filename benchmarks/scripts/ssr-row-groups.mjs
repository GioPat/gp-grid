// PRD 008 row-grouping fixtures and checks for `ssr-smoke.mjs` (D11,
// AC-008-08). Expectations are written out from the six rows below; nothing
// here asks the engine what it should have built.

export const rowGroupColumns = [
  { colId: "country", field: "country", headerName: "Country", width: 180, cellDataType: "text" },
  { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
  { colId: "amount", field: "amount", headerName: "Amount", width: 120, cellDataType: "number" },
];

export const rowGroupRows = [
  { id: 1, country: "IT", city: "Rome", amount: 10 },
  { id: 2, country: "FR", city: "Paris", amount: 20 },
  { id: 3, country: "IT", city: "Milan", amount: 30 },
  { id: 4, country: "FR", city: "Paris", amount: 40 },
  { id: 5, country: "IT", city: "Rome", amount: 50 },
  { id: 6, country: "FR", city: "Lyon", amount: 60 },
];

/** Total on top, then FR and IT in ascending key order, both collapsed. */
const COLLAPSED = [
  { kind: "total", amount: 210 },
  { kind: "group", value: "FR", amount: 120 },
  { kind: "group", value: "IT", amount: 90 },
];
/** 1 total + 2 countries + 4 cities + 6 leaves. */
const EXPANDED_COUNT = 13;

export const createGrouping = (coreArtifact) =>
  coreArtifact.createRowGrouping({
    dimensions: [{ field: "country" }, { field: "city" }],
    measures: [{ field: "amount", aggregate: "sum" }],
    grandTotal: "top",
  });

export const createObjectSource = (coreArtifact) => coreArtifact.createClientDataSource(rowGroupRows);

export const createColumnarSource = (coreArtifact) =>
  coreArtifact.createColumnarDataSource({
    rowCount: rowGroupRows.length,
    getRowId: (row) => rowGroupRows[row].id,
    fields: [
      { field: "id", data: Int32Array.from(rowGroupRows, (row) => row.id) },
      { field: "country", data: rowGroupRows.map((row) => row.country) },
      { field: "city", data: rowGroupRows.map((row) => row.city) },
      { field: "amount", data: Float64Array.from(rowGroupRows, (row) => row.amount) },
    ],
  });

export const EXTERNAL_GROUP_IDS = ["ext:north-a", "ext:north-b"];
const EXTERNAL_TOTAL_ID = "ext:total";
const EXTERNAL_LEAVES_PER_GROUP = 3;

/** A hand-written hierarchy: a total row and two groups of three record-less rows. No engine import. */
export const createExternalSource = () => {
  const expanded = new Set();
  const groups = EXTERNAL_GROUP_IDS.map((id, group) => ({
    id,
    leaves: Array.from({ length: EXTERNAL_LEAVES_PER_GROUP }, (_value, offset) => ({
      id: `${id}:${offset}`,
      values: { country: "North", city: `Item ${group}-${offset}`, amount: (group * 3 + offset + 1) * 10 },
    })),
  }));
  const amountOf = (group) => group.leaves.reduce((sum, leaf) => sum + leaf.values.amount, 0);
  const leafRows = (group) =>
    group.leaves.map((leaf) => ({ row: { kind: "record", id: leaf.id, depth: 1 }, values: leaf.values }));
  const groupRows = (group) => {
    const open = expanded.has(group.id);
    const row = {
      kind: "group",
      id: group.id,
      depth: 0,
      expanded: open,
      childCount: group.leaves.length,
      leafCount: group.leaves.length,
      field: "country",
      value: "North",
    };
    const head = { row, values: { country: "North", amount: amountOf(group) } };
    return open ? [head, ...leafRows(group)] : [head];
  };
  const visibleRows = () => [
    {
      row: { kind: "total", id: EXTERNAL_TOTAL_ID, depth: 0, leafCount: groups.length * EXTERNAL_LEAVES_PER_GROUP },
      values: { amount: groups.reduce((sum, group) => sum + amountOf(group), 0) },
    },
    ...groups.flatMap(groupRows),
  ];
  let rows = visibleRows();
  const indexOf = (id) => rows.findIndex((entry) => entry.row.id === id);
  const setOne = (id, open) => {
    const known = groups.some((group) => group.id === id);
    if (known === false || expanded.has(id) === open) return false;
    if (open) expanded.add(id);
    else expanded.delete(id);
    return true;
  };
  const access = {
    hierarchical: true,
    revision: 1,
    get rowCount() {
      return rows.length;
    },
    getRowId: (viewRow) => rows[viewRow]?.row.id ?? viewRow,
    getRow: (viewRow) => rows[viewRow]?.row,
    getValue: (viewRow, field) => rows[viewRow]?.values[field] ?? null,
    locate: (id) => {
      const index = indexOf(id);
      if (index >= 0) return index;
      const parent = groups.find((group) => group.leaves.some((leaf) => leaf.id === id));
      return parent === undefined ? -1 : indexOf(parent.id);
    },
    setExpanded: (ids, open) => {
      const targets = ids ?? groups.map((group) => group.id);
      const changed = targets.map((id) => setOne(id, open)).includes(true);
      if (changed) rows = visibleRows();
      return changed;
    },
  };
  return {
    loadMode: "all",
    query: async () => ({ rows: [], totalRows: rows.length, access }),
  };
};

const expectEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
};

const expectNoBrowserGlobals = () => {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("The core check must run without browser globals.");
  }
};

const createCore = (coreArtifact, options) =>
  new coreArtifact.GridCore({ columns: rowGroupColumns, rowHeight: 32, columnLayout: "fixed", ...options });

const expectUnsupportedAfterDestroy = (core, groupId, grouping) => {
  core.destroy();
  const statuses = {
    setExpanded: core.rowGroups.setExpanded(null, true).status,
    toggle: core.rowGroups.toggle(groupId).status,
    setGrouping: core.rowGroups.setGrouping(grouping).status,
    ungroup: core.rowGroups.setGrouping(null).status,
  };
  for (const [command, status] of Object.entries(statuses)) {
    expectEqual(status, "unsupported", `${command} after destroy`);
  }
  expectEqual(core.rowGroups.isActive(), false, "isActive() after destroy");
};

/** `createRowGrouping` over one flat source: flat before the load, grouped after, released on destroy. */
export const checkEngineGrouping = async (coreArtifact, dataSource, label) => {
  expectNoBrowserGlobals();
  const grouping = createGrouping(coreArtifact);
  const rejections = [];
  const core = createCore(coreArtifact, {
    dataSource,
    rowGrouping: grouping,
    onRowGroupingRejected: (rejection) => rejections.push(rejection),
  });
  expectEqual(core.rowGroups.isActive(), false, `${label} isActive() before the first load`);
  await core.initialize();
  expectEqual(JSON.stringify(rejections), "[]", `${label} rejections`);
  expectEqual(core.rowGroups.isActive(), true, `${label} isActive()`);
  expectEqual(core.rows.getCount(), COLLAPSED.length, `${label} collapsed row count`);
  for (const [viewIndex, expected] of COLLAPSED.entries()) {
    const row = core.rows.getViewRow(viewIndex);
    expectEqual(row?.kind, expected.kind, `${label} row ${viewIndex} kind`);
    if (expected.value !== undefined) expectEqual(row.value, expected.value, `${label} row ${viewIndex} key`);
    expectEqual(core.cells.getFieldValue(viewIndex, "amount"), expected.amount, `${label} row ${viewIndex} sum`);
  }
  const groupId = core.rows.getViewRow(1).id;
  expectEqual(core.rowGroups.setExpanded(null, true).status, "applied", `${label} expand all`);
  expectEqual(core.rows.getCount(), EXPANDED_COUNT, `${label} expanded row count`);
  expectUnsupportedAfterDestroy(core, groupId, grouping);
  return `${label}: ${COLLAPSED.length} collapsed rows, total 210, ${EXPANDED_COUNT} expanded; unsupported after destroy`;
};

/** A hierarchy returned by the source binds with no engine and no `rowGrouping`. */
export const checkExternalHierarchy = async (coreArtifact) => {
  expectNoBrowserGlobals();
  const core = createCore(coreArtifact, { dataSource: createExternalSource() });
  expectEqual(core.rowGroups.isActive(), false, "external isActive() before the first load");
  await core.initialize();
  expectEqual(core.rowGroups.isActive(), true, "external isActive()");
  expectEqual(core.rows.getCount(), 3, "external collapsed row count");
  expectEqual(core.rows.getViewRow(0)?.kind, "total", "external row 0 kind");
  expectEqual(core.cells.getFieldValue(0, "amount"), 210, "external total");
  const [first] = EXTERNAL_GROUP_IDS;
  expectEqual(core.rows.getViewRow(1)?.id, first, "external row 1 id");
  expectEqual(core.rowGroups.toggle(first).status, "applied", "external toggle");
  expectEqual(core.rows.getCount(), 3 + EXTERNAL_LEAVES_PER_GROUP, "external expanded row count");
  expectEqual(core.rows.getViewRow(2)?.kind, "record", "external row 2 kind");
  expectEqual(core.rows.getData(2), undefined, "external record-less row data");
  expectEqual(core.cells.getFieldValue(2, "city"), "Item 0-0", "external leaf value");
  expectUnsupportedAfterDestroy(core, first, null);
  return "source hierarchy bound: total 210, a toggle adds 3 record-less rows; unsupported after destroy";
};

/** The grid is flat until its first load, so the server shell is a plain grid. */
export const expectFlatShell = (html, label) => {
  if (html.includes("gp-grid-container") === false) throw new Error(`${label} grid shell was not rendered.`);
  if (html.includes('role="grid"') === false) throw new Error(`${label} shell has no role="grid".`);
  for (const marker of ['role="treegrid"', "data-row-kind", "gp-grid-row--group", "gp-grid-cell--group-label"]) {
    if (html.includes(marker)) throw new Error(`${label} serialized ${marker} before its first load.`);
  }
  return `${label}: flat shell, role="grid", ${html.length} characters`;
};

/**
 * Angular creates its core in `ngOnInit`, so its first load can arrive before
 * serialization: the shell is flat, or it is the whole collapsed hierarchy.
 * Group markup under `role="grid"`, or a treegrid without it, would be wrong.
 */
export const expectAngularRowGroupShell = (html, label) => {
  if (html.includes('role="treegrid"') === false) return expectFlatShell(html, label);
  if (html.includes('role="grid"')) throw new Error(`${label} serialized both root roles.`);
  const kinds = [...html.matchAll(/data-row-kind="([a-z]+)"/g)].map((match) => match[1]).join(",");
  expectEqual(kinds, COLLAPSED.map((row) => row.kind).join(","), `${label} row kinds`);
  const levels = [...html.matchAll(/aria-level="(\d+)"/g)].map((match) => match[1]).join(",");
  expectEqual(levels, COLLAPSED.map(() => "1").join(","), `${label} aria-level`);
  const collapsed = [...html.matchAll(/aria-expanded="false"/g)].length;
  expectEqual(collapsed, COLLAPSED.length - 1, `${label} collapsed group rows`);
  return `${label}: first load arrived, role="treegrid" with rows ${kinds}`;
};

/** Runs one server render and fails on anything it logged as an error. */
export const renderWithoutErrors = async (render) => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    const html = await render();
    if (errors.length > 0) throw new Error(`The render logged ${errors.length} error(s): ${errors[0]}`);
    return html;
  } finally {
    console.error = original;
  }
};
