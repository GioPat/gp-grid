// Generic read-only columnar consumer example (plan 001a step 4).
// Compiles against built gp-grid declarations. No platform SDK, adapter,
// mock, or third-party dependency is involved.

import {
  GridCore,
  createColumnarDataSource,
} from "@gp-grid/core";
import type {
  CellRendererParams,
  ColumnarDataSource,
  ColumnDefinition,
} from "@gp-grid/core";
import type { GridProps, GridRef } from "@gp-grid/react";
import type { GpGridProps } from "@gp-grid/vue";
import type { AngularColumnDefinition } from "@gp-grid/angular";

// Borrowed columns: ordinary array, typed-array views and a derived accessor.
const ids = new Int32Array([1, 2, 3]);
const names = ["Ada", "Grace", "Linus"];
const scores = new Float64Array([10.5, 20.25, 30.125]);

const source: ColumnarDataSource = createColumnarDataSource({
  getRowId: (sourceRow) => ids[sourceRow]!,
  fields: [
    { field: "id", data: ids },
    { field: "name", data: names },
    { field: "score", data: scores },
    {
      field: "label",
      getValue: (sourceRow) => `${names[sourceRow]}:${scores[sourceRow]}`,
    },
  ],
});

const columns: ColumnDefinition[] = [
  { field: "id", headerName: "ID", cellDataType: "number", width: 70 },
  { field: "name", headerName: "Name", cellDataType: "text", width: 160 },
  { field: "label", headerName: "Label", cellDataType: "text", width: 160 },
];

const core = new GridCore({
  columns,
  dataSource: source,
  rowHeight: 32,
  onWriteRejected: (event) => {
    void event.row;
    void event.field;
    void event.reason;
  },
});

const value: string | number | boolean | Date | object | null =
  core.getCellValue(0, 1);
const identity = core.getRowId(0);
const writable: boolean = core.isWritable();

// Renderers receive formatted value, identity and cross-field raw access
// without a materialized record.
const renderLabel = (params: CellRendererParams): string => {
  const score = params.getValue?.("score") ?? null;
  return `${params.value} (${score})`;
};

const reactRef: GridRef = { core };
const reactProps: GridProps = {
  columns,
  dataSource: source,
  rowHeight: 32,
  gridRef: { current: reactRef },
};
const vueProps: GpGridProps = {
  columns,
  dataSource: source,
  rowHeight: 32,
};
const angularColumns: AngularColumnDefinition[] = columns;

// Empty input and replacement use the same public API.
const empty: ColumnarDataSource = createColumnarDataSource({
  fields: [{ field: "id", data: new Int32Array(0) }],
});

void value;
void identity;
void writable;
void renderLabel;
void reactProps;
void vueProps;
void angularColumns;
void empty;
core.destroy();
