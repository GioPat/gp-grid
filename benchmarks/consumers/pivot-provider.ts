// A consumer that supplies a pivot it computed itself (PRD 012 AC-012-07): the
// schema helper, the id encoders and types only, so no pivot engine is imported.
import { buildPivotSchema, encodeGroupId, encodePivotColumnId, PIVOT_LABEL_COLUMN_ID } from "@gp-grid/core";
import type {
  CellValue,
  DataSource,
  DataSourceResponse,
  GroupPathStep,
  HierarchicalRowAccess,
  HierarchyRow,
  PivotSchema,
  RowId,
} from "@gp-grid/core";

const leafTuples: GroupPathStep[][] = [[["year", "n", 2024]], [["year", "n", 2025]]];

const schema: PivotSchema = buildPivotSchema(leafTuples, {
  measures: [
    { field: "amount", aggregate: "sum" },
    { field: "count", aggregate: "count" },
  ],
  rowTotals: true,
  labelColumn: { headerName: "Region / City" },
});

const northId = encodeGroupId([["region", "s", "North"]]);
const osloId = encodeGroupId([["region", "s", "North"], ["city", "s", "Oslo"]]);
const totalId = "total";

const amount2024 = encodePivotColumnId(leafTuples[0], "amount");
const amount2025 = encodePivotColumnId(leafTuples[1], "amount");
const amountTotal = encodePivotColumnId([], "amount");

/** One row's values by generated column id; the region and Oslo share them, Oslo being its only city. */
const regionValues: Record<string, CellValue> = { [amount2024]: 10, [amount2025]: 20, [amountTotal]: 30 };

const buildRows = (expanded: ReadonlySet<RowId>): HierarchyRow[] => {
  const open = expanded.has(northId);
  const rows: HierarchyRow[] = [
    { kind: "total", id: totalId, depth: 0, leafCount: 3 },
    { kind: "group", id: northId, depth: 0, expanded: open, childCount: 1, leafCount: 3, field: "region", value: "North" },
  ];
  if (open) {
    rows.push({ kind: "group", id: osloId, depth: 1, expanded: false, childCount: 0, leafCount: 3, field: "city", value: "Oslo" });
  }
  return rows;
};

const valueOf = (row: HierarchyRow | undefined, columnId: string): CellValue => {
  if (row === undefined) return null;
  if (columnId === PIVOT_LABEL_COLUMN_ID) return row.kind === "group" ? row.value : "Total";
  return regionValues[columnId] ?? null;
};

const createAccess = (expanded: Set<RowId>): HierarchicalRowAccess => {
  let rows = buildRows(expanded);
  const indexOf = (id: RowId): number => rows.findIndex((row) => row.id === id);
  return {
    hierarchical: true,
    revision: 1,
    get rowCount() {
      return rows.length;
    },
    getRowId: (viewRow) => rows[viewRow]?.id ?? viewRow,
    getRow: (viewRow) => rows[viewRow],
    getValue: (viewRow, columnId) => valueOf(rows[viewRow], columnId),
    // A hidden city answers with its region.
    locate: (id) => (id === osloId && indexOf(id) < 0 ? indexOf(northId) : indexOf(id)),
    // Oslo is childless: only the region opens or closes.
    setExpanded: (ids, open) => {
      if ((ids ?? [northId]).includes(northId) === false || expanded.has(northId) === open) return false;
      if (open) expanded.add(northId);
      else expanded.delete(northId);
      rows = buildRows(expanded);
      return true;
    },
  };
};

export const createPivotSalesSource = (): DataSource<never> => {
  const expanded = new Set<RowId>();
  return {
    loadMode: "all",
    writable: false,
    query: async (): Promise<DataSourceResponse<never>> => {
      const access = createAccess(expanded);
      return { rows: [], totalRows: access.rowCount, access };
    },
  };
};

void schema;
void createPivotSalesSource;
