// PRD 012 pivot fixtures and checks for `ssr-smoke.mjs` (D9, AC-012-07): the
// precomputed one is revision 1 of the conformance fixture, ids and values
// written out by hand, its schema from the core artifact's helper and no
// engine; the local one runs `createPivotSource` over the row-groups records.

import { rowGroupRows } from "./ssr-row-groups.mjs";

const MEASURES = [
  { field: "amount", aggregate: "sum" },
  { field: "count", aggregate: "count" },
];
const TUPLES = [[2024, "Q1"], [2024, "Q2"], [2025, "Q1"], [2025, "Q2"], [2025, "Q3"]];
export const PIVOT_LABEL_HEADER = "Region / City";
export const PIVOT_HEADER_HEIGHT = 32;
/** Years, quarters, then the leaves; the label column spans all three. */
export const PIVOT_BAND_HEIGHTS = [32, 32, 32];
/** The label column, 5 tuples x 2 measures, 2 row totals. */
const COLUMN_COUNT = 13;

const leafId = (year, quarter, measure) =>
  `gp-pivot:[["year","n",${year}],["quarter","s","${quarter}"]]|${measure}`;
const COLUMN_IDS = [
  "gp-pivot-label",
  ...TUPLES.flatMap(([year, quarter]) => MEASURES.map(({ field }) => leafId(year, quarter, field))),
  "gp-pivot:[]|amount",
  "gp-pivot:[]|count",
];

const ROW_IDS = {
  total: "gp-total",
  north: 'gp-group:[["region","s","North"]]',
  oslo: 'gp-group:[["region","s","North"],["city","s","Oslo"]]',
  bergen: 'gp-group:[["region","s","North"],["city","s","Bergen"]]',
  south: 'gp-group:[["region","s","South"]]',
  rome: 'gp-group:[["region","s","South"],["city","s","Rome"]]',
};

/** Values in `COLUMN_IDS` order after the label; `null` is an intersection without records. */
const VALUES = {
  [ROW_IDS.total]: [15, 2, 32, 3, 63, 4, 40, 1, 65, 3, 215, 13],
  [ROW_IDS.north]: [15, 2, 20, 2, 55, 3, 40, 1, 15, 1, 145, 9],
  [ROW_IDS.oslo]: [10, 1, 20, 2, 30, 1, null, null, 15, 1, 75, 5],
  [ROW_IDS.bergen]: [5, 1, null, null, 25, 2, 40, 1, null, null, 70, 4],
  [ROW_IDS.south]: [null, null, 12, 1, 8, 1, null, null, 50, 2, 70, 4],
  [ROW_IDS.rome]: [null, null, 12, 1, 8, 1, null, null, 50, 2, 70, 4],
};

/** Total on top, then both regions collapsed, with their row-total `amount`. */
const COLLAPSED = [
  { id: ROW_IDS.total, kind: "total", amount: 215 },
  { id: ROW_IDS.north, kind: "group", amount: 145 },
  { id: ROW_IDS.south, kind: "group", amount: 70 },
];

const REGIONS = [
  { id: ROW_IDS.north, value: "North", cities: [[ROW_IDS.oslo, "Oslo"], [ROW_IDS.bergen, "Bergen"]] },
  { id: ROW_IDS.south, value: "South", cities: [[ROW_IDS.rome, "Rome"]] },
];

const leafCountOf = (id) => VALUES[id].at(-1);

export const pivotSchema = (coreArtifact) =>
  coreArtifact.buildPivotSchema(
    TUPLES.map(([year, quarter]) => [["year", "n", year], ["quarter", "s", quarter]]),
    { measures: MEASURES, rowTotals: true, labelColumn: { headerName: PIVOT_LABEL_HEADER } },
  );

/** Region > city group rows over hand-written values; cities are childless. */
export const createPrecomputedPivot = () => {
  const expanded = new Set();
  const group = (id, depth, field, value, childCount) => ({
    kind: "group", id, depth, expanded: expanded.has(id), childCount, leafCount: leafCountOf(id), field, value,
  });
  const regionRows = (region) => {
    const head = group(region.id, 0, "region", region.value, region.cities.length);
    if (expanded.has(region.id) === false) return [head];
    return [head, ...region.cities.map(([id, city]) => group(id, 1, "city", city, 0))];
  };
  const visibleRows = () => [
    { kind: "total", id: ROW_IDS.total, depth: 0, leafCount: leafCountOf(ROW_IDS.total) },
    ...REGIONS.flatMap(regionRows),
  ];
  let rows = visibleRows();
  const indexOf = (id) => rows.findIndex((row) => row.id === id);
  const access = {
    hierarchical: true,
    revision: 1,
    get rowCount() {
      return rows.length;
    },
    getRowId: (viewRow) => rows[viewRow]?.id ?? viewRow,
    getRow: (viewRow) => rows[viewRow],
    getValue: (viewRow, columnId) => {
      const values = VALUES[rows[viewRow]?.id];
      const column = COLUMN_IDS.indexOf(columnId);
      return values === undefined || column < 1 ? null : values[column - 1];
    },
    locate: (id) => {
      const index = indexOf(id);
      if (index >= 0) return index;
      const parent = REGIONS.find((region) => region.cities.some(([city]) => city === id));
      return parent === undefined ? -1 : indexOf(parent.id);
    },
    setExpanded: (ids, open) => {
      let changed = false;
      for (const id of ids ?? REGIONS.map((region) => region.id)) {
        if (REGIONS.some((region) => region.id === id) && expanded.has(id) !== open) {
          if (open) expanded.add(id);
          else expanded.delete(id);
          changed = true;
        }
      }
      if (changed) rows = visibleRows();
      return changed;
    },
  };
  return {
    loadMode: "all",
    writable: false,
    query: async () => ({ rows: [], totalRows: access.rowCount, access }),
  };
};

const expectEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
};

/** Props every wrapper takes, Angular's inputs included. */
export const pivotGridProps = (coreArtifact) => {
  const schema = pivotSchema(coreArtifact);
  return {
    columns: schema.columns,
    columnGroups: schema.columnGroups,
    headerHeight: PIVOT_HEADER_HEIGHT,
    headerBandHeights: PIVOT_BAND_HEIGHTS,
    rowHeight: 32,
    columnLayout: "fixed",
    dataSource: createPrecomputedPivot(),
  };
};

export const checkPivotCore = async (coreArtifact) => {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("The core check must run without browser globals.");
  }
  const props = pivotGridProps(coreArtifact);
  const columnIds = props.columns.map((column) => column.colId).join(" ");
  expectEqual(columnIds, COLUMN_IDS.join(" "), "schema column ids");
  const core = new coreArtifact.GridCore(props);
  await core.initialize();
  expectEqual(core.columns.get().length, COLUMN_COUNT, "column count");
  expectEqual(core.header.getBands().count, PIVOT_BAND_HEIGHTS.length, "band count");
  expectEqual(core.rows.getCount(), COLLAPSED.length, "collapsed row count");
  COLLAPSED.forEach((expected, viewIndex) => {
    expectEqual(core.rows.getViewRow(viewIndex)?.id, expected.id, `row ${viewIndex} id`);
    expectEqual(core.cells.getFieldValue(viewIndex, "gp-pivot:[]|amount"), expected.amount, `row ${viewIndex} total`);
  });
  const north = core.rows.getViewRow(1);
  expectEqual(north?.kind, "group", "row 1 kind");
  expectEqual(north?.childCount, 2, "North childCount");
  expectEqual(core.rowGroups.toggle(ROW_IDS.north).status, "applied", "expand North");
  const oslo = core.rows.getViewRow(2);
  expectEqual(oslo?.id, ROW_IDS.oslo, "row 2 id");
  expectEqual(oslo?.childCount, 0, "Oslo childCount");
  expectEqual(coreArtifact.hierarchyRowAttributes(oslo)["aria-expanded"], undefined, "Oslo aria-expanded");
  expectEqual(core.rowGroups.toggle(ROW_IDS.oslo).status, "unchanged", "toggle Oslo");
  expectEqual(core.cells.getFieldValue(2, leafId(2024, "Q1", "amount")), 10, "Oslo 2024 Q1 amount");
  expectEqual(core.cells.getFieldValue(2, leafId(2025, "Q2", "amount")), null, "Oslo 2025 Q2 amount");
  core.destroy();
  return `${COLUMN_COUNT} columns, ${PIVOT_BAND_HEIGHTS.length} bands, total 215; North has 2 cities, Oslo is childless`;
};

const LOCAL_TOTAL_ID = "gp-pivot:[]|amount";
/** Country > city over amount bands "high" then "low", ascending; written out from the six records. */
const LOCAL_COLLAPSED = [
  { id: "gp-total", kind: "total", amount: 210, high: 150 },
  { id: 'gp-group:[["country","s","FR"]]', kind: "group", amount: 120, high: 100 },
  { id: 'gp-group:[["country","s","IT"]]', kind: "group", amount: 90, high: 50 },
];
/** The label column, 2 bands x 1 measure, 1 row total. */
const LOCAL_COLUMN_COUNT = 4;
/** The band groups and the row totals group, then the leaves. */
const LOCAL_BAND_COUNT = 2;

const encodeLocalLeaf = (band) => `gp-pivot:[["band","s","${band}"]]|amount`;

const createLocalPivot = (coreArtifact) =>
  coreArtifact.createPivotSource(coreArtifact.createClientDataSource(rowGroupRows), {
    rows: [{ field: "country" }, { field: "city" }],
    pivots: [{ field: "amount", id: "band", toKey: (value) => (value >= 40 ? "high" : "low") }],
    measures: [{ field: "amount", aggregate: "sum" }],
    rowTotals: true,
    grandTotal: "top",
  });

export const checkLocalPivotCore = async (coreArtifact) => {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("The core check must run without browser globals.");
  }
  const source = createLocalPivot(coreArtifact);
  let published = 0;
  source.subscribeSchema(() => {
    published += 1;
  });
  await source.query({ range: { startRow: 0, endRow: rowGroupRows.length } });
  const schema = source.getSchema();
  expectEqual(published, 1, "schemas published");
  const core = new coreArtifact.GridCore({
    columns: schema.columns,
    columnGroups: schema.columnGroups,
    dataSource: source,
    rowHeight: 32,
    headerHeight: PIVOT_HEADER_HEIGHT,
    columnLayout: "fixed",
  });
  await core.initialize();
  expectEqual(core.columns.get().length, LOCAL_COLUMN_COUNT, "local column count");
  expectEqual(core.header.getBands().count, LOCAL_BAND_COUNT, "local band count");
  expectEqual(core.rows.getCount(), LOCAL_COLLAPSED.length, "local collapsed row count");
  const highId = encodeLocalLeaf("high");
  LOCAL_COLLAPSED.forEach((expected, viewIndex) => {
    const row = core.rows.getViewRow(viewIndex);
    expectEqual(row?.id, expected.id, `local row ${viewIndex} id`);
    expectEqual(row?.kind, expected.kind, `local row ${viewIndex} kind`);
    expectEqual(core.cells.getFieldValue(viewIndex, LOCAL_TOTAL_ID), expected.amount, `local row ${viewIndex} total`);
    expectEqual(core.cells.getFieldValue(viewIndex, highId), expected.high, `local row ${viewIndex} high`);
  });
  core.destroy();
  const pending = source.query({ range: { startRow: 0, endRow: rowGroupRows.length } });
  source.destroy();
  const late = await pending.then(() => "resolved", (error) => error.message);
  expectEqual(late, "Superseded by a later query", "query in flight at destroy");
  expectEqual(published, 1, "schemas published after destroy");
  return `${LOCAL_COLUMN_COUNT} columns, ${LOCAL_BAND_COUNT} bands, rows total/FR/IT with row totals 210/120/90; destroy settles the pending query`;
};

/** The header root's start tag up to the body. */
const headerSection = (html) => {
  const at = html.search(/class="gp-grid-header[ "]/);
  if (at === -1) throw new Error("No server-rendered header.");
  const end = html.indexOf("gp-grid-body", at);
  return html.slice(html.lastIndexOf("<", at), end === -1 ? undefined : end);
};

/** Each serialized body row: its start tag and its markup up to the next row. */
const bodyRows = (html) => {
  const body = html.slice(html.indexOf("gp-grid-body"));
  const starts = [...body.matchAll(/<div\b[^>]*role="row"[^>]*>/g)];
  return starts.map((match, index) => ({
    tag: match[0],
    markup: body.slice(match.index, starts[index + 1]?.index),
  }));
};

/** Rows are optional: a grid is flat until its first load, which only Angular may finish before serialization. */
const expectPivotRows = (html, label) => {
  if (html.includes('role="treegrid"') === false) {
    if (html.includes("data-row-kind")) throw new Error(`${label} serialized group rows under role="grid".`);
    return "rows not loaded at serialization";
  }
  const rows = bodyRows(html);
  expectEqual(rows.length, COLLAPSED.length, `${label} body rows`);
  COLLAPSED.forEach((expected, index) => {
    const { tag, markup } = rows[index];
    expectEqual(/data-row-kind="([a-z]+)"/.exec(tag)?.[1], expected.kind, `${label} row ${index} kind`);
    const flag = /aria-expanded="([a-z]+)"/.exec(tag)?.[1];
    expectEqual(flag, expected.kind === "group" ? "false" : undefined, `${label} row ${index} aria-expanded`);
    if (markup.includes(`>${expected.amount}<`) === false) {
      throw new Error(`${label} row ${index} has no row-total amount ${expected.amount}.`);
    }
  });
  return `rows ${COLLAPSED.map((row) => row.kind).join(",")}, row totals ${COLLAPSED.map((row) => row.amount).join("/")}`;
};

/** The configured bands, the label column's header text, and the rows when they arrived. */
export const expectPivotMarkup = (html, label) => {
  if (html.includes("gp-grid-container") === false) throw new Error(`${label} grid shell was not rendered.`);
  const section = headerSection(html);
  const bandRows = [...section.matchAll(/role="row"/g)].length;
  expectEqual(bandRows, PIVOT_BAND_HEIGHTS.length, `${label} header band rows`);
  const texts = [...section.matchAll(/<span\b[^>]*class="gp-grid-header-text"[^>]*>([^<]*)</g)].map((match) => match[1]);
  if (texts.includes(PIVOT_LABEL_HEADER) === false) throw new Error(`${label} header has no "${PIVOT_LABEL_HEADER}".`);
  return `${label}: ${bandRows} header bands, "${PIVOT_LABEL_HEADER}", ${expectPivotRows(html, label)}`;
};
