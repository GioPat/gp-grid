// playgrounds/vite-vue/src/conformance-pivot.ts
// The engine pivot arm (PRD 012): createPivotSource over a mutable client
// source, its controls and hooks. The shell applies the schema through its
// schema hook; this fixture only counts what the hook reports.

import { createMutableClientDataSource, createPivotSource, decodePivotColumnId } from "@gp-grid/vue";
import type { DataSource, GridCore, MutableDataSource, PivotConfig, PivotSource } from "@gp-grid/vue";
import { createPivotRecords, PIVOT_ADDED_RECORD, PIVOT_RECORD_COUNT, type PivotRecord } from "./conformance-pivot-data";

export const PIVOT_ENGINE_CONFIG: PivotConfig = {
  rows: [{ field: "country" }, { field: "city" }],
  pivots: [{ field: "year" }, { field: "quarter" }],
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "count", source: "id", aggregate: "count" },
  ],
  rowTotals: true,
  grandTotal: "top",
  labelColumn: { headerName: "Country / City" },
};

export const PIVOT_FIRST_AMOUNT_WIDTH = 200;

export interface EnginePivotHooks {
  queryCount: () => number;
  pivotRevision: () => number | null;
  pivotSchemaNotifications: () => number;
}

/** The first generated `amount` column in layout order; row totals have an empty path. */
const firstAmountId = (core: GridCore<unknown>): string | undefined =>
  core.columns
    .get()
    .map((column) => column.colId ?? column.field)
    .find((id) => {
      const decoded = decodePivotColumnId(id);
      return decoded !== undefined && decoded.path.length > 0 && decoded.measure === "amount";
    });

export const createEnginePivotFixture = () => {
  let armed = false;
  let queries = 0;
  let resolved = 0;
  let notifications = 0;
  let nextId = PIVOT_RECORD_COUNT;
  let inner: MutableDataSource<PivotRecord> | null = null;
  let pivot: PivotSource<PivotRecord> | null = null;
  let source: DataSource<never> | undefined;

  return {
    /** Fresh records, inner source and pivot; the shell remounts the grid over `source()`. */
    arm: (): void => {
      pivot?.destroy();
      armed = true;
      queries = 0;
      resolved = 0;
      notifications = 0;
      nextId = PIVOT_RECORD_COUNT;
      inner = createMutableClientDataSource(createPivotRecords(), {
        getRowId: (record) => record.id,
        debounceMs: 0,
        useWorker: false,
      });
      const created = createPivotSource(inner, PIVOT_ENGINE_CONFIG);
      pivot = created;
      const counted: DataSource<PivotRecord> = {
        ...created,
        query: async (request) => {
          queries += 1;
          const response = await created.query(request);
          resolved += 1;
          return response;
        },
      };
      source = counted as DataSource<never>;
    },
    pivotSource: (): PivotSource<PivotRecord> | null => pivot,
    source: (): DataSource<never> | undefined => source,
    recordNotification: (): void => {
      notifications += 1;
    },
    /** One record under a new year through the inner source, then the grid's transaction refresh. */
    addKey: async (core: GridCore<unknown>): Promise<void> => {
      if (inner === null) return;
      inner.addRows([{ id: nextId, ...PIVOT_ADDED_RECORD }]);
      nextId += 1;
      await inner.flushTransactions();
      await core.refreshFromTransaction();
    },
    sortFirstAmount: (core: GridCore<unknown>): void => {
      const id = firstAmountId(core);
      if (id !== undefined) void core.sortFilter.setSort(id, "desc");
    },
    setFirstAmountWidth: (core: GridCore<unknown>): void => {
      const id = firstAmountId(core);
      if (id !== undefined) core.columns.setState([{ columnId: id, width: PIVOT_FIRST_AMOUNT_WIDTH }]);
    },
    /** Once armed, the counters are this arm's; before, the external arm's hooks answer. */
    createHooks: (external: Omit<EnginePivotHooks, "pivotSchemaNotifications">): EnginePivotHooks => ({
      queryCount: () => (armed ? queries : external.queryCount()),
      pivotRevision: () => (armed ? resolved : external.pivotRevision()),
      pivotSchemaNotifications: () => notifications,
    }),
  };
};

export type EnginePivotFixture = ReturnType<typeof createEnginePivotFixture>;
