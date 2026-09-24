import { GridCore, createClientDataSource, defaultPinIcon } from "@gp-grid/core";
import type {
  CellBounds,
  CellRendererParams,
  ColumnDefinition,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnPin,
  ColumnRegion,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnWindowSnapshot,
  FillHandlePosition,
  FreezeRowsOptions,
  FrozenRowsState,
  GridIcon,
  GridInstruction,
  GridLabelOverrides,
  HeaderRendererParams,
  RowDragEndEvent,
  RowRegionLayout,
  ViewRow,
} from "@gp-grid/core";
import type {
  FreezeRowsOptions as ReactFreezeRowsOptions,
  FrozenRowsState as ReactFrozenRowsState,
  GridProps,
  GridRef,
} from "@gp-grid/react";
import type { GpGridProps } from "@gp-grid/vue";
import type {
  AngularColumnDefinition,
  FreezeRowsOptions as AngularFreezeRowsOptions,
  FrozenRowsState as AngularFrozenRowsState,
  GridLabelOverrides as AngularGridLabelOverrides,
} from "@gp-grid/angular";

interface Row {
  id: number;
  name: string;
}

const columns: ColumnDefinition[] = [
  { colId: "name", field: "name", headerName: "Name", width: 180, cellDataType: "text", editable: true, pinned: "start" },
];
const pinIcon: GridIcon = defaultPinIcon;
const rectangle: CellBounds | undefined = undefined;
const rows: Row[] = [{ id: 1, name: "Ada" }];
// Positional prefix: displayed rows `[0, count)` stay below the header.
const freezeRows: FreezeRowsOptions = { count: 3, maxCount: 100, minSuffixHeight: 64 };
// The core formats its live-region announcement from these overrides.
const labelOverrides: GridLabelOverrides = { frozenRowsLimited: "{effective} of {requested} rows frozen" };
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
  getRowId: (row) => row.id,
  onColumnResized: (event: ColumnResizedEvent) => void event.viewIndex,
  onColumnMoved: (event: ColumnMovedEvent) => void event.fromViewIndex,
  onColumnPinned: (event: ColumnPinnedEvent) => void event.pinned,
  onFrozenRowsChanged: (state: FrozenRowsState) => void state.effectiveCount,
  onRowDragEnd: (event: RowDragEndEvent) => void event.rowId,
});
const unsubscribe = core.onBatchInstruction((instructions: GridInstruction[]) => {
  void instructions;
});
const record: Row | undefined = core.rows.getData(0);
const rowExists: boolean = core.rows.has(0);
const viewRow: ViewRow<Row> | undefined = core.rows.getViewRow(0);
const byId: Row | undefined = core.rows.getRecordById(1);
const slotGeneration: number = core.rows.getSlotGeneration(0);
const generationIsCurrent: boolean = core.rows.isSlotGenerationCurrent(0, slotGeneration);

const columnId: string = "name";
const columnState: ColumnStateUpdate[] = [{ columnId, width: 240, hidden: false, order: 0, pinned: "end" }];
core.columns.setState(columnState);
core.columns.setState([{ columnId, pinned: null }]);
core.columns.resetState([columnId]);
core.columns.resetState();
const snapshots: ColumnStateSnapshot[] = core.columns.getState();
const requestedPin: ColumnPin | null = snapshots[0]?.pinned ?? null;
const effectiveRegion: ColumnRegion | null = snapshots[0]?.region ?? null;

// Pin commands and the published mounted window.
const pin: ColumnPin = "start";
core.columns.setPinned(columnId, pin);
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
const reactProps: GridProps<Row> = {
  columns,
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
const vueProps: GpGridProps<Row> = {
  columns,
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
} = {
  freezeRows: { count: 3, maxCount: 100, minSuffixHeight: 64 },
  onFrozenRowsChanged: (state) => void state.effectiveCount,
  labels: { frozenRowsLimited: "{effective} of {requested} rows frozen" },
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
unsubscribe();
core.destroy();
