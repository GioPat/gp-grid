// playgrounds/vite-vue/src/conformance-pivot-external.ts
// A precomputed pivot (PRD 012 AC-012-07): hand-written group rows and values
// over the schema the wrapper's helper generates. It imports the helper, the
// id encoders and types only, so the arm reaches the grid without an engine.

import { buildPivotSchema, encodeGroupId, encodePivotColumnId, PIVOT_LABEL_COLUMN_ID } from "@gp-grid/vue";
import type {
  CellValue,
  ColumnLayoutMode,
  DataSource,
  DataSourceResponse,
  GridCore,
  GroupPathStep,
  HierarchicalRowAccess,
  HierarchyGroupRow,
  HierarchyRow,
  PivotMeasure,
  PivotSchema,
  PivotSchemaOptions,
  RowId,
} from "@gp-grid/vue";
import {
  PIVOT_COLUMN_IDS,
  PIVOT_LITERAL_TOTAL_ID,
  PIVOT_REGIONS,
  PIVOT_TUPLES_1,
  PIVOT_TUPLES_2,
  PIVOT_VALUES_1,
  PIVOT_VALUES_2,
  PIVOT_WIDE_KEY_COUNT,
  type PivotLiteralTable,
} from "./conformance-pivot-external-data";

export type PivotMode = "off" | "external" | "wide";

export const PIVOT_ROW_HEIGHT = 32;
export const PIVOT_HEADER_HEIGHT = 32;
/** Revision 1's bands: years, quarters, then the leaves the label column spans with them. */
export const PIVOT_BAND_HEIGHTS: readonly number[] = [32, 32, 32];
export const PIVOT_COLUMN_LAYOUT: ColumnLayoutMode = "fixed";
export { PIVOT_LABEL_COLUMN_ID };

const MEASURES: readonly PivotMeasure[] = [
  { field: "amount", aggregate: "sum" },
  { field: "count", aggregate: "count" },
];

const schemaOptions = (rowTotals: boolean): PivotSchemaOptions =>
  ({ measures: MEASURES, rowTotals, labelColumn: { headerName: "Region / City" } });

const yearStep = (year: number): GroupPathStep => ["year", "n", year];

const tuplesOf = (revision: number): GroupPathStep[][] => {
  if (revision === 1) return PIVOT_TUPLES_1.map(([year, quarter]) => [yearStep(year), ["quarter", "s", quarter]]);
  return PIVOT_TUPLES_2.map(([year]) => [yearStep(year)]);
};

const wideKey = (index: number): string => `k${index.toString().padStart(4, "0")}`;

const wideTuples = (): GroupPathStep[][] =>
  Array.from({ length: PIVOT_WIDE_KEY_COUNT }, (_, index) => [["key", "s", wideKey(index)]]);

export const pivotSchemaFor = (mode: PivotMode, revision: number): PivotSchema => {
  if (mode === "wide") return buildPivotSchema(wideTuples(), schemaOptions(false));
  return buildPivotSchema(tuplesOf(revision), schemaOptions(true));
};

interface PivotGroup {
  id: string;
  depth: number;
  field: string;
  value: string;
  cities: PivotGroup[];
}

const regionStep = (region: string): GroupPathStep => ["region", "s", region];

const GROUPS: readonly PivotGroup[] = PIVOT_REGIONS.map(({ region, cities }) => ({
  id: encodeGroupId([regionStep(region)]),
  depth: 0,
  field: "region",
  value: region,
  cities: cities.map((city) => ({
    id: encodeGroupId([regionStep(region), ["city", "s", city]]),
    depth: 1,
    field: "city",
    value: city,
    cities: [],
  })),
}));

const ROW_ORDER: readonly string[] = [
  PIVOT_LITERAL_TOTAL_ID,
  ...GROUPS.flatMap((group) => [group.id, ...group.cities.map((city) => city.id)]),
];

type ValueReader = (rowId: string, columnId: string) => CellValue;

const tableReader = (table: PivotLiteralTable): ValueReader =>
  (rowId, columnId) => table[rowId]?.[columnId] ?? null;

/** Deterministic small integers per key and row. */
const createWideReader = (): ValueReader => {
  const columns = new Map<string, { index: number; measure: string }>();
  for (let index = 0; index < PIVOT_WIDE_KEY_COUNT; index += 1) {
    for (const { field } of MEASURES) columns.set(encodePivotColumnId([["key", "s", wideKey(index)]], field), { index, measure: field });
  }
  return (rowId, columnId) => {
    const column = columns.get(columnId);
    const ordinal = ROW_ORDER.indexOf(rowId);
    if (column === undefined || ordinal < 0) return null;
    return column.measure === "count" ? ordinal + 1 : (column.index % 7) + ordinal + 1;
  };
};

const tableOf = (revision: number): PivotLiteralTable => (revision === 1 ? PIVOT_VALUES_1 : PIVOT_VALUES_2);

const leafCountOf = (table: PivotLiteralTable, rowId: string): number =>
  Number(table[rowId]?.[PIVOT_COLUMN_IDS.totalCount] ?? 0);

interface FixtureState {
  mode: PivotMode;
  revision: number;
  queries: number;
  /** Revision of the access the grid read last. */
  shown: number;
  holdNext: boolean;
  release: (() => void) | null;
  readonly expanded: Set<RowId>;
}

const groupRow = (group: PivotGroup, state: FixtureState, table: PivotLiteralTable): HierarchyGroupRow => ({
  kind: "group",
  id: group.id,
  depth: group.depth,
  expanded: state.expanded.has(group.id),
  childCount: group.cities.length,
  leafCount: leafCountOf(table, group.id),
  field: group.field,
  value: group.value,
});

const visibleRows = (state: FixtureState, table: PivotLiteralTable): HierarchyRow[] => {
  const rows: HierarchyRow[] = [
    { kind: "total", id: PIVOT_LITERAL_TOTAL_ID, depth: 0, leafCount: leafCountOf(table, PIVOT_LITERAL_TOTAL_ID) },
  ];
  for (const region of GROUPS) {
    rows.push(groupRow(region, state, table));
    if (state.expanded.has(region.id)) rows.push(...region.cities.map((city) => groupRow(city, state, table)));
  }
  return rows;
};

const parentOf = (id: RowId): PivotGroup | undefined =>
  GROUPS.find((group) => group.cities.some((city) => city.id === id));

const createAccess = (revision: number, state: FixtureState): HierarchicalRowAccess => {
  const table = tableOf(state.mode === "wide" ? 1 : revision);
  const read = state.mode === "wide" ? createWideReader() : tableReader(table);
  let rows = visibleRows(state, table);
  const indexOf = (id: RowId): number => rows.findIndex((row) => row.id === id);

  return {
    hierarchical: true,
    revision,
    get rowCount() {
      return rows.length;
    },
    getRowId: (viewRow) => rows[viewRow]?.id ?? viewRow,
    getRow: (viewRow) => {
      state.shown = revision;
      return rows[viewRow];
    },
    getValue: (viewRow, columnId) => {
      const row = rows[viewRow];
      return row === undefined ? null : read(String(row.id), columnId);
    },
    locate: (id) => {
      const index = indexOf(id);
      if (index >= 0) return index;
      const parent = parentOf(id);
      return parent === undefined ? -1 : indexOf(parent.id);
    },
    // Cities are terminal: only a region opens or closes.
    setExpanded: (ids, open) => {
      let changed = false;
      for (const id of ids ?? GROUPS.map((group) => group.id)) {
        const known = GROUPS.some((group) => group.id === id);
        if (known && state.expanded.has(id) !== open) {
          if (open) state.expanded.add(id);
          else state.expanded.delete(id);
          changed = true;
        }
      }
      if (changed) rows = visibleRows(state, table);
      return changed;
    },
  };
};

/** A held query answers the revision current when it was issued. */
const createSource = (state: FixtureState): DataSource<never> => ({
  loadMode: "all",
  writable: false,
  query: () => {
    state.queries += 1;
    const issued = state.revision;
    const answer = (): DataSourceResponse<never> => {
      const access = createAccess(issued, state);
      return { rows: [], totalRows: access.rowCount, access };
    };
    if (state.holdNext === false) return Promise.resolve(answer());
    state.holdNext = false;
    return new Promise((resolve) => {
      state.release = () => resolve(answer());
    });
  },
});

const columnIdsOf = (core: GridCore<unknown>): string[] =>
  core.columns.get().map((column) => column.colId ?? column.field);

export interface PivotHooks {
  queryCount: () => number;
  pivotRevision: () => number | null;
}

export const createPivotFixture = () => {
  const state: FixtureState = {
    mode: "off",
    revision: 1,
    queries: 0,
    shown: 0,
    holdNext: false,
    release: null,
    expanded: new Set(),
  };
  let source: DataSource<never> | undefined;

  return {
    /** A fresh source at revision 1; the shell mounts the returned schema. */
    arm: (mode: PivotMode): PivotSchema => {
      Object.assign(state, { mode, revision: 1, queries: 0, shown: 0, holdNext: false, release: null });
      state.expanded.clear();
      source = createSource(state);
      return pivotSchemaFor(mode, 1);
    },
    source: (): DataSource<never> | undefined => source,
    /** Revision 2 from the next query on; the shell applies the returned schema through its props. */
    replaceRevision: (core: GridCore<unknown>): PivotSchema => {
      state.revision = 2;
      void core.refreshFromTransaction();
      return pivotSchemaFor(state.mode, 2);
    },
    refresh: (core: GridCore<unknown>): void => {
      void core.refreshFromTransaction();
    },
    holdNext: (): void => {
      state.holdNext = true;
    },
    release: (): void => {
      const release = state.release;
      state.release = null;
      release?.();
    },
    pinLabel: (core: GridCore<unknown>): void => {
      core.columns.setPinned(PIVOT_LABEL_COLUMN_ID, "start");
    },
    /** 2025 Q1 `amount` lands inside 2024 Q2, just before its `count`, so 2024 and 2025 each split in two. */
    moveLeaf: (core: GridCore<unknown>): void => {
      const ids = columnIdsOf(core);
      core.columns.move(ids.indexOf(PIVOT_COLUMN_IDS.q2025q1Amount), ids.indexOf(PIVOT_COLUMN_IDS.q2024q2Count));
    },
    setTotalWidth: (core: GridCore<unknown>): void => {
      core.columns.setState([{ columnId: PIVOT_COLUMN_IDS.totalAmount, width: 200 }]);
    },
    /** `queryCount` answers the pivot's queries once it is armed, the row groups' otherwise. */
    createHooks: (getCore: () => GridCore<unknown> | null | undefined, inner: { queryCount: () => number }): PivotHooks => ({
      queryCount: () => (state.mode === "off" ? inner.queryCount() : state.queries),
      pivotRevision: () => {
        const core = getCore();
        if (state.mode === "off" || !core) return null;
        core.rows.getViewRow(0);
        return state.shown;
      },
    }),
  };
};

export type PivotFixture = ReturnType<typeof createPivotFixture>;
