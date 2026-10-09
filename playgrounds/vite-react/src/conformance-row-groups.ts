// playgrounds/vite-react/src/conformance-row-groups.ts
// Row grouping conformance fixture (PRD 008): the engine arms over object,
// columnar and paged rows, the external arm, their controls and hooks.

import {
  createClientDataSource,
  createColumnarDataSource,
  createRowGrouping,
  createServerDataSource,
} from "@gp-grid/react";
import type {
  CellValue,
  CellWriteRejectedEvent,
  ColumnDefinition,
  ColumnLayoutMode,
  DataSource,
  GridCore,
  RowGrouping,
  RowGroupingRejection,
  RowGroupResult,
  RowGroupToggledEvent,
  RowId,
  RowLoadingOptions,
} from "@gp-grid/react";
import {
  createExternalColumns,
  createExternalHierarchy,
  EXTERNAL_LABEL_COLUMN,
} from "./conformance-row-groups-external";

export type RowGroupsMode = "off" | "object" | "columnar" | "external" | "paged";
export type RowGroupsColumnsVariant = "base" | "formatted" | "replaced";

export const ROW_GROUPS_ROW_HEIGHT = 32;
export const ROW_GROUPS_HEADER_HEIGHT = 36;
export const ROW_GROUPS_COLUMN_LAYOUT: ColumnLayoutMode = "fixed";
export const ROW_GROUPS_ROW_COUNT = 1000;
export const ROW_GROUPS_PAGE_SIZE = 100;
/** `tall-leaf` sets this leaf, the first of IT / City 0, to 64 px. */
export const ROW_GROUPS_TALL_LEAF_ID = 0;
export const ROW_GROUPS_TALL_HEIGHT = 64;
export const ROW_GROUPS_LABEL_COLUMN = "country";
/** Cell renderer key the shells register: it prints `rowKind` as `data-probe-kind`; `name` has no aggregate. */
export const ROW_KIND_PROBE = "rowKindProbe";

/** Index 4 of the cycle leaves `country` out of the record. */
const COUNTRY_CYCLE: readonly (string | null)[] = ["IT", "FR", "", null];
const CYCLE_LENGTH = 5;

export interface RowGroupsRecord {
  id: number;
  country?: string | null;
  city: string;
  name: string;
  amount: number;
  score: number;
}

export const createRowGroupsRecords = (): RowGroupsRecord[] =>
  Array.from({ length: ROW_GROUPS_ROW_COUNT }, (_, index) => {
    const record: RowGroupsRecord = {
      id: index,
      city: `City ${index % 3}`,
      name: `Name ${index.toString().padStart(3, "0")}`,
      amount: (index % 7) + 1,
      score: index % 10,
    };
    const slot = index % CYCLE_LENGTH;
    if (slot < COUNTRY_CYCLE.length) record.country = COUNTRY_CYCLE[slot];
    return record;
  });

const createEngineColumns = (formatted: boolean): ColumnDefinition[] => [
  {
    colId: "country",
    field: "country",
    headerName: "Country",
    width: 180,
    cellDataType: "text",
    editable: true,
    valueFormatter: formatted ? (value: CellValue) => `Country ${String(value)}` : undefined,
  },
  { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
  { colId: "name", field: "name", headerName: "Name", width: 140, cellDataType: "text", editable: true, cellRenderer: ROW_KIND_PROBE },
  { colId: "amount", field: "amount", headerName: "Amount", width: 120, cellDataType: "number", editable: true },
  { colId: "score", field: "score", headerName: "Score", width: 100, cellDataType: "number", cellRenderer: ROW_KIND_PROBE },
];

const createGrouping = (): RowGrouping =>
  createRowGrouping({
    dimensions: [{ field: "country" }, { field: "city" }],
    measures: [
      { field: "amount", aggregate: "sum" },
      { field: "score", aggregate: "avg" },
    ],
    grandTotal: "top",
  });

/** The same rows as borrowed arrays; a missing `country` stays a hole. */
const createColumnarRows = (records: readonly RowGroupsRecord[]) => {
  const country = new Array<CellValue>(records.length);
  for (const record of records) {
    if ("country" in record) country[record.id] = record.country ?? null;
  }
  const column = (field: "city" | "name" | "amount" | "score") => records.map((record) => record[field]);
  return createColumnarDataSource({
    rowCount: records.length,
    getRowId: (row) => records[row]!.id,
    fields: [
      { field: "id", data: records.map((record) => record.id) },
      { field: "country", data: country },
      { field: "city", data: column("city") },
      { field: "name", data: column("name") },
      { field: "amount", data: column("amount") },
      { field: "score", data: column("score") },
    ],
  });
};

/** The 006 paged recipe over the same rows: a paginated load, never complete. */
const createPagedRows = (records: readonly RowGroupsRecord[]) =>
  createServerDataSource<RowGroupsRecord>(async (request) => ({
    rows: records.slice(request.range.startRow, request.range.endRow),
    totalRows: records.length,
  }));

const countQueries = <T>(source: DataSource<T>, onQuery: () => void): DataSource<T> => ({
  ...source,
  query: (request) => {
    onQuery();
    return source.query(request);
  },
});

interface ArmedSource {
  source: DataSource<never>;
  queries: () => number;
  replaceRevision?: () => void;
}

const createArmedSource = (mode: RowGroupsMode, records: RowGroupsRecord[]): ArmedSource | null => {
  if (mode === "off") return null;
  if (mode === "external") return createExternalHierarchy();
  let queries = 0;
  const count = () => {
    queries += 1;
  };
  const sources = {
    object: () => createClientDataSource(records, { useWorker: false }),
    columnar: () => createColumnarRows(records),
    paged: () => createPagedRows(records),
  };
  const source = countQueries(sources[mode]() as DataSource<RowGroupsRecord>, count);
  return { source: source as DataSource<never>, queries: () => queries };
};

export interface RowGroupsArm {
  columns: ColumnDefinition[];
  grouping: RowGrouping | null;
}

export interface ViewRowSnapshot {
  index: number;
  kind: string;
  id: RowId;
  depth: number;
  expanded: boolean | null;
  value: CellValue;
  leafCount: number | null;
  values: Record<string, CellValue>;
}

export interface RowGroupEventCounts {
  groupToggled: number;
  writeRejected: Record<string, number>;
}

export interface RowGroupsHooks {
  viewRows: () => ViewRowSnapshot[];
  setExpanded: (ids: RowId[] | null, expanded: boolean) => RowGroupResult["status"] | null;
  lastGroupingRejection: () => RowGroupingRejection | null;
  queryCount: () => number;
  /** The engine arms' records, as the grid wrote them. */
  rowGroupsRecords: () => RowGroupsRecord[];
}

const snapshotRow = (core: GridCore<unknown>, index: number, fields: readonly string[]): ViewRowSnapshot | null => {
  const row = core.rows.getViewRow(index);
  if (row === undefined) return null;
  const values: Record<string, CellValue> = {};
  for (const field of fields) values[field] = core.cells.getFieldValue(index, field);
  return {
    index,
    kind: row.kind,
    id: row.id,
    depth: row.depth,
    expanded: row.kind === "group" ? row.expanded : null,
    value: row.kind === "group" ? row.value : null,
    leafCount: row.kind === "record" ? null : row.leafCount,
    values,
  };
};

export const createRowGroupsFixture = () => {
  let mode: RowGroupsMode = "off";
  let records = createRowGroupsRecords();
  let armed: ArmedSource | null = null;
  let rejection: RowGroupingRejection | null = null;
  let counts: RowGroupEventCounts = { groupToggled: 0, writeRejected: {} };

  const columnsFor = (target: RowGroupsMode, variant: RowGroupsColumnsVariant): ColumnDefinition[] => {
    if (target === "external") return createExternalColumns(variant === "replaced");
    return createEngineColumns(variant === "formatted");
  };

  return {
    /** Fresh rows, source and grouping for the arm the shell is about to mount. */
    arm: (next: RowGroupsMode): RowGroupsArm => {
      mode = next;
      records = createRowGroupsRecords();
      armed = createArmedSource(next, records);
      rejection = null;
      const grouping = next === "external" || next === "off" ? null : createGrouping();
      return { columns: columnsFor(next, "base"), grouping };
    },
    columnsFor,
    source: (): DataSource<never> | undefined => armed?.source,
    rowLoading: (): RowLoadingOptions | undefined =>
      mode === "paged" ? { cache: { pageSize: ROW_GROUPS_PAGE_SIZE, prefetchPages: 0 } } : undefined,
    labelColumn: (): string => (mode === "external" ? EXTERNAL_LABEL_COLUMN : ROW_GROUPS_LABEL_COLUMN),
    expandAll: (core: GridCore<unknown>): void => {
      core.rowGroups.setExpanded(null, true);
    },
    collapseAll: (core: GridCore<unknown>): void => {
      core.rowGroups.setExpanded(null, false);
    },
    tallLeaf: (core: GridCore<unknown>): void =>
      core.rowHeights.set([{ rowId: ROW_GROUPS_TALL_LEAF_ID, height: ROW_GROUPS_TALL_HEIGHT }]),
    /** The external source answers new values without its first group; the active row follows its id. */
    replaceRevision: (core: GridCore<unknown>): Promise<void> => {
      armed?.replaceRevision?.();
      return core.refreshFromTransaction();
    },
    recordToggle: (_event: RowGroupToggledEvent): void => {
      counts.groupToggled += 1;
    },
    recordRejection: (next: RowGroupingRejection): void => {
      rejection = next;
    },
    recordWriteRejected: (event: CellWriteRejectedEvent): void => {
      counts.writeRejected[event.reason] = (counts.writeRejected[event.reason] ?? 0) + 1;
    },
    eventCounts: (): RowGroupEventCounts => ({
      groupToggled: counts.groupToggled,
      writeRejected: { ...counts.writeRejected },
    }),
    resetEventCounts: (): void => {
      counts = { groupToggled: 0, writeRejected: {} };
    },
    createHooks: (getCore: () => GridCore<unknown> | null | undefined): RowGroupsHooks => ({
      viewRows: () => {
        const core = getCore();
        if (!core) return [];
        const fields = core.columns.get().map((column) => column.field);
        const rows: ViewRowSnapshot[] = [];
        for (let index = 0; index < core.rows.getCount(); index += 1) {
          const row = snapshotRow(core, index, fields);
          if (row !== null) rows.push(row);
        }
        return rows;
      },
      setExpanded: (ids, expanded) => getCore()?.rowGroups.setExpanded(ids, expanded).status ?? null,
      lastGroupingRejection: () => rejection,
      queryCount: () => armed?.queries() ?? 0,
      rowGroupsRecords: () => records.map((record) => ({ ...record })),
    }),
  };
};

export type RowGroupsFixture = ReturnType<typeof createRowGroupsFixture>;
