import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Grid, createColumnarDataSource } from "@gp-grid/react";
import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  ColumnMovedEvent,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  GridRef,
  RowDragEndEvent,
} from "@gp-grid/react";

interface ConformanceRow {
  id: number;
  name: string;
  city: string;
  score: number;
  team: string;
  status: string;
  note: string;
  code: string;
}

const ROW_COUNT = 200;

const createRows = (): ConformanceRow[] => Array.from({ length: ROW_COUNT }, (_, index) => ({
  id: index,
  name: `Row ${index.toString().padStart(3, "0")}`,
  city: `City ${index % 11}`,
  score: index * 3,
  team: `Team ${index % 7}`,
  status: index % 2 === 0 ? "active" : "inactive",
  note: `Note ${index}`,
  code: `C-${index.toString().padStart(4, "0")}`,
}));

const createColumns = (): ColumnDefinition[] => [
  { colId: "id", field: "id", headerName: "ID", width: 90, cellDataType: "number", sortable: true },
  { colId: "name", field: "name", headerName: "Name", width: 180, cellDataType: "text", sortable: true, filterable: true, editable: true },
  { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
  { colId: "score", field: "score", headerName: "Score", width: 120, cellDataType: "number" },
  { colId: "team", field: "team", headerName: "Team", width: 150, cellDataType: "text" },
  { colId: "status", field: "status", headerName: "Status", width: 130, cellDataType: "text" },
  { colId: "note", field: "note", headerName: "Note", width: 210, cellDataType: "text" },
  { colId: "code", field: "code", headerName: "Code", width: 160, cellDataType: "text" },
];

/** Same columns, with a formatter so raw and displayed values differ. */
const createColumnarColumns = (): ColumnDefinition[] =>
  createColumns().map((column) =>
    column.field === "score"
      ? { ...column, valueFormatter: (value: CellValue) => `${value} pts` }
      : column,
  );

interface ColumnarFixture {
  source: ReturnType<typeof createColumnarDataSource>;
  data: {
    id: Int32Array;
    name: string[];
    score: Float64Array;
  };
  reads: () => number;
  distinctRows: () => number;
  resetReads: () => void;
  recordMaterializations: () => number;
}

const createColumnarFixture = (): ColumnarFixture => {
  let reads = 0;
  const readRows = new Set<number>();
  // Borrowed stores are proxied so every numeric cell read is observable. A
  // wrapper that eagerly reads every source row would be visible here.
  const borrow = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(source, property) {
        if (typeof property === "string" && /^\d+$/.test(property)) {
          reads += 1;
          readRows.add(Number(property));
        }
        return Reflect.get(source, property, source);
      },
    });

  const id = borrow(new Int32Array(ROW_COUNT));
  const name = borrow(new Array<string>(ROW_COUNT));
  const city = borrow(new Array<string>(ROW_COUNT));
  const score = borrow(new Float64Array(ROW_COUNT));
  const team = borrow(new Array<string>(ROW_COUNT));
  const status = borrow(new Array<string>(ROW_COUNT));
  const note = borrow(new Array<string>(ROW_COUNT));
  const code = borrow(new Array<string>(ROW_COUNT));
  for (let index = 0; index < ROW_COUNT; index += 1) {
    id[index] = index;
    name[index] = `Row ${index.toString().padStart(3, "0")}`;
    city[index] = `City ${index % 11}`;
    score[index] = index * 3;
    team[index] = `Team ${index % 7}`;
    status[index] = index % 2 === 0 ? "active" : "inactive";
    note[index] = `Note ${index}`;
    code[index] = `C-${index.toString().padStart(4, "0")}`;
  }
  const source = createColumnarDataSource({
    rowCount: ROW_COUNT,
    getRowId: (row) => id[row]!,
    fields: [
      { field: "id", data: id },
      { field: "name", data: name },
      { field: "city", data: city },
      { field: "score", data: score },
      { field: "team", data: team },
      { field: "status", data: status },
      { field: "note", data: note },
      { field: "code", data: code },
    ],
  });

  let materializations = 0;
  const readRecord = source.getRecord.bind(source);
  source.getRecord = (row) => {
    materializations += 1;
    return readRecord(row);
  };

  return {
    source,
    data: { id, name, score },
    reads: () => reads,
    distinctRows: () => readRows.size,
    resetReads: () => {
      reads = 0;
      readRows.clear();
    },
    recordMaterializations: () => materializations,
  };
};

interface ConformanceHooks {
  getCellValue: (row: number, col: number) => CellValue;
  getFieldValue: (row: number, field: string) => CellValue;
  revision: () => number;
  sourceReads: () => number;
  sourceDistinctRows: () => number;
  resetSourceReads: () => void;
  recordMaterializations: () => number;
  coreToken: () => number;
  columnIds: () => string[];
  columnState: () => ColumnStateSnapshot[];
  sortColumn: () => string | null;
  filterCount: () => number;
  eventCounts: () => { resized: number; moved: number; dragged: number };
  resetEventCounts: () => void;
}

interface EventCounts {
  resized: number;
  moved: number;
  dragged: number;
}

export const ConformanceApp = (): React.ReactNode => {
  const [rows, setRows] = useState(createRows);
  const [columns, setColumns] = useState(createColumns);
  const [columnarColumns] = useState(createColumnarColumns);
  const [fixture] = useState(createColumnarFixture);
  const [mode, setMode] = useState<"object" | "columnar">("object");
  const [revision, setRevision] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [editEvents, setEditEvents] = useState(0);
  const [writeRejected, setWriteRejected] = useState(0);
  const [columnState, setColumnState] = useState<ColumnStateUpdate[] | undefined>(undefined);
  const gridRef = useRef<GridRef<ConformanceRow> | null>(null);
  const eventCounts = useRef<EventCounts>({ resized: 0, moved: 0, dragged: 0 });
  const coreTokens = useRef(new WeakMap<object, number>());
  const nextCoreToken = useRef(1);

  const isColumnar = mode === "columnar";

  const replaceColumns = useCallback(() => {
    setColumns([
      { colId: "score", field: "score", headerName: "Score", width: 120, cellDataType: "number" },
      { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
      { colId: "replacement", field: "code", headerName: "Replacement", width: 190, cellDataType: "text" },
    ]);
  }, []);

  const reset = useCallback(() => {
    setRows(createRows());
    setColumns(createColumns());
    setColumnState(undefined);
    setMode("object");
    setMounted(true);
    setGeneration((value) => value + 1);
    setEditEvents(0);
    setWriteRejected(0);
  }, []);

  const remount = useCallback(() => {
    setMounted(false);
    window.setTimeout(() => {
      setGeneration((value) => value + 1);
      setMounted(true);
    }, 0);
  }, []);

  const useColumnar = useCallback(() => {
    setMode("columnar");
    setGeneration((value) => value + 1);
    setRevision(fixture.source.revision);
  }, [fixture]);

  const useObject = useCallback(() => {
    setMode("object");
    setGeneration((value) => value + 1);
  }, []);

  /** In-place same-array update followed by an explicit revision refresh. */
  const bumpRevision = useCallback(async () => {
    fixture.data.name[0] = "Row revised";
    fixture.data.score[0] = 7;
    const next = fixture.source.revision + 1;
    fixture.source.setRevision(next);
    setRevision(next);
    await gridRef.current?.core?.refresh();
  }, [fixture]);

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<ConformanceRow>) => {
    setRows((current) => current.map((row) => row.id === event.rowId ? { ...row, [event.field]: event.newValue } : row));
    setEditEvents((value) => value + 1);
  }, []);

  const onWriteRejected = useCallback((_event: CellWriteRejectedEvent) => {
    setWriteRejected((value) => value + 1);
  }, []);

  const onColumnResized = useCallback((_event: ColumnResizedEvent) => {
    eventCounts.current.resized += 1;
  }, []);
  const onColumnMoved = useCallback((_event: ColumnMovedEvent) => {
    eventCounts.current.moved += 1;
  }, []);
  const onRowDragEnd = useCallback((_event: RowDragEndEvent) => {
    eventCounts.current.dragged += 1;
  }, []);

  const readCoreToken = useCallback((): number => {
    const core = gridRef.current?.core;
    if (!core) return -1;
    const tokens = coreTokens.current;
    const existing = tokens.get(core);
    if (existing !== undefined) return existing;
    const token = nextCoreToken.current;
    nextCoreToken.current += 1;
    tokens.set(core, token);
    return token;
  }, []);

  const applyColumnState = useCallback(() => {
    setColumnState([{ columnId: "city", width: 260 }]);
  }, []);

  const resetColumnState = useCallback(() => {
    setColumnState(undefined);
    gridRef.current?.core?.resetColumnState();
  }, []);

  const applySort = useCallback(() => {
    void gridRef.current?.core?.setSort("score", "asc");
  }, []);

  const applyFilter = useCallback(() => {
    void gridRef.current?.core?.setFilter("city", "City 1");
  }, []);

  const moveColumn = useCallback(() => {
    gridRef.current?.core?.moveColumn(0, 2);
  }, []);

  const dragRow = useCallback(() => {
    gridRef.current?.core?.commitRowDrag(0, 1);
  }, []);

  // Expose the wrapper's stripped built core for raw-value assertions and the
  // borrowed-source read counters for bounded-read assertions.
  useEffect(() => {
    const hooks: ConformanceHooks = {
      getCellValue: (row, col) => gridRef.current?.core?.getCellValue(row, col) ?? null,
      getFieldValue: (row, field) => gridRef.current?.core?.getFieldValue(row, field) ?? null,
      revision: () => fixture.source.revision,
      sourceReads: () => fixture.reads(),
      sourceDistinctRows: () => fixture.distinctRows(),
      resetSourceReads: () => fixture.resetReads(),
      recordMaterializations: () => fixture.recordMaterializations(),
      coreToken: readCoreToken,
      columnIds: () => gridRef.current?.core?.getColumns().map((column) => column.colId ?? column.field) ?? [],
      columnState: () => gridRef.current?.core?.getColumnState() ?? [],
      sortColumn: () => gridRef.current?.core?.getSortModel()[0]?.colId ?? null,
      filterCount: () => Object.keys(gridRef.current?.core?.getFilterModel() ?? {}).length,
      eventCounts: () => ({ ...eventCounts.current }),
      resetEventCounts: () => {
        eventCounts.current = { resized: 0, moved: 0, dragged: 0 };
      },
    };
    (window as unknown as { __gpConformance?: ConformanceHooks }).__gpConformance = hooks;
    return () => {
      delete (window as unknown as { __gpConformance?: ConformanceHooks }).__gpConformance;
    };
  }, [fixture, readCoreToken]);

  const metrics = useMemo(
    () => ({ generation, editEvents, writeRejected, mode, revision }),
    [generation, editEvents, writeRejected, mode, revision],
  );

  return (
    <main data-conformance-framework="react" style={{ width: 620, margin: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button data-testid="reset" onClick={reset}>Reset</button>
        <button data-testid="remount" onClick={remount}>Remount</button>
        <button data-testid="replace-columns" onClick={replaceColumns}>Replace columns</button>
        <button data-testid="apply-column-state" onClick={applyColumnState}>Apply column state</button>
        <button data-testid="reset-column-state" onClick={resetColumnState}>Reset column state</button>
        <button data-testid="apply-sort" onClick={applySort}>Apply sort</button>
        <button data-testid="apply-filter" onClick={applyFilter}>Apply filter</button>
        <button data-testid="move-column" onClick={moveColumn}>Move column</button>
        <button data-testid="drag-row" onClick={dragRow}>Drag row</button>
        <button data-testid="use-columnar" onClick={useColumnar}>Use columnar</button>
        <button data-testid="use-object" onClick={useObject}>Use object</button>
        <button data-testid="bump-revision" onClick={bumpRevision}>Bump revision</button>
        <output data-testid="metrics">{JSON.stringify(metrics)}</output>
      </div>
      <div data-testid="grid-host" style={{ width: 600, height: 360 }}>
        {mounted && (
          <Grid
            key={generation}
            gridRef={gridRef}
            columns={isColumnar ? columnarColumns : columns}
            columnState={columnState}
            dataSource={isColumnar ? fixture.source : undefined}
            rowData={isColumnar ? undefined : rows}
            rowHeight={32}
            headerHeight={36}
            getRowId={(row) => row.id}
            onCellValueChanged={onCellValueChanged}
            onWriteRejected={onWriteRejected}
            onColumnResized={onColumnResized}
            onColumnMoved={onColumnMoved}
            onRowDragEnd={onRowDragEnd}
          />
        )}
      </div>
    </main>
  );
};
