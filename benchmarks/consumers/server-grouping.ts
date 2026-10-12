// A consumer that groups on a server (PRD 009 AC-009-07): the service types and
// one createServerGroupingSource call, so no local grouping engine is imported.
import { createServerGroupingSource } from "@gp-grid/core";
import type {
  CellValue,
  GroupPathStep,
  HierarchicalRowAccess,
  HierarchyChange,
  RowGroupingState,
  RowId,
  ServerGroupChildrenRequest,
  ServerGroupChildrenResponse,
  ServerGroupNode,
  ServerGroupingConfig,
  ServerGroupingService,
  ServerGroupingSource,
  ServerGroupingSpec,
  ServerLeavesRequest,
  ServerLeavesResponse,
} from "@gp-grid/core";

interface Sale {
  id: string;
  region: string;
  amount: number;
}

const sales: Sale[] = [
  { id: "s1", region: "North", amount: 10 },
  { id: "s2", region: "North", amount: 20 },
];

// One level of a path: dimension id, tag ("z", "s", "n", "b", "d") and key.
const north: GroupPathStep = ["region", "s", "North"];

const regionOf = (path: readonly GroupPathStep[]): GroupPathStep[2] => path[0]?.[2] ?? null;

const total = (rows: readonly Sale[]): number => rows.reduce((sum, sale) => sum + sale.amount, 0);

const nodeOf = (region: string, rows: readonly Sale[]): ServerGroupNode => ({
  key: region,
  childCount: rows.length,
  leafCount: rows.length,
  aggregates: { amount: total(rows) },
});

// `revision` is null on the root request of a new view; the response sets it.
const fetchChildren = async (request: ServerGroupChildrenRequest): Promise<ServerGroupChildrenResponse> => {
  const { startRow, endRow } = request.range;
  const children = [nodeOf("North", sales)].slice(startRow, endRow);
  return { revision: request.revision ?? 1, totalCount: 1, children, totals: { amount: total(sales) } };
};

// `rows[i]` is ordinal `range.startRow + i` among the terminal group's leaves.
const fetchLeaves = async (request: ServerLeavesRequest): Promise<ServerLeavesResponse<Sale>> => {
  const rows = sales.filter((sale) => sale.region === regionOf(request.path));
  const page = rows.slice(request.range.startRow, request.range.endRow);
  return { revision: request.revision, totalCount: rows.length, rows: page };
};

const service: ServerGroupingService<Sale> = { fetchChildren, fetchLeaves };

const spec: ServerGroupingSpec = {
  dimensions: [{ field: "region" }],
  measures: [{ field: "amount", aggregate: "sum" }],
};
const savedState: RowGroupingState = { expanded: [], collapsed: [], expandedDepth: 1 };
const config: ServerGroupingConfig<Sale> = {
  dimensions: spec.dimensions,
  measures: spec.measures,
  getRowId: (sale): RowId => sale.id,
  defaultExpandedDepth: 0,
  grandTotal: "top",
  initialState: savedState,
  cache: { pageSize: 50, prefetchPages: 0, maxPages: 8 },
  maxConcurrentRequests: 4,
  writable: false,
};

export const groupedSalesSource: ServerGroupingSource<Sale> = createServerGroupingSource(service, config);

// What a view adds to the hierarchy contract: the rows the grid asks for and the changes it hears.
const describeChange = (change: HierarchyChange): string => {
  if (change.kind === "rows") return `${change.start}-${change.end}`;
  if (change.kind === "view") {
    change.apply();
    return "view";
  }
  return change.message;
};
const watchView = (access: HierarchicalRowAccess<Sale>): (() => void) | undefined => {
  access.requestRows?.([
    { start: 0, end: 2 },
    { start: 100, end: 140 },
  ]);
  return access.subscribe?.((change) => void describeChange(change));
};
// A placeholder has an id but no row; a failed group carries `error`.
const describeRow = (access: HierarchicalRowAccess<Sale>, viewRow: number): string => {
  const row = access.getRow(viewRow);
  if (row === undefined) return `pending ${String(access.getRowId(viewRow))}`;
  return row.kind === "group" ? (row.error ?? String(row.value)) : row.kind;
};
const aggregate: CellValue = nodeOf("North", sales).aggregates?.amount ?? null;
const expansion: RowGroupingState = groupedSalesSource.getState();
const readOnly: boolean = groupedSalesSource.writable === false;
const loadsInFull: "all" = groupedSalesSource.loadMode;

void north;
void watchView;
void describeRow;
void aggregate;
void expansion;
void readOnly;
void loadsInFull;
