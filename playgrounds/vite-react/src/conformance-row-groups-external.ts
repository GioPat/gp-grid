// playgrounds/vite-react/src/conformance-row-groups-external.ts
// A hand-written hierarchy (PRD 008 AC-008-08): two groups with one label and
// distinct ids, three record-less rows each and a total row. It imports types
// only, so this arm reaches the grid without the local grouping engine.

import type {
  CellValue,
  ColumnDefinition,
  DataSource,
  HierarchicalRowAccess,
  HierarchyRow,
  RowId,
} from "@gp-grid/react";

export const EXTERNAL_LABEL_COLUMN = "region";
export const EXTERNAL_TOTAL_ID = "ext:total";
/** Both groups print "North"; revision 2 drops the first and doubles every amount. */
export const EXTERNAL_GROUP_IDS = ["ext:north-a", "ext:north-b"] as const;
export const EXTERNAL_LEAVES_PER_GROUP = 3;

interface ExternalLeaf {
  id: string;
  values: Record<string, CellValue>;
}

interface ExternalGroup {
  id: string;
  amount: number;
  leaves: ExternalLeaf[];
}

interface VisibleRow {
  row: HierarchyRow;
  values: Record<string, CellValue>;
}

const buildGroups = (revision: number): ExternalGroup[] => {
  const groups = EXTERNAL_GROUP_IDS.map((id, group) => {
    const leaves = Array.from({ length: EXTERNAL_LEAVES_PER_GROUP }, (_, offset) => ({
      id: `${id}:${offset}`,
      values: {
        region: "North",
        item: `Item ${group}-${offset}`,
        amount: (group * EXTERNAL_LEAVES_PER_GROUP + offset + 1) * 10 * revision,
        code: `X-${group}${offset}`,
      },
    }));
    const amount = leaves.reduce((sum, leaf) => sum + Number(leaf.values.amount), 0);
    return { id, amount, leaves };
  });
  return revision === 2 ? groups.slice(1) : groups;
};

export const createExternalColumns = (replaced: boolean): ColumnDefinition[] => {
  const region: ColumnDefinition = { colId: "region", field: "region", headerName: "Region", width: 180, cellDataType: "text" };
  const amount: ColumnDefinition = { colId: "amount", field: "amount", headerName: "Amount", width: 120, cellDataType: "number" };
  if (replaced) {
    return [region, amount, { colId: "code", field: "code", headerName: "Code", width: 140, cellDataType: "text" }];
  }
  return [region, { colId: "item", field: "item", headerName: "Item", width: 140, cellDataType: "text" }, amount];
};

export interface ExternalHierarchy {
  source: DataSource<never>;
  queries(): number;
  /** The next query answers revision 2. */
  replaceRevision(): void;
}

/** Expansion lives in the provider, so it survives a revision. */
export const createExternalHierarchy = (): ExternalHierarchy => {
  const expanded = new Set<RowId>();
  let revision = 1;
  let queries = 0;

  const groupRow = (group: ExternalGroup): VisibleRow => ({
    row: {
      kind: "group",
      id: group.id,
      depth: 0,
      expanded: expanded.has(group.id),
      childCount: group.leaves.length,
      leafCount: group.leaves.length,
      field: "region",
      value: "North",
    },
    values: { region: "North", amount: group.amount },
  });

  const visibleRows = (groups: readonly ExternalGroup[]): VisibleRow[] => {
    const leafCount = groups.reduce((count, group) => count + group.leaves.length, 0);
    const amount = groups.reduce((sum, group) => sum + group.amount, 0);
    const rows: VisibleRow[] = [
      { row: { kind: "total", id: EXTERNAL_TOTAL_ID, depth: 0, leafCount }, values: { amount } },
    ];
    for (const group of groups) {
      rows.push(groupRow(group));
      if (expanded.has(group.id)) {
        rows.push(...group.leaves.map((leaf) => ({
          row: { kind: "record" as const, id: leaf.id, depth: 1 },
          values: leaf.values,
        })));
      }
    }
    return rows;
  };

  const createAccess = (): HierarchicalRowAccess => {
    const groups = buildGroups(revision);
    let rows = visibleRows(groups);
    const indexOf = (id: RowId): number => rows.findIndex((entry) => entry.row.id === id);
    const parentOf = (id: RowId): ExternalGroup | undefined =>
      groups.find((group) => group.leaves.some((leaf) => leaf.id === id));

    return {
      hierarchical: true,
      revision,
      get rowCount() {
        return rows.length;
      },
      getRowId: (viewRow) => rows[viewRow]?.row.id ?? viewRow,
      getRow: (viewRow) => rows[viewRow]?.row,
      getValue: (viewRow, field) => rows[viewRow]?.values[field] ?? null,
      locate: (id) => {
        const index = indexOf(id);
        if (index >= 0) return index;
        const parent = parentOf(id);
        return parent === undefined ? -1 : indexOf(parent.id);
      },
      setExpanded: (ids, open) => {
        let changed = false;
        for (const id of ids ?? groups.map((group) => group.id)) {
          const known = groups.some((group) => group.id === id);
          if (known && expanded.has(id) !== open) {
            if (open) expanded.add(id);
            else expanded.delete(id);
            changed = true;
          }
        }
        if (changed) rows = visibleRows(groups);
        return changed;
      },
    };
  };

  return {
    source: {
      loadMode: "all",
      query: async () => {
        queries += 1;
        const access = createAccess();
        return { rows: [], totalRows: access.rowCount, access };
      },
    },
    queries: () => queries,
    replaceRevision: () => {
      revision = 2;
    },
  };
};
