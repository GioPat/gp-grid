import { GridCore, createClientDataSource } from "@gp-grid/core";
import type {
  CellRendererParams,
  ColumnDefinition,
  ColumnId,
  ColumnMovedEvent,
  ColumnResizedEvent,
  ColumnStateSnapshot,
  ColumnStateUpdate,
  GridInstruction,
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
  { colId: "name", field: "name", headerName: "Name", width: 180, cellDataType: "text", editable: true },
];
const rows: Row[] = [{ id: 1, name: "Ada" }];
const core = new GridCore<Row>({
  columns,
  dataSource: createClientDataSource(rows),
  rowHeight: 32,
  getRowId: (row) => row.id,
  onColumnResized: (event: ColumnResizedEvent) => void event.viewIndex,
  onColumnMoved: (event: ColumnMovedEvent) => void event.fromViewIndex,
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
const columnState: ColumnStateUpdate[] = [{ columnId, width: 240, hidden: false, order: 0 }];
core.setColumnState(columnState);
core.resetColumnState([columnId]);
core.resetColumnState();
const snapshots: ColumnStateSnapshot[] = core.getColumnState();

const reactRef: GridRef<Row> = { core };
const reactProps: GridProps<Row> = {
  columns,
  columnState,
  rowData: rows,
  rowHeight: 32,
  gridRef: { current: reactRef },
  getRowId: (row) => row.id,
  onColumnResized: (event) => void event.columnId,
  onColumnMoved: (event) => void event.toViewIndex,
  onRowDragEnd: (event) => void event.rowId,
};
const vueProps: GpGridProps<Row> = {
  columns,
  columnState,
  rowData: rows,
  rowHeight: 32,
  getRowId: (row) => row.id,
  onColumnResized: (event) => void event.columnId,
  onColumnMoved: (event) => void event.toViewIndex,
  onRowDragEnd: (event) => void event.rowId,
};
const angularColumns: AngularColumnDefinition[] = columns;
// `rowData` is now optional: a record-less (columnar) row has none.
const renderName = (params: CellRendererParams<Row>): string =>
  `${params.columnId}:${String(params.rowData?.name ?? "")}`;

void record;
void rowExists;
void viewRow;
void byId;
void generationIsCurrent;
void snapshots;
void reactProps;
void vueProps;
void angularColumns;
void renderName;
unsubscribe();
core.destroy();
