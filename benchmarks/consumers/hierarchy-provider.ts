// A consumer that supplies rows it grouped itself (PRD 008 AC-008-08): types
// only, so no local grouping engine is imported.
import type {
  CellValue,
  DataSource,
  DataSourceResponse,
  HierarchicalRowAccess,
  HierarchyRecordChange,
  HierarchyRow,
  RowId,
} from "@gp-grid/core";

interface Sale {
  id: string;
  region: string;
  amount: number;
}

interface Entry {
  row: HierarchyRow;
  values: Record<string, CellValue>;
  record?: Sale;
}

const sales: Sale[] = [
  { id: "s1", region: "North", amount: 10 },
  { id: "s2", region: "North", amount: 20 },
];

const buildEntries = (expanded: ReadonlySet<RowId>): Entry[] => {
  const amount = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const entries: Entry[] = [
    { row: { kind: "total", id: "total", depth: 0, leafCount: sales.length }, values: { amount } },
    {
      row: {
        kind: "group",
        id: "region:north",
        depth: 0,
        expanded: expanded.has("region:north"),
        childCount: sales.length,
        leafCount: sales.length,
        field: "region",
        value: "North",
      },
      values: { amount },
    },
  ];
  if (expanded.has("region:north")) {
    for (const sale of sales) {
      entries.push({
        row: { kind: "record", id: sale.id, depth: 1 },
        values: { region: sale.region, amount: sale.amount },
        record: sale,
      });
    }
  }
  return entries;
};

const createAccess = (expanded: Set<RowId>): HierarchicalRowAccess<Sale> => {
  let entries = buildEntries(expanded);
  const indexOf = (id: RowId): number => entries.findIndex((entry) => entry.row.id === id);
  return {
    hierarchical: true,
    revision: 1,
    get rowCount() {
      return entries.length;
    },
    getRowId: (viewRow) => entries[viewRow]?.row.id ?? viewRow,
    getRow: (viewRow) => entries[viewRow]?.row,
    getValue: (viewRow, field) => entries[viewRow]?.values[field] ?? null,
    // A hidden record answers with its group row.
    locate: (id) => {
      const index = indexOf(id);
      if (index >= 0) return index;
      return sales.some((sale) => sale.id === id) ? indexOf("region:north") : -1;
    },
    setExpanded: (ids, open) => {
      const before = expanded.has("region:north");
      for (const id of ids ?? ["region:north"]) {
        if (id !== "region:north") continue;
        if (open) expanded.add(id);
        else expanded.delete(id);
      }
      entries = buildEntries(expanded);
      return expanded.has("region:north") !== before;
    },
    getRecord: (viewRow) => entries[viewRow]?.record,
    recordsChanged: (changes: readonly HierarchyRecordChange[]) => {
      entries = buildEntries(expanded);
      return changes.some((change) => change.field === "region");
    },
    release: () => undefined,
  };
};

export const createGroupedSalesSource = (): DataSource<Sale> => {
  const expanded = new Set<RowId>();
  return {
    loadMode: "all",
    query: async (): Promise<DataSourceResponse<Sale>> => {
      const access = createAccess(expanded);
      return { rows: [], totalRows: access.rowCount, access };
    },
  };
};
