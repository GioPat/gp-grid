// playgrounds/vite-react/src/conformance-server-groups.ts
// Server grouping conformance fixture (PRD 009): 100,000 records behind the
// playground mock service, the immediate, held and frozen arms, their controls
// and hooks.

import { createServerGroupingSource } from "@gp-grid/react";
import type {
  ColumnDefinition,
  ColumnLayoutMode,
  DataSource,
  DataSourceRange,
  FreezeRowsOptions,
  GridCore,
  GroupPathStep,
  RowGroupingState,
  RowId,
  ServerGroupingSource,
} from "@gp-grid/react";
import { createMockGroupingService, type MockGroupingService } from "./server-grouping-mock";

export type ServerGroupsMode = "off" | "immediate" | "held" | "frozen";

export const SERVER_GROUPS_ROW_HEIGHT = 32;
export const SERVER_GROUPS_HEADER_HEIGHT = 36;
export const SERVER_GROUPS_COLUMN_LAYOUT: ColumnLayoutMode = "fixed";
export const SERVER_GROUPS_LABEL_COLUMN = "country";
export const SERVER_GROUPS_RECORD_COUNT = 100_000;
/** Without prefetch, so every request in the log is a page the grid showed. */
export const SERVER_GROUPS_PAGE_SIZE = 50;
/** `scroll-deep` brings this view row into view. */
export const SERVER_GROUPS_DEEP_ROW = 5_000;

const COUNTRY_COUNT = 10;
const CITY_COUNT = 100;
const FROZEN_ROWS: FreezeRowsOptions = { count: 2 };
/**
 * The frozen arm opens every group from its first load, so its two frozen rows
 * head an expanded country without an expansion above the suffix's first row,
 * which would scroll the suffix to keep that row in place.
 */
const FROZEN_EXPANDED_DEPTH = 2;

export interface ServerGroupsRecord {
  id: number;
  country: string;
  city: string;
  name: string;
  amount: number;
  score: number;
}

/** Every country holds the same 100 cities, and every city 100 records. */
export const createServerGroupsRecords = (): ServerGroupsRecord[] =>
  Array.from({ length: SERVER_GROUPS_RECORD_COUNT }, (_, index) => ({
    id: index,
    country: `Country ${index % COUNTRY_COUNT}`,
    city: `City ${String(Math.floor(index / COUNTRY_COUNT) % CITY_COUNT).padStart(2, "0")}`,
    name: `Name ${String(index).padStart(5, "0")}`,
    amount: (index % 7) + 1,
    score: index % 10,
  }));

const createColumns = (): ColumnDefinition[] => [
  { colId: "country", field: "country", headerName: "Country", width: 180, cellDataType: "text" },
  { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
  { colId: "name", field: "name", headerName: "Name", width: 140, cellDataType: "text" },
  { colId: "amount", field: "amount", headerName: "Amount", width: 120, cellDataType: "number" },
  { colId: "score", field: "score", headerName: "Score", width: 100, cellDataType: "number" },
];

const createSource = (
  service: MockGroupingService<ServerGroupsRecord>,
  mode: ServerGroupsMode,
): ServerGroupingSource<ServerGroupsRecord> =>
  createServerGroupingSource(service, {
    dimensions: [{ field: "country" }, { field: "city" }],
    measures: [
      { field: "amount", aggregate: "sum" },
      { field: "score", aggregate: "avg" },
    ],
    grandTotal: "top",
    cache: { pageSize: SERVER_GROUPS_PAGE_SIZE, maxPages: 8, prefetchPages: 0 },
    getRowId: (record) => record.id,
    defaultExpandedDepth: mode === "frozen" ? FROZEN_EXPANDED_DEPTH : 0,
  });

export interface ServerRequestSnapshot {
  kind: "children" | "leaves";
  path: readonly GroupPathStep[];
  range: DataSourceRange;
  aborted: boolean;
}

export interface ServerGroupsHooks {
  /** The mock's request log, in arrival order. */
  serverRequests: () => ServerRequestSnapshot[];
  /** The source's expansion by id. */
  rowGroupsState: () => RowGroupingState | null;
}

const firstRootGroup = (core: GridCore<unknown>): RowId | undefined => {
  for (let index = 0; index < core.rows.getCount(); index += 1) {
    const row = core.rows.getViewRow(index);
    if (row?.kind === "group" && row.depth === 0) return row.id;
  }
  return undefined;
};

export const createServerGroupsFixture = () => {
  let records: ServerGroupsRecord[] | null = null;
  const columns = createColumns();
  let mock: MockGroupingService<ServerGroupsRecord> | null = null;
  let source: ServerGroupingSource<ServerGroupsRecord> | null = null;

  return {
    /** A fresh mock and source for the arm the shell is about to mount; the held arm holds from the root request on. */
    arm: (next: ServerGroupsMode): void => {
      source?.destroy();
      records ??= createServerGroupsRecords();
      mock = createMockGroupingService(records, { getRowId: (record) => record.id });
      if (next === "held") mock.hold();
      source = createSource(mock, next);
    },
    columns: (): ColumnDefinition[] => columns,
    source: (): DataSource<never> | undefined => (source ?? undefined) as DataSource<never> | undefined,
    freezeRowsFor: (mode: ServerGroupsMode): FreezeRowsOptions | undefined =>
      mode === "frozen" ? FROZEN_ROWS : undefined,
    releaseResponses: (): void => {
      mock?.release();
    },
    failNextLeaves: (): void => {
      mock?.failNext("leaves");
    },
    collapseFirstGroup: (core: GridCore<unknown>): void => {
      const id = firstRootGroup(core);
      if (id !== undefined) core.rowGroups.setExpanded([id], false);
    },
    /** Moves the suffix scroller the way a user would; the wrapper's scroll handler does the rest. */
    scrollDeep: (core: GridCore<unknown>): void => {
      const body = document.querySelector<HTMLElement>(".gp-grid-body-scroll");
      if (body === null) return;
      const target = core.geometry.getScrollTarget(SERVER_GROUPS_DEEP_ROW, 0, {
        scrollTop: body.scrollTop,
        scrollLeft: body.scrollLeft,
      });
      if (target.scrollTop !== undefined) body.scrollTop = target.scrollTop;
    },
    createHooks: (): ServerGroupsHooks => ({
      serverRequests: () =>
        (mock?.requests ?? []).map((entry) => ({
          kind: entry.kind,
          path: entry.request.path,
          range: { startRow: entry.request.range.startRow, endRow: entry.request.range.endRow },
          aborted: entry.aborted,
        })),
      rowGroupsState: () => source?.getState() ?? null,
    }),
  };
};

export type ServerGroupsFixture = ReturnType<typeof createServerGroupsFixture>;
