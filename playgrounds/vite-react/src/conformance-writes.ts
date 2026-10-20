// playgrounds/vite-react/src/conformance-writes.ts
// The writes arm (PRD 013): a mutable client source the browser edits,
// pastes into and fills; the shell hands it every write event it receives.

import { createMutableClientDataSource } from "@gp-grid/react";
import type { ColumnDefinition, DataSource, MutableDataSource, WriteCommittedEvent } from "@gp-grid/react";

export interface WritesRecord {
  id: number;
  name: string;
  amount: number;
  note: string;
}

export const WRITES_RECORD_COUNT = 200;
export const WRITES_ROW_HEIGHT = 32;
export const WRITES_HEADER_HEIGHT = 36;

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
}

export const createWritesFixture = () => {
  let inner: MutableDataSource<WritesRecord> | null = null;
  let source: DataSource<never> | undefined;
  let committed = 0;
  let last: WriteSummary | null = null;

  return {
    /** Fresh records and source; the shell remounts the grid over `source()`. */
    arm: (): void => {
      committed = 0;
      last = null;
      inner = createMutableClientDataSource(createWritesRecords(), {
        getRowId: (record) => record.id,
        debounceMs: 0,
        useWorker: false,
      });
      source = inner as unknown as DataSource<never>;
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
    createHooks: (): WritesHooks => ({
      writeCommitted: () => committed,
      lastWrite: () => last,
      writesRecord: (id) => inner?.getRowById(id) ?? null,
    }),
  };
};

export type WritesFixture = ReturnType<typeof createWritesFixture>;
