import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Grid, createColumnarDataSource } from "@gp-grid/react";
import type {
  CellValue,
  CellValueChangedEvent,
  CellWriteRejectedEvent,
  ColumnDefinition,
  ColumnGroupChild,
  ColumnGroupLimits,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnResizedEvent,
  ColumnSchemaError,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnLayoutMode,
  DataSource,
  FreezeRowsOptions,
  GridCore,
  GridRef,
  ReactCellRenderer,
  ReactGroupLabelRenderer,
  RowDragEndEvent,
  RowResizedEvent,
} from "@gp-grid/react";
import {
  createFitHooks,
  createGeometryHooks,
  createLargeColumnarColumns,
  createLargeColumnarSource,
  createNarrowColumns,
  createWideColumns,
  createWideSource,
  type FitHooks,
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
import {
  createRowHeightsFixture,
  ROW_HEIGHTS_HEADER_HEIGHT,
  ROW_HEIGHTS_ROW_HEIGHT,
  type RowHeightsMode,
  type RowHeightsRow,
} from "./conformance-row-heights";
import {
  AUTO_FIT_COLUMN_LAYOUT,
  AUTO_FIT_HEADER_HEIGHT,
  AUTO_FIT_ROW_HEIGHT,
  createAutoFitFixture,
  type AutoFitMode,
} from "./conformance-auto-fit";
import {
  COLUMN_GROUPS_COLUMN_LAYOUT,
  COLUMN_GROUPS_HEADER_HEIGHT,
  COLUMN_GROUPS_HOST_HEIGHT,
  COLUMN_GROUPS_ROW_HEIGHT,
  createColumnGroupHooks,
  createColumnGroupsFixture,
  type ColumnGroupHooks,
  type ColumnGroupsMode,
  type ColumnGroupsSchema,
} from "./conformance-column-groups";
import {
  createRowGroupsFixture,
  ROW_GROUPS_COLUMN_LAYOUT,
  ROW_GROUPS_HEADER_HEIGHT,
  ROW_GROUPS_ROW_HEIGHT,
  ROW_KIND_PROBE,
  type RowGroupsArm,
  type RowGroupsColumnsVariant,
  type RowGroupsMode,
} from "./conformance-row-groups";

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

/** PRD 008: prints the renderer's `rowKind`, so a spec can read it. */
const renderRowKindProbe: ReactCellRenderer = (params) => (
  <span className="rg-kind-probe" data-probe-kind={params.rowKind ?? "flat"}>
    {String(params.value ?? "")}
  </span>
);
const ROW_GROUP_RENDERERS = { [ROW_KIND_PROBE]: renderRowKindProbe };

/** The external arm's label: the formatted text and a button wired to `toggle`. */
const renderExternalLabel: ReactGroupLabelRenderer = (params) => (
  <span className="rg-custom-label" data-row-kind={params.row.kind}>
    {params.label}
    {params.row.kind === "group" && (
      <button
        type="button"
        className="rg-custom-toggle"
        aria-label="Toggle group"
        style={{ width: 14, height: 14, marginInlineStart: 4 }}
        onClick={params.toggle}
      />
    )}
  </span>
);

/** One fixture arm at a time; `none` keeps the fixture's own grid. */
type FixtureArm =
  | { fixture: "none" }
  | { fixture: "frozen"; mode: FrozenMode }
  | { fixture: "rowHeights"; mode: RowHeightsMode }
  | { fixture: "autoFit"; mode: AutoFitMode }
  | { fixture: "columnGroups"; mode: ColumnGroupsMode }
  | { fixture: "rowGroups"; mode: RowGroupsMode };

const NO_ARM: FixtureArm = { fixture: "none" };

interface ConformanceHooks extends GeometryHooks, FitHooks, ColumnGroupHooks {
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
  eventCounts: () => EventCounts;
  resetEventCounts: () => void;
  useWideColumns: (count: number) => void;
  setFreezeCount: (count: number) => void;
}

interface EventCounts {
  resized: number;
  moved: number;
  dragged: number;
  pinned: number;
  rowResized: number;
}

const createEventCounts = (): EventCounts =>
  ({ resized: 0, moved: 0, dragged: 0, pinned: 0, rowResized: 0 });

export const ConformanceApp = (): React.ReactNode => {
  const [rows, setRows] = useState(createRows);
  const [columns, setColumns] = useState(createColumns);
  const [columnarColumns, setColumnarColumns] = useState(createColumnarColumns);
  const [largeColumnarSource, setLargeColumnarSource] = useState<ReturnType<typeof createLargeColumnarSource> | null>(null);
  const [fixture] = useState(createColumnarFixture);
  const [frozen] = useState(createFrozenFixture);
  const [rowHeights] = useState(createRowHeightsFixture);
  const [autoFit] = useState(createAutoFitFixture);
  const [columnGroups] = useState(createColumnGroupsFixture);
  const [rowGroups] = useState(createRowGroupsFixture);
  const [rowGroupsArm, setRowGroupsArm] = useState<RowGroupsArm>({ columns: [], grouping: null });
  const [arm, setArm] = useState<FixtureArm>(NO_ARM);
  const [groupsSchema, setGroupsSchema] = useState<ColumnGroupsSchema>(() => columnGroups.schemaFor("off"));
  const [bandHeights, setBandHeights] = useState<readonly number[] | undefined>(undefined);
  const [groupLimits, setGroupLimits] = useState<ColumnGroupLimits | undefined>(undefined);
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
  const eventCounts = useRef<EventCounts>(createEventCounts());
  const coreTokens = useRef(new WeakMap<object, number>());
  const nextCoreToken = useRef(1);

  const isColumnar = mode === "columnar";
  const frozenMode: FrozenMode = arm.fixture === "frozen" ? arm.mode : "off";
  const rowHeightsMode: RowHeightsMode = arm.fixture === "rowHeights" ? arm.mode : "off";
  const autoFitMode: AutoFitMode = arm.fixture === "autoFit" ? arm.mode : "off";
  const columnGroupsMode: ColumnGroupsMode = arm.fixture === "columnGroups" ? arm.mode : "off";
  const rowGroupsMode: RowGroupsMode = arm.fixture === "rowGroups" ? arm.mode : "off";
  const rowGroupsActive = rowGroupsMode !== "off";
  const frozenActive = frozenMode !== "off";
  const frozenObject = frozenMode === "object";
  const rowHeightsActive = rowHeightsMode !== "off";
  const autoFitActive = autoFitMode !== "off";
  const columnGroupsActive = columnGroupsMode !== "off";

  /** Arming swaps the data source and columns, so it remounts the grid. */
  const armFixture = useCallback((next: FixtureArm) => {
    setArm(next);
    setGeneration((value) => value + 1);
  }, []);

  const useFreezeRows = useCallback(() => armFixture({ fixture: "frozen", mode: "columnar" }), [armFixture]);
  const clearFreezeRows = useCallback(() => armFixture(NO_ARM), [armFixture]);
  const useFrozenPaged = useCallback(() => armFixture({ fixture: "frozen", mode: "paged" }), [armFixture]);
  const useFrozenPagedTight = useCallback(() => armFixture({ fixture: "frozen", mode: "paged-tight" }), [armFixture]);
  const useFrozenObject = useCallback(() => armFixture({ fixture: "frozen", mode: "object" }), [armFixture]);

  const useRowHeights = useCallback(() => armFixture({ fixture: "rowHeights", mode: "object" }), [armFixture]);
  const useRowHeightsLarge = useCallback(() => armFixture({ fixture: "rowHeights", mode: "large" }), [armFixture]);
  const useRowHeightsPaged = useCallback(() => armFixture({ fixture: "rowHeights", mode: "paged" }), [armFixture]);
  const useAutoFit = useCallback(() => armFixture({ fixture: "autoFit", mode: "object" }), [armFixture]);
  const useAutoFitPaged = useCallback(() => armFixture({ fixture: "autoFit", mode: "paged" }), [armFixture]);

  /** The group arms also reset the hierarchy, the band heights and the budgets. */
  const armColumnGroups = useCallback((next: ColumnGroupsMode) => {
    setGroupsSchema(columnGroups.schemaFor(next));
    setBandHeights(undefined);
    setGroupLimits(undefined);
    columnGroups.clearResult();
    armFixture({ fixture: "columnGroups", mode: next });
  }, [armFixture, columnGroups]);
  const useColumnGroups = useCallback(() => armColumnGroups("groups"), [armColumnGroups]);

  /** Row group arms (PRD 008): fresh rows, source and grouping, then a remount. */
  const armRowGroups = useCallback((next: RowGroupsMode) => {
    setRowGroupsArm(rowGroups.arm(next));
    armFixture({ fixture: "rowGroups", mode: next });
  }, [armFixture, rowGroups]);
  /** In place: the grid keeps its core and regroups or relabels. */
  const setRowGroupColumns = useCallback((variant: RowGroupsColumnsVariant) => {
    setRowGroupsArm((current) => ({ ...current, columns: rowGroups.columnsFor(rowGroupsMode, variant) }));
  }, [rowGroups, rowGroupsMode]);
  const ungroup = useCallback(() => {
    setRowGroupsArm((current) => ({ ...current, grouping: null }));
  }, []);
  const useWideGroups = useCallback(() => armColumnGroups("wide"), [armColumnGroups]);

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
    if (rowGroupsActive) return rowGroupsArm.columns;
    if (columnGroupsActive) return groupsSchema.columns;
    const fitColumns = autoFitActive ? autoFit.columnsFor(autoFitMode) : undefined;
    if (fitColumns !== undefined) return fitColumns;
    const heightColumns = rowHeightsActive ? rowHeights.columnsFor(rowHeightsMode) : undefined;
    if (heightColumns !== undefined) return heightColumns;
    const frozenColumns = frozenActive ? frozen.columnsFor(frozenMode) : undefined;
    if (frozenColumns !== undefined) return frozenColumns;
    return isColumnar ? columnarColumns : columns;
  };

  /** A frozen or height arm replaces the data source; otherwise the mode picks it. */
  const activeDataSource = (): DataSource<never> | undefined => {
    if (rowGroupsActive) return rowGroups.source();
    if (columnGroupsActive) return undefined;
    if (autoFitActive) return autoFit.sourceFor(autoFitMode);
    if (rowHeightsActive) return rowHeights.sourceFor(rowHeightsMode);
    if (frozenActive) return frozen.sourceFor(frozenMode);
    if (isColumnar) return largeColumnarSource ?? fixture.source;
    return undefined;
  };

  /** The writable arms keep the caller's object rows; every other one is sourced. */
  const activeRowData = (): ConformanceRow[] | undefined => {
    if (rowGroupsActive) return undefined;
    if (columnGroupsActive) return columnGroups.rowDataFor(columnGroupsMode) as unknown as ConformanceRow[] | undefined;
    if (autoFitActive) return autoFit.rowDataFor(autoFitMode) as unknown as ConformanceRow[] | undefined;
    if (rowHeightsActive) return rowHeights.rowDataFor(rowHeightsMode) as RowHeightsRow[] | undefined;
    if (frozenActive) return frozenObject ? rows : undefined;
    return isColumnar ? undefined : rows;
  };

  const activeRowLoading = () => {
    if (rowGroupsActive) return rowGroups.rowLoading();
    if (autoFitActive) return autoFit.rowLoadingFor(autoFitMode);
    return rowHeightsActive ? rowHeights.rowLoadingFor(rowHeightsMode) : frozen.rowLoadingFor(frozenMode);
  };

  const activeRowHeight = (): number => {
    if (frozenActive) return FROZEN_ROW_HEIGHT;
    if (rowHeightsActive) return ROW_HEIGHTS_ROW_HEIGHT;
    if (autoFitActive) return AUTO_FIT_ROW_HEIGHT;
    if (columnGroupsActive) return COLUMN_GROUPS_ROW_HEIGHT;
    if (rowGroupsActive) return ROW_GROUPS_ROW_HEIGHT;
    return 32;
  };

  const activeHeaderHeight = (): number => {
    if (frozenActive) return FROZEN_HEADER_HEIGHT;
    if (rowHeightsActive) return ROW_HEIGHTS_HEADER_HEIGHT;
    if (autoFitActive) return AUTO_FIT_HEADER_HEIGHT;
    if (columnGroupsActive) return COLUMN_GROUPS_HEADER_HEIGHT;
    if (rowGroupsActive) return ROW_GROUPS_HEADER_HEIGHT;
    return 36;
  };

  const activeColumnLayout = (): ColumnLayoutMode => {
    if (autoFitActive) return AUTO_FIT_COLUMN_LAYOUT;
    if (rowGroupsActive) return ROW_GROUPS_COLUMN_LAYOUT;
    return columnGroupsActive ? COLUMN_GROUPS_COLUMN_LAYOUT : columnLayout;
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
    setArm(NO_ARM);
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

  const onWriteRejected = useCallback((event: CellWriteRejectedEvent) => {
    rowGroups.recordWriteRejected(event);
    setWriteRejected((value) => value + 1);
  }, [rowGroups]);

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
  const onRowResized = useCallback((_event: RowResizedEvent) => {
    eventCounts.current.rowResized += 1;
  }, []);
  const onColumnSchemaRejected = useCallback((error: ColumnSchemaError) => {
    columnGroups.recordRejection(error);
  }, [columnGroups]);

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

  /** In-place height controls: the arm stays mounted (AC-006-01/03/04). */
  const setRowHeightControls = useCallback(() => {
    const core = gridRef.current?.core;
    if (core) rowHeights.setControlHeights(core);
  }, [rowHeights]);

  const growAboveViewport = useCallback(() => {
    const core = gridRef.current?.core;
    if (core) rowHeights.growAboveViewport(core);
  }, [rowHeights]);

  const growFrozenRow = useCallback(() => {
    const core = gridRef.current?.core;
    if (core) rowHeights.growFrozenRow(core);
  }, [rowHeights]);

  const resetRowHeights = useCallback(() => {
    const core = gridRef.current?.core;
    if (core) rowHeights.resetHeights(core);
  }, [rowHeights]);

  /** Group controls: commands go through the core, the schema through the props (PRD 007). */
  const groupCore = useCallback(
    (): GridCore<unknown> | null => (gridRef.current?.core ?? null) as never,
    [],
  );
  const withCore = useCallback((run: (core: GridCore<unknown>) => void) => () => {
    const core = groupCore();
    if (core) run(core);
  }, [groupCore]);
  const replaceSchema = useCallback((next: (schema: ColumnGroupsSchema) => ColumnGroupsSchema) => () => {
    columnGroups.clearResult();
    setGroupsSchema(next);
  }, [columnGroups]);
  const setColumnGroups = useCallback((groups: readonly ColumnGroupChild[] | undefined) => {
    setGroupsSchema((schema) => ({ columns: schema.columns, groups }));
  }, []);
  const tallBand = useCallback(() => {
    const core = groupCore();
    if (core) setBandHeights(columnGroups.tallBandHeights(core));
  }, [columnGroups, groupCore]);
  /** Budgets are creation-only, so arming one remounts the grid. */
  const overBudgetMove = useCallback(() => {
    const core = groupCore();
    if (core === null) return;
    setGroupLimits(columnGroups.overBudgetLimits(core));
    setGeneration((value) => value + 1);
  }, [columnGroups, groupCore]);

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
      eventCounts: () => ({ ...eventCounts.current, ...rowGroups.eventCounts() }),
      resetEventCounts: () => {
        eventCounts.current = createEventCounts();
        rowGroups.resetEventCounts();
      },
      useWideColumns,
      setFreezeCount,
      ...createGeometryHooks(() => (gridRef.current?.core ?? null) as never, frozen),
      ...createFitHooks(() => (gridRef.current?.core ?? null) as never),
      ...createColumnGroupHooks(groupCore, columnGroups, {
        setGroups: setColumnGroups,
        setBandHeights,
      }),
      ...rowGroups.createHooks(groupCore),
      // Each arm records its own requests; the frozen reader is the other arms'.
      requestedRanges: () => {
        if (autoFitActive) return autoFit.requestedRanges();
        return rowHeightsActive ? rowHeights.requestedRanges() : frozen.requestedRanges();
      },
    };
    (window as unknown as { __gpConformance?: ConformanceHooks }).__gpConformance = hooks;
    return () => {
      delete (window as unknown as { __gpConformance?: ConformanceHooks }).__gpConformance;
    };
  }, [autoFit, autoFitActive, columnGroups, fixture, frozen, groupCore, readCoreToken, rowGroups, rowHeights, rowHeightsActive, setColumnGroups, setFreezeCount, useWideColumns]);

  // Arming remounts the grid, so the announcement reader follows each core.
  useEffect(() => {
    frozen.track((gridRef.current?.core ?? null) as never);
  }, [frozen, generation, mounted]);

  // Arm presets run against the core the arm just created (D1, D2).
  useEffect(() => {
    if (rowHeightsActive === false) return;
    const core = gridRef.current?.core;
    if (core) rowHeights.applyPreset(core, rowHeightsMode);
  }, [rowHeights, rowHeightsActive, rowHeightsMode, generation, mounted]);

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
        <button
          data-testid="replace-columns"
          onClick={rowGroupsActive ? () => setRowGroupColumns("replaced") : replaceColumns}
        >
          Replace columns
        </button>
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
        <button data-testid="use-row-heights" onClick={useRowHeights}>Row heights</button>
        <button data-testid="use-row-heights-large" onClick={useRowHeightsLarge}>Heights large</button>
        <button data-testid="use-row-heights-paged" onClick={useRowHeightsPaged}>Heights paged</button>
        <button data-testid="set-row-heights" onClick={setRowHeightControls}>Set heights</button>
        <button data-testid="grow-above-viewport" onClick={growAboveViewport}>Grow above</button>
        <button data-testid="grow-frozen-row" onClick={growFrozenRow}>Grow frozen row</button>
        <button data-testid="reset-row-heights" onClick={resetRowHeights}>Reset heights</button>
        <button data-testid="use-auto-fit" onClick={useAutoFit}>Auto fit</button>
        <button data-testid="use-auto-fit-paged" onClick={useAutoFitPaged}>Auto fit paged</button>
        <button data-testid="freeze-two" onClick={() => freezeCount(2)}>Freeze 2</button>
        <button data-testid="use-column-groups" onClick={useColumnGroups}>Column groups</button>
        <button data-testid="use-wide-groups" onClick={useWideGroups}>Wide groups</button>
        <button data-testid="move-x-between" onClick={withCore((core) => columnGroups.moveXBetween(core))}>X between</button>
        <button data-testid="move-x-back" onClick={withCore((core) => columnGroups.moveXBack(core))}>X back</button>
        <button data-testid="hide-b" onClick={withCore((core) => columnGroups.setHidden(core, "b", true))}>Hide B</button>
        <button data-testid="show-b" onClick={withCore((core) => columnGroups.setHidden(core, "b", false))}>Show B</button>
        <button data-testid="pin-a" onClick={withCore((core) => columnGroups.pin(core, "a", "start"))}>Pin A</button>
        <button data-testid="reset-order" onClick={withCore((core) => columnGroups.resetOrder(core))}>Reset order</button>
        <button data-testid="replace-groups" onClick={replaceSchema(columnGroups.replacement)}>Replace groups</button>
        <button data-testid="reject-cycle" onClick={replaceSchema(columnGroups.cyclic)}>Reject cycle</button>
        <button data-testid="reject-missing" onClick={replaceSchema(columnGroups.missing)}>Reject missing</button>
        <button data-testid="over-budget-move" onClick={overBudgetMove}>Over budget</button>
        <button data-testid="tall-band" onClick={tallBand}>Tall band</button>
        <button data-testid="freeze-three" onClick={() => freezeCount(3)}>Freeze 3 rows</button>
        <button data-testid="use-row-groups" onClick={() => armRowGroups("object")}>RG</button>
        <button data-testid="use-row-groups-columnar" onClick={() => armRowGroups("columnar")}>RG col</button>
        <button data-testid="use-row-groups-external" onClick={() => armRowGroups("external")}>RG ext</button>
        <button data-testid="use-row-groups-paged" onClick={() => armRowGroups("paged")}>RG page</button>
        <button data-testid="expand-all" onClick={withCore(rowGroups.expandAll)}>Exp</button>
        <button data-testid="collapse-all" onClick={withCore(rowGroups.collapseAll)}>Col</button>
        <button data-testid="tall-leaf" onClick={withCore(rowGroups.tallLeaf)}>Tall</button>
        <button data-testid="ungroup" onClick={ungroup}>Flat</button>
        <button data-testid="replace-revision" onClick={withCore((core) => void rowGroups.replaceRevision(core))}>Rev</button>
        <button data-testid="format-country" onClick={() => setRowGroupColumns("formatted")}>Fmt</button>
        <output data-testid="metrics">{JSON.stringify(metrics)}</output>
      </div>
      <div
        data-testid="grid-host"
        dir={rtl ? "rtl" : "ltr"}
        style={{ width: hostWidth, height: columnGroupsActive ? COLUMN_GROUPS_HOST_HEIGHT : hostHeight }}
      >
        {mounted && (
          <Grid
            key={generation}
            gridRef={gridRef}
            columns={activeColumns()}
            columnState={frozenActive ? frozen.columnState : columnState}
            columnLayout={activeColumnLayout()}
            dataSource={activeDataSource()}
            rowData={activeRowData()}
            rowHeight={activeRowHeight()}
            headerHeight={activeHeaderHeight()}
            columnGroups={columnGroupsActive ? groupsSchema.groups : undefined}
            headerBandHeights={columnGroupsActive ? bandHeights : undefined}
            columnGroupLimits={columnGroupsActive ? groupLimits : undefined}
            freezeRows={activeFreezeRows()}
            rowResize={autoFitActive}
            rowLoading={activeRowLoading()}
            getRowId={(row) => row.id}
            onCellValueChanged={onCellValueChanged}
            onWriteRejected={onWriteRejected}
            onColumnResized={onColumnResized}
            onColumnMoved={onColumnMoved}
            onRowDragEnd={onRowDragEnd}
            onColumnPinned={onColumnPinned}
            onRowResized={onRowResized}
            onColumnSchemaRejected={onColumnSchemaRejected}
            onFrozenRowsChanged={frozen.recordFreezeEvent}
            cellRenderers={ROW_GROUP_RENDERERS}
            rowGrouping={rowGroupsActive ? rowGroupsArm.grouping : undefined}
            groupLabelColumn={rowGroupsActive ? rowGroups.labelColumn() : undefined}
            groupLabelRenderer={rowGroupsMode === "external" ? renderExternalLabel : undefined}
            onRowGroupToggled={rowGroups.recordToggle}
            onRowGroupingRejected={rowGroups.recordRejection}
          />
        )}
      </div>
    </main>
  );
};
