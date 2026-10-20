// PRD 013 checks for `ssr-smoke.mjs` (AC-013-05, AC-013-06): a core with
// history built on Node, the write command's event from `cells.setValue`,
// and one undo written back through the same command.

const expectEqual = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
};

const COLUMNS = [
  { field: "id", cellDataType: "number", width: 60 },
  { field: "name", cellDataType: "text", width: 100, editable: true },
  { field: "amount", cellDataType: "number", width: 100, editable: true },
];

export const checkWritesCore = async (coreArtifact) => {
  if (typeof window !== "undefined" || typeof document !== "undefined") {
    throw new Error("The core check must run without browser globals.");
  }
  const rows = [{ id: 1, name: "a", amount: 1 }, { id: 2, name: "b", amount: 2 }];
  const committed = [];
  const core = new coreArtifact.GridCore({
    columns: COLUMNS,
    dataSource: coreArtifact.createClientDataSource(rows, { useWorker: false }),
    rowHeight: 32,
    headerHeight: 32,
    getRowId: (row) => row.id,
    history: { maxEntries: 5 },
    onWriteCommitted: (event) => committed.push(event),
  });
  await core.initialize();
  expectEqual(core.history.isEnabled(), true, "history enabled");
  expectEqual(core.history.undo(), false, "undo on an empty stack");

  core.cells.setValue(0, 2, 10);
  expectEqual(rows[0].amount, 10, "written amount");
  expectEqual(committed.length, 1, "events after setValue");
  expectEqual(committed[0].operation, "setCellValue", "operation");
  expectEqual(committed[0].changes.length, 1, "changes");
  expectEqual(core.history.canUndo(), true, "canUndo");

  expectEqual(core.history.undo(), true, "undo applied");
  expectEqual(rows[0].amount, 1, "restored amount");
  expectEqual(committed[1]?.operation, "undo", "undo event");
  expectEqual(core.history.canRedo(), true, "canRedo");
  core.destroy();
  return { checks: 10 };
};
