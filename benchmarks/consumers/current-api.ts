import { GridCore, createClientDataSource, defaultPinIcon } from "@gp-grid/core";
import type {
  CellBounds,
  CellRendererParams,
  ColumnDefinition,
  ColumnId,
  ColumnMovedEvent,
  ColumnPinnedEvent,
  ColumnPin,
  ColumnRegion,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  ColumnWindowSnapshot,
  FillHandlePosition,
  GridIcon,
  GridInstruction,
  HeaderRendererParams,
  RowDragEndEvent,
  ViewRow,
} from "@gp-grid/core";
import type { GridProps, GridRef } from "@gp-grid/react";
import type { GpGridProps } from "@gp-grid/vue";
import type { AngularColumnDefinition } from "@gp-grid/angular";

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
const core = new GridCore<Row>({
  columns,
  dataSource: createClientDataSource(rows),
  rowHeight: 32,
  // Displayed-width policy; `"fit"` is the default.
  columnLayout: "fit",
  // CSS px of center columns kept mounted past each clip edge.
  columnOverscan: 240,
  getRowId: (row) => row.id,
  onColumnResized: (event: ColumnResizedEvent) => void event.viewIndex,
  onColumnMoved: (event: ColumnMovedEvent) => void event.fromViewIndex,
  onColumnPinned: (event: ColumnPinnedEvent) => void event.pinned,
  onRowDragEnd: (event: RowDragEndEvent) => void event.rowId,
});
const unsubscribe = core.onBatchInstruction((instructions: GridInstruction[]) => {
  void instructions;
});
const record: Row | undefined = core.getRowData(0);
const rowExists: boolean = core.hasRow(0);
const viewRow: ViewRow<Row> | undefined = core.getViewRow(0);
const byId: Row | undefined = core.getRecordById(1);
const slotGeneration: number = core.getSlotGeneration(0);
const generationIsCurrent: boolean = core.isSlotGenerationCurrent(0, slotGeneration);

const columnId: ColumnId = "name";
const columnState: ColumnStateUpdate[] = [{ columnId, width: 240, hidden: false, order: 0, pinned: "end" }];
core.setColumnState(columnState);
core.setColumnState([{ columnId, pinned: null }]);
core.resetColumnState([columnId]);
core.resetColumnState();
const snapshots: ColumnStateSnapshot[] = core.getColumnState();
const requestedPin: ColumnPin | null = snapshots[0]?.pinned ?? null;
const effectiveRegion: ColumnRegion | null = snapshots[0]?.region ?? null;

// Pin commands and the published mounted window.
const pin: ColumnPin = "start";
core.setColumnPinned(columnId, pin);
core.setColumnPinned(columnId, null);
const columnWindow: ColumnWindowSnapshot = core.geometry.getColumnWindow();
const windowRange = core.geometry.getColumnWindow().range;
const clip = core.geometry.getColumnClip(0);
const fillHandle: FillHandlePosition | null = null;
const headerPinControl = (params: HeaderRendererParams): void => {
  let nextPin: ColumnPin | null = null;
  if (params.pinned === null) nextPin = "start";
  if (params.pinned === "start") nextPin = "end";
  params.onPinChange(nextPin);
};

// Bounds by identity, layout revision and the geometry queries.
const nameBounds: CellBounds | undefined = core.getCellBounds(1, "name", "viewport");
const contentBounds: CellBounds | undefined = core.getCellBounds(1, "name", "content");
const rowsBounds: CellBounds | undefined = core.getCellBounds(1, "name", "rows");
const layoutRevision: number = core.geometry.revision;
const totalWidth: number = core.geometry.getColumnLayout().totalWidth;
const hit = core.geometry.hitTest({ x: 10, y: 10 });
const scrollTarget = core.geometry.getScrollTarget(12, 0);
core.setColumnLayout("fixed");
core.setColumnLayout("fit");

const reactRef: GridRef<Row> = { core };
const reactProps: GridProps<Row> = {
  columns,
  columnState,
  rowData: rows,
  rowHeight: 32,
  gridRef: { current: reactRef },
  columnOverscan: 240,
  getRowId: (row) => row.id,
  onColumnResized: (event) => void event.columnId,
  onColumnMoved: (event) => void event.toViewIndex,
  onColumnPinned: (event) => void event.pinned,
  onRowDragEnd: (event) => void event.rowId,
  pinIcon,
};
const vueProps: GpGridProps<Row> = {
  columns,
  columnState,
  rowData: rows,
  rowHeight: 32,
  columnOverscan: 240,
  getRowId: (row) => row.id,
  onColumnResized: (event) => void event.columnId,
  onColumnMoved: (event) => void event.toViewIndex,
  onColumnPinned: (event) => void event.pinned,
  onRowDragEnd: (event) => void event.rowId,
  pinIcon,
};
const angularColumns: AngularColumnDefinition[] = columns;
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
void fillHandle;
void headerPinControl;
void reactProps;
void vueProps;
void angularColumns;
void renderName;
unsubscribe();
core.destroy();
