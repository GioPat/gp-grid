// A consumer that pivots resident rows locally (PRD 012 AC-012-08): one
// createPivotSource over a client source, with every PivotConfig option set.
import { createClientDataSource, createPivotSource } from "@gp-grid/core";
import type {
  CellValue,
  GroupPathStep,
  PivotConfig,
  PivotMeasure,
  PivotSchema,
  PivotSource,
  RowGroupAggregator,
  RowGroupDimension,
  RowGroupingState,
} from "@gp-grid/core";

interface Sale {
  id: string;
  region: string;
  city: string;
  year: number;
  quarter: string;
  amount: number;
}

const sales: Sale[] = [
  { id: "s1", region: "North", city: "Oslo", year: 2024, quarter: "Q1", amount: 10 },
  { id: "s2", region: "North", city: "Oslo", year: 2025, quarter: "Q2", amount: 20 },
  { id: "s3", region: "South", city: "Rome", year: 2024, quarter: "Q1", amount: 30 },
];

const maxAmount: RowGroupAggregator<number> = {
  init: () => Number.NEGATIVE_INFINITY,
  add: (state, value) => (typeof value === "number" ? Math.max(state, value) : state),
  result: (state) => (Number.isFinite(state) ? state : null),
  merge: (into, from) => Math.max(into, from),
};

const rows: RowGroupDimension[] = [
  { field: "region" },
  { field: "city", id: "town", toKey: (value) => String(value).toLowerCase() },
];
const pivots: RowGroupDimension[] = [{ field: "year" }, { field: "quarter" }];
const measures: PivotMeasure[] = [
  { field: "amount", aggregate: "sum", column: { headerName: "Amount", width: 140 } },
  { field: "peak", source: "amount", aggregate: maxAmount },
];
const domain: Record<string, readonly CellValue[]> = { year: [2024, 2025, 2026], quarter: ["Q1", "Q2", "Q3", "Q4"] };
const savedState: RowGroupingState = { expanded: [], collapsed: [], expandedDepth: 1 };

// Header text of one tuple step: dimension id, tag ("z", "s", "n", "b", "d") and key.
const formatKey = (step: GroupPathStep): string => (step[0] === "year" ? `FY ${String(step[2])}` : String(step[2]));

const config: PivotConfig = {
  rows,
  pivots,
  measures,
  domain,
  rowTotals: true,
  rowTotalsHeader: "All years",
  grandTotal: "bottom",
  defaultExpandedDepth: 1,
  initialState: savedState,
  maxColumns: 64,
  labelColumn: { headerName: "Region / City", width: 220 },
  formatKey,
};

export const pivotSource: PivotSource<Sale> = createPivotSource(createClientDataSource(sales), config);

const describeSchema = (schema: PivotSchema | null): string =>
  schema === null ? "pending" : `${schema.columns.length} columns, ${schema.columnGroups.length} groups`;

const unsubscribe: () => void = pivotSource.subscribeSchema((schema) => void describeSchema(schema));
const schema: string = describeSchema(pivotSource.getSchema());
const expansion: RowGroupingState = pivotSource.getState();
const readOnly: boolean = pivotSource.writable === false;
const loadsInFull: "all" = pivotSource.loadMode;

const teardown = (): void => {
  unsubscribe();
  pivotSource.destroy();
};

void schema;
void expansion;
void readOnly;
void loadsInFull;
void teardown;
