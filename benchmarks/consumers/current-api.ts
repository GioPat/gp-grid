import { GridCore, createClientDataSource } from "@gp-grid/core";
import type { CellRendererParams, ColumnDefinition, GridInstruction } from "@gp-grid/core";
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
});
const unsubscribe = core.onBatchInstruction((instructions: GridInstruction[]) => {
  void instructions;
});
const record: Row | undefined = core.getRowData(0);
const reactRef: GridRef<Row> = { core };
const reactProps: GridProps<Row> = {
  columns,
  rowData: rows,
  rowHeight: 32,
  gridRef: { current: reactRef },
  getRowId: (row) => row.id,
};
const vueProps: GpGridProps<Row> = {
  columns,
  rowData: rows,
  rowHeight: 32,
  getRowId: (row) => row.id,
};
const angularColumns: AngularColumnDefinition[] = columns;
// `rowData` is now optional: a record-less (columnar) row has none.
const renderName = (params: CellRendererParams<Row>): string =>
  String(params.rowData?.name ?? "");

void record;
void reactProps;
void vueProps;
void angularColumns;
void renderName;
unsubscribe();
core.destroy();
