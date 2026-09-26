import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Grid, createColumnarDataSource } from "@gp-grid/react";
import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnLayoutMode,
  DataSource,
  FreezeRowsOptions,
  GridRef,
  RowDragEndEvent,
} from "@gp-grid/react";
import {
  createGeometryHooks,
  createLargeColumnarColumns,
  createLargeColumnarSource,
  createNarrowColumns,
  createWideColumns,
  createWideSource,
  type GeometryHooks,
} from "./conformance-geometry";
import {
  createFrozenFixture,
  FROZEN_HEADER_HEIGHT,
  FROZEN_HOST_HEIGHT,
  FROZEN_HOST_NARROW_HEIGHT,
  FROZEN_ROW_HEIGHT,
  type FrozenMode,
} from "./conformance-frozen";

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

interface ConformanceHooks extends GeometryHooks {
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
  eventCounts: () => { resized: number; moved: number; dragged: number; pinned: number };
  resetEventCounts: () => void;
  useWideColumns: (count: number) => void;
  setFreezeCount: (count: number) => void;
}

interface EventCounts {
  resized: number;
  moved: number;
  dragged: number;
  pinned: number;
}

export const ConformanceApp = (): React.ReactNode => {
  const [rows, setRows] = useState(createRows);
  const [columns, setColumns] = useState(createColumns);
  const [columnarColumns, setColumnarColumns] = useState(createColumnarColumns);
  const [largeColumnarSource, setLargeColumnarSource] = useState<ReturnType<typeof createLargeColumnarSource> | null>(null);
  const [fixture] = useState(createColumnarFixture);
  const [frozen] = useState(createFrozenFixture);
  const [frozenMode, setFrozenMode] = useState<FrozenMode>("off");
  const [mode, setMode] = useState<"object" | "columnar">("object");
  const [revision, setRevision] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [editEvents, setEditEvents] = useState(0);
  const [writeRejected, setWriteRejected] = useState(0);
  const [columnState, setColumnState] = useState<ColumnStateUpdate[] | undefined>(undefined);
  const [columnLayout, setColumnLayout] = useState<ColumnLayoutMode>("fit");
  const [hostWidth, setHostWidth] = useState(600);
  const [hostHeight, setHostHeight] = useState(FROZEN_HOST_HEIGHT);
  const [freezeOverride, setFreezeOverride] = useState<FreezeRowsOptions | undefined | null>(null);
  const [rtl, setRtl] = useState(false);
  const gridRef = useRef<GridRef<ConformanceRow> | null>(null);
  const eventCounts = useRef<EventCounts>({ resized: 0, moved: 0, dragged: 0, pinned: 0 });
  const coreTokens = useRef(new WeakMap<object, number>());
  const nextCoreToken = useRef(1);

  const isColumnar = mode === "columnar";
  const frozenActive = frozenMode !== "off";
  const frozenObject = frozenMode === "object";

  /** Arming swaps the data source and columns, so it remounts the grid. */
  const armFrozenRows = useCallback((next: FrozenMode) => {
    setFrozenMode(next);
    setGeneration((value) => value + 1);
  }, []);

  const useFreezeRows = useCallback(() => armFrozenRows("columnar"), [armFrozenRows]);
  const clearFreezeRows = useCallback(() => armFrozenRows("off"), [armFrozenRows]);
  const useFrozenPaged = useCallback(() => armFrozenRows("paged"), [armFrozenRows]);
  const useFrozenPagedTight = useCallback(() => armFrozenRows("paged-tight"), [armFrozenRows]);
  const useFrozenObject = useCallback(() => armFrozenRows("object"), [armFrozenRows]);

  // In-place controls: the option stays reactive, so these never touch the
  // remount `generation`. `null` means "the armed mode's own option".
  const freezeCount = useCallback((count: number) => {
    setFreezeOverride({ count });
  }, []);
  const freezeThrough5 = useCallback(() => {
    gridRef.current?.core?.frozenRows.freezeThrough(5);
  }, []);
  const unfreezeInPlace = useCallback(() => {
    setFreezeOverride(undefined);
  }, []);
  /** Drives the core's own setter: a button click would blur and commit. */
  const setFreezeCount = useCallback((count: number) => {
    gridRef.current?.core?.frozenRows.set({ count });
  }, []);
  const toggleHostHeight = useCallback(() => {
    setHostHeight((current) =>
      current === FROZEN_HOST_HEIGHT ? FROZEN_HOST_NARROW_HEIGHT : FROZEN_HOST_HEIGHT);
  }, []);

  const activeColumns = (): ColumnDefinition[] => {
    const frozenColumns = frozenActive ? frozen.columnsFor(frozenMode) : undefined;
    if (frozenColumns !== undefined) return frozenColumns;
    return isColumnar ? columnarColumns : columns;
  };

  /** A frozen arm replaces the data source; otherwise the mode picks it. */
  const activeDataSource = (): DataSource<never> | undefined => {
    if (frozenActive) return frozen.sourceFor(frozenMode);
    if (isColumnar) return largeColumnarSource ?? fixture.source;
    return undefined;
  };

  /** The writable arm keeps the caller's object rows; every other one is sourced. */
  const activeRowData = (): ConformanceRow[] | undefined => {
    if (frozenActive) return frozenObject ? rows : undefined;
    return isColumnar ? undefined : rows;
  };

  const activeFreezeRows = (): FreezeRowsOptions | undefined =>
    freezeOverride === null ? frozen.freezeRowsFor(frozenMode) : freezeOverride;

  const replaceColumns = useCallback(() => {
    setColumns([
      { colId: "score", field: "score", headerName: "Score", width: 120, cellDataType: "number" },
      { colId: "city", field: "city", headerName: "City", width: 140, cellDataType: "text" },
      { colId: "replacement", field: "code", headerName: "Replacement", width: 190, cellDataType: "text" },
    ]);
  }, []);

  const useNarrowColumns = useCallback(() => {
    setColumns(createNarrowColumns());
  }, []);

  const useLargeColumnar = useCallback(() => {
    setMode("columnar");
    setColumnarColumns(createLargeColumnarColumns());
    setLargeColumnarSource(createLargeColumnarSource());
    setGeneration((value) => value + 1);
    setRevision(fixture.source.revision);
  }, [fixture]);

  /** Wide fixtures bind an accessor source: no per-row storage for 10k columns. */
  const useWideColumns = useCallback((count: number) => {
    setMode("columnar");
    setColumnarColumns(createWideColumns(count));
    setLargeColumnarSource(createWideSource(count));
    setGeneration((value) => value + 1);
  }, []);

  const pinColumns = useCallback(() => {
    setColumnState([
      { columnId: "id", pinned: "start" },
      { columnId: "name", pinned: "start" },
      { columnId: "code", pinned: "end" },
    ]);
  }, []);

  const unpinAll = useCallback(() => {
    setColumnState(undefined);
    const core = gridRef.current?.core;
    for (const column of core?.columns.get() ?? []) {
      core?.columns.setPinned(column.colId ?? column.field, null);
    }
  }, []);

  const toggleColumnLayout = useCallback(() => {
    setColumnLayout((current) => (current === "fit" ? "fixed" : "fit"));
  }, []);

  const resizeHost = useCallback(() => {
    setHostWidth((current) => (current === 600 ? 800 : 600));
  }, []);

const hideColumn = useCallback(() => {
    setColumnState((current) => [...(current ?? []), { columnId: "id", hidden: true }]);
  }, []);

  const reset = useCallback(() => {
    setRtl(false);
    setRows(createRows());
    setColumns(createColumns());
    setColumnarColumns(createColumnarColumns());
    setColumnState(undefined);
    setColumnLayout("fit");
    setHostWidth(600);
    setHostHeight(FROZEN_HOST_HEIGHT);
    setFreezeOverride(null);
    setMode("object");
    setFrozenMode("off");
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

  /** A `dir` flip needs a remount: direction is sampled at mount/resize. */
  const toggleRtl = useCallback(() => {
    setRtl((current) => !current);
    remount();
  }, [remount]);

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
  const onColumnPinned = useCallback((_event: ColumnPinnedEvent) => {
    eventCounts.current.pinned += 1;
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
    gridRef.current?.core?.columns.resetState();
  }, []);

  const applySort = useCallback(() => {
    void gridRef.current?.core?.sortFilter.setSort("score", "asc");
  }, []);

  const applyFilter = useCallback(() => {
    void gridRef.current?.core?.sortFilter.setFilter("city", "City 1");
  }, []);

  const moveColumn = useCallback(() => {
    gridRef.current?.core?.columns.move(0, 2);
  }, []);

  const dragRow = useCallback(() => {
    gridRef.current?.core?.rowDrag.commit(0, 1);
  }, []);

  // Expose the wrapper's stripped built core for raw-value assertions and the
  // borrowed-source read counters for bounded-read assertions.
  useEffect(() => {
    const hooks: ConformanceHooks = {
      getCellValue: (row, col) => gridRef.current?.core?.cells.getValue(row, col) ?? null,
      getFieldValue: (row, field) => gridRef.current?.core?.cells.getFieldValue(row, field) ?? null,
      revision: () => fixture.source.revision,
      sourceReads: () => fixture.reads(),
      sourceDistinctRows: () => fixture.distinctRows(),
      resetSourceReads: () => fixture.resetReads(),
      recordMaterializations: () => fixture.recordMaterializations(),
      coreToken: readCoreToken,
      columnIds: () => gridRef.current?.core?.columns.get().map((column) => column.colId ?? column.field) ?? [],
      columnState: () => gridRef.current?.core?.columns.getState() ?? [],
      sortColumn: () => gridRef.current?.core?.sortFilter.getSortModel()[0]?.colId ?? null,
      filterCount: () => Object.keys(gridRef.current?.core?.sortFilter.getFilterModel() ?? {}).length,
      eventCounts: () => ({ ...eventCounts.current }),
      resetEventCounts: () => {
        eventCounts.current = { resized: 0, moved: 0, dragged: 0, pinned: 0 };
      },
      useWideColumns,
      setFreezeCount,
      ...createGeometryHooks(() => (gridRef.current?.core ?? null) as never, frozen),
    };
    (window as unknown as { __gpConformance?: ConformanceHooks }).__gpConformance = hooks;
    return () => {
      delete (window as unknown as { __gpConformance?: ConformanceHooks }).__gpConformance;
    };
  }, [fixture, frozen, readCoreToken, setFreezeCount, useWideColumns]);

  // Arming remounts the grid, so the announcement reader follows each core.
  useEffect(() => {
    frozen.track((gridRef.current?.core ?? null) as never);
  }, [frozen, generation, mounted]);

  const metrics = useMemo(
    () => ({ generation, editEvents, writeRejected, mode, revision }),
    [generation, editEvents, writeRejected, mode, revision],
  );

  return (
    <main data-conformance-framework="react" style={{ width: 620, margin: 16 }}>
      {/* Compact controls: the fixture page must fit the 720 px viewport, or
          focusing the grid scrolls the page and moves rows under the pointer. */}
      <style>{`[data-conformance-framework] button { padding: 2px 6px; font-size: 11px; }`}</style>
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
        <button data-testid="use-narrow-columns" onClick={useNarrowColumns}>Narrow columns</button>
        <button data-testid="use-large-columnar" onClick={useLargeColumnar}>Large columnar</button>
        <button data-testid="use-wide-columns" onClick={() => useWideColumns(1000)}>Wide columns</button>
        <button data-testid="pin-columns" onClick={pinColumns}>Pin columns</button>
        <button data-testid="unpin-all" onClick={unpinAll}>Unpin all</button>
        <button data-testid="toggle-column-layout" onClick={toggleColumnLayout}>Toggle layout</button>
        <button data-testid="resize-host" onClick={resizeHost}>Resize host</button>
        <button data-testid="hide-column" onClick={hideColumn}>Hide column</button>
        <button data-testid="toggle-rtl" onClick={toggleRtl}>Toggle RTL</button>
        <button data-testid="use-freeze-rows" onClick={useFreezeRows}>Freeze rows</button>
        <button data-testid="clear-freeze-rows" onClick={clearFreezeRows}>Clear freeze rows</button>
        <button data-testid="use-frozen-paged" onClick={useFrozenPaged}>Frozen paged</button>
        <button data-testid="use-frozen-paged-tight" onClick={useFrozenPagedTight}>Frozen paged tight</button>
        <button data-testid="use-frozen-object" onClick={useFrozenObject}>Frozen object</button>
        <button data-testid="freeze-count-3" onClick={() => freezeCount(3)}>Freeze 3</button>
        <button data-testid="freeze-count-5" onClick={() => freezeCount(5)}>Freeze 5</button>
        <button data-testid="freeze-through-5" onClick={freezeThrough5}>Freeze through 5</button>
        <button data-testid="unfreeze-in-place" onClick={unfreezeInPlace}>Unfreeze in place</button>
        <button data-testid="toggle-host-height" onClick={toggleHostHeight}>Toggle host height</button>
        <output data-testid="metrics">{JSON.stringify(metrics)}</output>
      </div>
      <div data-testid="grid-host" dir={rtl ? "rtl" : "ltr"} style={{ width: hostWidth, height: hostHeight }}>
        {mounted && (
          <Grid
            key={generation}
            gridRef={gridRef}
            columns={activeColumns()}
            columnState={frozenActive ? frozen.columnState : columnState}
            columnLayout={columnLayout}
            dataSource={activeDataSource()}
            rowData={activeRowData()}
            rowHeight={frozenActive ? FROZEN_ROW_HEIGHT : 32}
            headerHeight={frozenActive ? FROZEN_HEADER_HEIGHT : 36}
            freezeRows={activeFreezeRows()}
            rowLoading={frozen.rowLoadingFor(frozenMode)}
            getRowId={(row) => row.id}
            onCellValueChanged={onCellValueChanged}
            onWriteRejected={onWriteRejected}
            onColumnResized={onColumnResized}
            onColumnMoved={onColumnMoved}
            onRowDragEnd={onRowDragEnd}
            onColumnPinned={onColumnPinned}
            onFrozenRowsChanged={frozen.recordFreezeEvent}
          />
        )}
      </div>
    </main>
  );
};
