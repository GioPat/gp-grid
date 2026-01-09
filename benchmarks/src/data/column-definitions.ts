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
