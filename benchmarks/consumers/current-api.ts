import {
  GridCore,
  createClientDataSource,
  createColumnGroupLookup,
  createDomMeasurementHost,
  createInitialState,
  defaultPinIcon,
  fragmentHeaderId,
  leafHeaderId,
} from "@gp-grid/core";
import type {
  AutoFitOptions,
  CellBounds,
  CellRendererParams,
  ColumnDefinition,
  ColumnFitResult,
  ColumnGroupChild,
  ColumnGroupDefinition,
  ColumnGroupHeaderParams,
  ColumnGroupLimits,
  ColumnSchemaError,
  ColumnSchemaErrorCode,
  ColumnSchemaResult,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnPin,
  ColumnRegion,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnWindowSnapshot,
  FillHandlePosition,
  FitStatus,
  FreezeRowsOptions,
  FrozenRowsState,
  GridColumnSchemaErrorLabels,
  GridHeaderApi,
  GridIcon,
  GridInstruction,
  GridLabelOverrides,
  GridRowHeightsApi,
  GridState,
  HeaderBandLayout,
  HeaderFragment,
  HeaderFragments,
  HeaderRendererParams,
  MeasurementHost,
  ResizeTarget,
  RowDragEndEvent,
  RowFitResult,
  RowHeightUpdate,
  RowRegionLayout,
  RowResizeDragState,
  RowResizedEvent,
  SetHeaderBandsInstruction,
  ViewRow,
} from "@gp-grid/core";
import type {
  FreezeRowsOptions as ReactFreezeRowsOptions,
  FrozenRowsState as ReactFrozenRowsState,
  GridProps,
  GridRef,
  ReactGroupHeaderRenderer,
} from "@gp-grid/react";
import type { GpGridProps, VueGroupHeaderRenderer } from "@gp-grid/vue";
import type {
  AngularColumnDefinition,
  AngularColumnGroupChild,
  AutoFitOptions as AngularAutoFitOptions,
  ColumnSchemaError as AngularColumnSchemaError,
  FreezeRowsOptions as AngularFreezeRowsOptions,
  FrozenRowsState as AngularFrozenRowsState,
  GridLabelOverrides as AngularGridLabelOverrides,
  RowResizedEvent as AngularRowResizedEvent,
} from "@gp-grid/angular";

interface Row {
  id: number;
  name: string;
}

const columns: ColumnDefinition[] = [
  { colId: "name", field: "name", headerName: "Name", width: 180, cellDataType: "text", editable: true, pinned: "start", wrapHeaderText: true },
  { colId: "age", field: "age", width: 80, cellDataType: "number" },
];
// Nested header groups over the column ids (PRD 007): every column once.
const personGroup: ColumnGroupDefinition = {
  groupId: "person",
  headerName: "Person",
  wrapHeaderText: false,
  headerRenderer: (params: ColumnGroupHeaderParams) => `${params.groupId}:${params.columnIds.join(",")}`,
  children: ["name", "age"],
};
const columnGroups: ColumnGroupChild[] = [personGroup];
const groupLimits: ColumnGroupLimits = { maxDepth: 64, maxNodes: 100_000, maxFragments: 100_000 };
const autoFit: AutoFitOptions = { maxColumnWidth: 600, minRowHeight: 32, maxRowHeight: 320 };
const schemaErrorLabels: Partial<GridColumnSchemaErrorLabels> = { missingLeaf: 'Column "{id}" is missing' };
const pinIcon: GridIcon = defaultPinIcon;
const rectangle: CellBounds | undefined = undefined;
const rows: Row[] = [{ id: 1, name: "Ada" }];
// Positional prefix: displayed rows `[0, count)` stay below the header.
const freezeRows: FreezeRowsOptions = { count: 3, maxCount: 100, minSuffixHeight: 64 };
// The core formats its live-region announcement from these overrides.
const labelOverrides: GridLabelOverrides = {
  frozenRowsLimited: "{effective} of {requested} rows frozen",
  columnSchemaErrors: schemaErrorLabels,
};
// The adapter kit's DOM reads; wrappers build one in the browser only.
const measurementHost: MeasurementHost = createDomMeasurementHost(() => null);
const core = new GridCore<Row>({
  columns,
  dataSource: createClientDataSource(rows),
  rowHeight: 32,
  // Displayed-width policy; `"fit"` is the default.
  columnLayout: "fit",
  // CSS px of center columns kept mounted past each clip edge.
  columnOverscan: 240,
  freezeRows,
  labels: labelOverrides,
  headerHeight: 36,
  headerBandHeights: [40],
  columnGroups,
  columnGroupLimits: groupLimits,
  rowResize: true,
  autoFit,
  measurementHost,
  getRowId: (row) => row.id,
  onColumnResized: (event: ColumnResizedEvent) => void event.viewIndex,
  onRowResized: (event: RowResizedEvent) => void event.height,
  onColumnSchemaRejected: (error: ColumnSchemaError) => void error.message,
  onColumnMoved: (event: ColumnMovedEvent) => void event.fromViewIndex,
  onColumnPinned: (event: ColumnPinnedEvent) => void event.pinned,
  onFrozenRowsChanged: (state: FrozenRowsState) => void state.effectiveCount,
  onRowDragEnd: (event: RowDragEndEvent) => void event.rowId,
});
const unsubscribe = core.onBatchInstruction((instructions: GridInstruction[]) => {
  for (const instruction of instructions) {
    if (instruction.type === "SET_HEADER_BANDS") {
      const bandsInstruction: SetHeaderBandsInstruction = instruction;
      void bandsInstruction.bands.totalHeight;
    }
  }
});
const record: Row | undefined = core.rows.getData(0);
const rowExists: boolean = core.rows.has(0);
const viewRow: ViewRow<Row> | undefined = core.rows.getViewRow(0);
const byId: Row | undefined = core.rows.getRecordById(1);
const slotGeneration: number = core.rows.getSlotGeneration(0);
const generationIsCurrent: boolean = core.rows.isSlotGenerationCurrent(0, slotGeneration);

const columnId: string = "name";
const columnState: ColumnStateUpdate[] = [{ columnId, width: 240, hidden: false, order: 0, pinned: "end" }];
// The guarded column commands report a schema result (PRD 007).
const stateResult: ColumnSchemaResult = core.columns.setState(columnState);
core.columns.setState([{ columnId, pinned: null }]);
core.columns.setState([{ columnId, width: null }]);
core.columns.resetState([columnId]);
const resetResult: ColumnSchemaResult = core.columns.resetState();
const moveResult: ColumnSchemaResult = core.columns.move(0, 1);
const rejectedCode: ColumnSchemaErrorCode | null =
  moveResult.status === "rejected" ? moveResult.error.code : null;
const snapshots: ColumnStateSnapshot[] = core.columns.getState();
const requestedPin: ColumnPin | null = snapshots[0]?.pinned ?? null;
const effectiveRegion: ColumnRegion | null = snapshots[0]?.region ?? null;

// Pin commands and the published mounted window.
const pin: ColumnPin = "start";
const pinResult: ColumnSchemaResult = core.columns.setPinned(columnId, pin);
core.columns.setPinned(columnId, null);
const columnWindow: ColumnWindowSnapshot = core.geometry.getColumnWindow();
const windowRange = core.geometry.getColumnWindow().range;
const clip = core.geometry.getColumnClip(0);
// Frozen prefix state, the published region layout (C2/C3) and the C12 runtime
// commands: a config replaces the whole triple, an equal request emits nothing.
const frozenRows: FrozenRowsState = core.frozenRows.get();
const rowRegions: RowRegionLayout = core.geometry.getRowRegions();
void core.frozenRows.set({ count: 3 });
void core.frozenRows.set(undefined);
void core.frozenRows.freezeThrough(2);

// Row-height commands by identity (PRD 006) and the axis input they publish.
const rowHeightUpdate: RowHeightUpdate = { rowId: 1, height: 64 };
void core.rowHeights.set([rowHeightUpdate]);
const rowHeightCommands: GridRowHeightsApi = core.rowHeights;
void core.rowHeights.set([{ rowId: "row-2", height: 96 }]);
void core.rowHeights.reset([1]);
void core.rowHeights.reset();
const storedHeights: readonly RowHeightUpdate[] = core.rowHeights.getOverrides();
const tallest: number = storedHeights[0]?.height ?? 0;
void rowHeightCommands;
void tallest;

// One-shot fits and row resize (PRD 007).
const rowFit: RowFitResult = core.rowHeights.fit();
const rowFitStatus: FitStatus = core.rowHeights.fit([1]).status;
core.rowHeights.setResizable(false);
const rowsResizable: boolean = core.rowHeights.isResizable();
const columnFit: ColumnFitResult = core.columns.fit([columnId]);
const fittedWidth: number = core.columns.fit().columns[0]?.width ?? 0;
const resizeTarget: ResizeTarget = { axis: "row", rowIndex: 0 };
core.input.handleResizeDoubleClick(resizeTarget);
const rowResizeDrag: RowResizeDragState | null = null;

// Column groups, header bands and their published state (PRD 007).
const schemaResult: ColumnSchemaResult = core.columns.set(columns, columnGroups);
core.columns.set(columns, null);
core.columns.setGroups(columnGroups);
const activeGroups: readonly ColumnGroupChild[] | null = core.columns.getGroups();
const groupById: ColumnGroupDefinition | undefined = core.columns.getGroup("person");
const preCoreGroup: ColumnGroupDefinition | undefined = createColumnGroupLookup(columnGroups)("person");
const headerCommands: GridHeaderApi = core.header;
core.header.setBandHeights([40, 28]);
const bands: HeaderBandLayout = core.header.getBands();
const bandCount: number = core.geometry.getColumnLayout().bandCount;
const leafBand: number = core.geometry.getColumnLayout().columns[0]?.headerBand ?? 0;
const fragments: HeaderFragments = core.geometry.getColumnWindow().groups;
const firstFragment: HeaderFragment | undefined = fragments.center[0];
const seededState: GridState<Row> = createInitialState<Row>({
  initialColumns: columns,
  initialHeaderHeight: 36,
  initialHeaderBandHeights: [40],
  initialColumnGroups: columnGroups,
});
const seededBands: HeaderBandLayout = seededState.headerBands;
const headerIds = [leafHeaderId("grid", "name"), fragmentHeaderId("grid", "person:center:0")];
const fillHandle: FillHandlePosition | null = null;
const headerPinControl = (params: HeaderRendererParams): void => {
  let nextPin: ColumnPin | null = null;
  if (params.pinned === null) nextPin = "start";
  if (params.pinned === "start") nextPin = "end";
  params.onPinChange(nextPin);
};

// Bounds by identity, layout revision and the geometry queries.
const nameBounds: CellBounds | undefined = core.cells.getBounds(1, "name", "viewport");
const contentBounds: CellBounds | undefined = core.cells.getBounds(1, "name", "content");
const rowsBounds: CellBounds | undefined = core.cells.getBounds(1, "name", "rows");
const layoutRevision: number = core.geometry.revision;
const totalWidth: number = core.geometry.getColumnLayout().totalWidth;
const hit = core.geometry.hitTest({ x: 10, y: 10 });
const scrollTarget = core.geometry.getScrollTarget(12, 0);
core.columns.setLayout("fixed");
core.columns.setLayout("fit");

const reactRef: GridRef<Row> = { core };
const reactFreezeRows: ReactFreezeRowsOptions = { count: 3 };
const onReactFrozenRowsChanged = (state: ReactFrozenRowsState): void => void state.limit;
const reactGroupRenderer: ReactGroupHeaderRenderer = (params) => params.groupId;
const reactProps: GridProps<Row> = {
  columns,
  columnGroups,
  columnGroupLimits: groupLimits,
  headerBandHeights: [40],
  rowResize: true,
  autoFit,
  onRowResized: (event) => void event.rowId,
  onColumnSchemaRejected: (error) => void error.code,
  headerRenderers: { person: reactGroupRenderer },
  columnState,
  rowData: rows,
  rowHeight: 32,
  gridRef: { current: reactRef },
  columnOverscan: 240,
  freezeRows: reactFreezeRows,
  getRowId: (row) => row.id,
  onColumnResized: (event) => void event.columnId,
  onColumnMoved: (event) => void event.toViewIndex,
  onColumnPinned: (event) => void event.pinned,
  onFrozenRowsChanged: onReactFrozenRowsChanged,
  onRowDragEnd: (event) => void event.rowId,
  pinIcon,
};
const vueGroupRenderer: VueGroupHeaderRenderer = (params: ColumnGroupHeaderParams) => params.groupId;
const vueProps: GpGridProps<Row> = {
  columns,
  columnGroups,
  columnGroupLimits: groupLimits,
  headerBandHeights: [40],
  rowResize: true,
  autoFit,
  onRowResized: (event) => void event.rowId,
  onColumnSchemaRejected: (error) => void error.code,
  headerRenderers: { person: vueGroupRenderer },
  columnState,
  rowData: rows,
  rowHeight: 32,
  columnOverscan: 240,
  freezeRows: { count: 3 },
  getRowId: (row) => row.id,
  onColumnResized: (event) => void event.columnId,
  onColumnMoved: (event) => void event.toViewIndex,
  onColumnPinned: (event) => void event.pinned,
  onFrozenRowsChanged: (state) => void state.effectiveCount,
  onRowDragEnd: (event) => void event.rowId,
  pinIcon,
};
const angularColumns: AngularColumnDefinition[] = columns;
// Angular exposes the same surface as component inputs and an output.
const angularInputs: {
  freezeRows: AngularFreezeRowsOptions;
  onFrozenRowsChanged: (state: AngularFrozenRowsState) => void;
  labels: AngularGridLabelOverrides;
  columnGroups: readonly AngularColumnGroupChild[];
  headerBandHeights: readonly number[];
  rowResize: boolean;
  autoFit: AngularAutoFitOptions;
  onRowResized: (event: AngularRowResizedEvent) => void;
  onColumnSchemaRejected: (error: AngularColumnSchemaError) => void;
} = {
  freezeRows: { count: 3, maxCount: 100, minSuffixHeight: 64 },
  onFrozenRowsChanged: (state) => void state.effectiveCount,
  labels: { frozenRowsLimited: "{effective} of {requested} rows frozen", columnSchemaErrors: { cycle: "Cycle at {id}" } },
  columnGroups: ["name", { groupId: "rest", children: ["age"] }],
  headerBandHeights: [],
  rowResize: true,
  autoFit: { maxColumnWidth: 600 },
  onRowResized: (event) => void event.viewIndex,
  onColumnSchemaRejected: (error) => void error.source,
};
// `rowData` is now optional: a record-less (columnar) row has none.
const renderName = (params: CellRendererParams<Row>): string =>
  `${params.columnId}:${String(params.rowData?.name ?? "")}`;

void rectangle;
void nameBounds;
void contentBounds;
void rowsBounds;
void layoutRevision;
void totalWidth;
void hit.row;
void hit.col;
void scrollTarget.scrollTop;
void scrollTarget.scrollLeft;
void record;
void rowExists;
void viewRow;
void byId;
void generationIsCurrent;
void snapshots;
void requestedPin;
void effectiveRegion;
void columnWindow;
void windowRange.start;
void clip?.end;
void frozenRows;
void frozenRows.effectiveCount;
void frozenRows.limit;
void frozenRows.requestedCount;
void rowRegions;
void rowRegions.frozenCount;
void freezeRows;
void labelOverrides;
void fillHandle;
void headerPinControl;
void reactProps;
void reactFreezeRows;
void onReactFrozenRowsChanged;
void vueProps;
void angularColumns;
void angularInputs;
void renderName;
void stateResult;
void resetResult;
void rejectedCode;
void pinResult;
void rowFit;
void rowFitStatus;
void rowsResizable;
void columnFit;
void fittedWidth;
void rowResizeDrag;
void schemaResult;
void activeGroups;
void groupById;
void preCoreGroup;
void headerCommands;
void bands;
void bandCount;
void leafBand;
void firstFragment;
void seededBands;
void headerIds;
void reactGroupRenderer;
void vueGroupRenderer;
unsubscribe();
core.destroy();
