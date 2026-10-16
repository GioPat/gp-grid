// playgrounds/angular/src/app/demo-pivot.ts
// The "Pivot" demo (PRD 012): the demo's own rows folded by status and name,
// one column group per creation month, salary summed and age averaged.

import { createPivotSource } from "@gp-grid/angular";
import type { CellValue, DataSource, PivotConfig, PivotSource } from "@gp-grid/angular";

const monthOf = (value: CellValue): string | null =>
  value instanceof Date ? value.toISOString().slice(0, 7) : null;

const formatSalary = (value: CellValue): string =>
  typeof value === "number"
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "";

const formatAverage = (value: CellValue): string => (typeof value === "number" ? value.toFixed(1) : "");

const demoPivotConfig: PivotConfig = {
  rows: [{ field: "status" }, { field: "name" }],
  pivots: [{ field: "createdAt", toKey: monthOf }],
  measures: [
    { field: "salary", aggregate: "sum", column: { headerName: "Salary", width: 140, valueFormatter: formatSalary } },
    { field: "age", aggregate: "avg", column: { headerName: "Avg age", width: 100, valueFormatter: formatAverage } },
  ],
  rowTotals: true,
  grandTotal: "top",
  labelColumn: { headerName: "Status / Name" },
};

export const createDemoPivotSource = <TData>(source: DataSource<TData>): PivotSource<TData> =>
  createPivotSource(source, demoPivotConfig);
