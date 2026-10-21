// playgrounds/vite-react/src/conformance-writes.ts
// The writes arm (PRD 013): a mutable client source the browser edits,
// pastes into and fills; the shell hands it every write event it receives.

import { createMutableClientDataSource } from "@gp-grid/react";
import type { ColumnDefinition, DataSource, GridCore, HistoryOptions, MutableDataSource, WriteCommittedEvent } from "@gp-grid/react";

export interface WritesRecord {
  id: number;
  name: string;
  amount: number;
  note: string;
}

export const WRITES_RECORD_COUNT = 200;
export const WRITES_ROW_HEIGHT = 32;
export const WRITES_HEADER_HEIGHT = 36;
export const WRITES_HISTORY: HistoryOptions = { maxEntries: 50 };

export const WRITES_COLUMNS: ColumnDefinition[] = [
  { field: "id", headerName: "Id", cellDataType: "number", width: 80 },
  { field: "name", headerName: "Name", cellDataType: "text", width: 160, editable: true },
  { field: "amount", headerName: "Amount", cellDataType: "number", width: 120, editable: true },
  { field: "note", headerName: "Note", cellDataType: "text", width: 160, editable: true },
];

export const createWritesRecords = (): WritesRecord[] =>
  Array.from({ length: WRITES_RECORD_COUNT }, (_, index) => ({
    id: index + 1,
    name: `Name ${String(index).padStart(3, "0")}`,
    amount: (index * 7) % 100,
    note: "",
  }));

/** One write event as the spec reads it: the skips are `row:col:reason`. */
export interface WriteSummary {
  operation: string;
  changes: number;
  skipped: string[];
}

export interface WritesHooks {
  writeCommitted: () => number;
  lastWrite: () => WriteSummary | null;
  writesRecord: (id: number) => WritesRecord | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  writesQueryCount: () => number;
  appUpdate: () => Promise<void>;
  appUpdateLast: () => Promise<void>;
  appRenameFirst: () => Promise<void>;
  appAdd: () => Promise<void>;
}

export const createWritesFixture = () => {
  let inner: MutableDataSource<WritesRecord> | null = null;
  let source: DataSource<never> | undefined;
  let committed = 0;
  let last: WriteSummary | null = null;
  let queries = 0;

  const flushed = async (transact: (source: MutableDataSource<WritesRecord>) => void): Promise<void> => {
    if (inner === null) return;
    transact(inner);
    await inner.flushTransactions();
  };

  return {
    /** Fresh records and source; the shell remounts the grid over `source()`. */
    arm: (): void => {
      committed = 0;
      last = null;
      queries = 0;
      const created = createMutableClientDataSource(createWritesRecords(), {
        getRowId: (record) => record.id,
        debounceMs: 0,
        useWorker: false,
      });
      inner = created;
      const counted: DataSource<WritesRecord> = {
        ...created,
        query: (request) => {
          queries += 1;
          return created.query(request);
        },
      };
      source = counted as unknown as DataSource<never>;
    },
    source: (): DataSource<never> | undefined => source,
    recordWrite: (event: WriteCommittedEvent): void => {
      committed += 1;
      last = {
        operation: event.operation,
        changes: event.changes.length,
        skipped: event.skipped.map((skip) => `${skip.row}:${skip.col}:${skip.reason}`),
      };
    },
    /** The first record last: a sort the undo must see through. */
    sortByName: (core: GridCore<unknown>): void => {
      void core.sortFilter.setSort("name", "desc");
    },
    /** Hides every record whose name no longer contains "Name". */
    filterNames: (core: GridCore<unknown>): void => {
      void core.sortFilter.setFilter("name", "Name");
    },
    clearFilter: (core: GridCore<unknown>): void => {
      void core.sortFilter.setFilter("name", null);
    },
    /** The application's own change to the first record's amount, refreshed. */
    conflictFirst: async (core: GridCore<unknown>): Promise<void> => {
      if (inner === null) return;
      inner.updateCell(1, "amount", 999);
      await inner.flushTransactions();
      await core.refreshFromTransaction();
    },
    /** The application's own transactions; the wrapper's subscription refreshes from each result. */
    appUpdate: (): Promise<void> => flushed((source) => source.updateCell(2, "amount", 777)),
    appUpdateLast: (): Promise<void> => flushed((source) => source.updateCell(WRITES_RECORD_COUNT, "amount", 555)),
    appRenameFirst: (): Promise<void> => flushed((source) => source.updateCell(WRITES_RECORD_COUNT, "name", "Aaa")),
    appAdd: (): Promise<void> =>
      flushed((source) => source.addRows([{ id: WRITES_RECORD_COUNT + 1, name: "Name new", amount: 1, note: "" }])),
    createHooks: (coreOf: () => GridCore<unknown> | null | undefined): WritesHooks => ({
      writeCommitted: () => committed,
      lastWrite: () => last,
      writesRecord: (id) => inner?.getRowById(id) ?? null,
      canUndo: () => coreOf()?.history.canUndo() ?? false,
      canRedo: () => coreOf()?.history.canRedo() ?? false,
      writesQueryCount: () => queries,
      appUpdate: () => flushed((source) => source.updateCell(2, "amount", 777)),
      appUpdateLast: () => flushed((source) => source.updateCell(WRITES_RECORD_COUNT, "amount", 555)),
      appRenameFirst: () => flushed((source) => source.updateCell(WRITES_RECORD_COUNT, "name", "Aaa")),
      appAdd: () => flushed((source) => source.addRows([{ id: WRITES_RECORD_COUNT + 1, name: "Name new", amount: 1, note: "" }])),
    }),
  };
};

export type WritesFixture = ReturnType<typeof createWritesFixture>;
