// Normalized column definitions that can be converted to library-specific formats

import type { BenchmarkRow } from "./generate-data";

export interface NormalizedColumn {
  field: keyof BenchmarkRow;
  headerName: string;
  width: number;
  type: "text" | "number" | "date" | "boolean";
  sortable: boolean;
  filterable: boolean;
}

export const BENCHMARK_COLUMNS: NormalizedColumn[] = [
  {
    field: "id",
    headerName: "ID",
    width: 80,
    type: "number",
    sortable: true,
    filterable: true,
  },
  {
    field: "name",
    headerName: "Name",
    width: 180,
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    field: "age",
    headerName: "Age",
    width: 80,
    type: "number",
    sortable: true,
    filterable: true,
  },
  {
    field: "email",
    headerName: "Email",
    width: 250,
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    field: "status",
    headerName: "Status",
    width: 100,
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    field: "salary",
    headerName: "Salary",
    width: 120,
    type: "number",
    sortable: true,
    filterable: true,
  },
  {
    field: "department",
    headerName: "Department",
    width: 140,
    type: "text",
    sortable: true,
    filterable: true,
  },
  {
    field: "hireDate",
    headerName: "Hire Date",
    width: 120,
    type: "date",
    sortable: true,
    filterable: true,
  },
  {
    field: "isManager",
    headerName: "Manager",
    width: 80,
    type: "boolean",
    sortable: true,
    filterable: true,
  },
  {
    field: "rating",
    headerName: "Rating",
    width: 80,
    type: "number",
    sortable: true,
    filterable: true,
  },
];

// Total width of all columns
export function getTotalColumnsWidth(cols: NormalizedColumn[]): number {
  return cols.reduce((sum, col) => sum + col.width, 0);
}

// Generic type map for cell data types
type GpGridCellDataType = "text" | "number" | "date";

interface GpGridColumn {
  field: keyof BenchmarkRow;
  headerName: string;
  width: number;
  cellDataType: GpGridCellDataType;
  sortable: boolean;
  filterable: boolean;
}

const gpGridTypeMap: Record<NormalizedColumn["type"], GpGridCellDataType> = {
  text: "text",
  number: "number",
  date: "date",
  boolean: "text",
};

// Convert to gp-grid format
export function toGpGridColumns(cols: NormalizedColumn[]): GpGridColumn[] {
  return cols.map((col) => ({
    field: col.field,
    headerName: col.headerName,
    width: col.width,
    cellDataType: gpGridTypeMap[col.type],
    sortable: col.sortable,
    filterable: col.filterable,
  }));
}

// Convert to AG Grid format
export function toAgGridColumns(cols: NormalizedColumn[]) {
  return cols.map((col) => ({
    field: col.field,
    headerName: col.headerName,
    width: col.width,
    sortable: col.sortable,
    filter: col.filterable,
    resizable: false,
  }));
}

// Convert to TanStack Table format
export function toTanStackColumns(cols: NormalizedColumn[]) {
  return cols.map((col) => ({
    accessorKey: col.field,
    header: col.headerName,
    size: col.width,
    enableSorting: col.sortable,
    enableColumnFilter: col.filterable,
  }));
}

// Convert to Handsontable format
const handsontableTypeMap: Record<NormalizedColumn["type"], string> = {
  text: "text",
  number: "numeric",
  date: "date",
  boolean: "checkbox",
};

export function toHandsontableColumns(cols: NormalizedColumn[]) {
  return cols.map((col) => ({
    data: col.field,
    title: col.headerName,
    width: col.width,
    type: handsontableTypeMap[col.type],
    readOnly: true,
  }));
}

// Convert to Smart.Grid format
const smartGridTypeMap: Record<NormalizedColumn["type"], string> = {
  text: "string",
  number: "number",
  date: "date",
  boolean: "bool",
};

export function toSmartGridColumns(cols: NormalizedColumn[]) {
  return cols.map((col) => ({
    dataField: col.field,
    label: col.headerName,
    width: col.width,
    dataType: smartGridTypeMap[col.type],
    allowSort: col.sortable,
    allowFilter: col.filterable,
    allowResize: false,
  }));
}

// Smart.Grid DataAdapter field types (note: distinct from the column dataType
// map above — the adapter uses "boolean", the column uses "bool").
const smartGridFieldTypeMap: Record<NormalizedColumn["type"], string> = {
  text: "string",
  number: "number",
  date: "date",
  boolean: "boolean",
};

// Build Smart.Grid DataAdapter `dataFields` (e.g. "id: number"). Declaring the
// field types up front lets the adapter bind, sort and filter large datasets
// efficiently; binding a raw untyped array instead forces Smart.Grid to infer
// types by scanning every row, which is pathologically slow at 1M rows.
export function toSmartGridDataFields(cols: NormalizedColumn[]): string[] {
  return cols.map((col) => `${col.field}: ${smartGridFieldTypeMap[col.type]}`);
}
