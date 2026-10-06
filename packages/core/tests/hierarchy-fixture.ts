// A small hand-written hierarchy: total, country groups, city groups, leaves.
// Revision 2 doubles every amount and drops the "FR" branch.

import { vi } from "vitest";
import { GridCore } from "../src/grid-core";
import type {
  CellValue,
  ColumnDefinition,
  DataSource,
  GridCoreOptions,
  GridInstruction,
  HierarchicalRowAccess,
  HierarchyRow,
  RowId,
} from "../src/types";

export interface FixtureRecord {
  id: RowId;
  country: string;
  city: string;
  amount: number;
}

interface FixtureNode {
  id: RowId;
  values: Record<string, CellValue>;
  /** Present on a group; a leaf has none. */
  group?: { field: string; value: CellValue; expanded: boolean; children: FixtureNode[] };
  record?: FixtureRecord;
}

interface VisibleRow {
  node: FixtureNode;
  depth: number;
}

export interface HierarchyFixtureOptions {
  revision?: number;
  /** Omit `setExpanded`, as a read-only provider does. */
  withoutSetExpanded?: boolean;
  /** Group ids that start expanded. */
  expanded?: readonly RowId[];
}

export type FixtureAccess = HierarchicalRowAccess & { release: ReturnType<typeof vi.fn> };

export const TOTAL_ID = "gp-total";

/** A leaf with a record reads it, so a write through the grid shows. */
const leaf = (record: FixtureRecord, withRecord: boolean): FixtureNode => ({
  id: record.id,
  values: withRecord ? (record as unknown as Record<string, CellValue>) : { ...record },
  record: withRecord ? record : undefined,
});

const group = (
  id: RowId,
  field: string,
  value: CellValue,
  children: FixtureNode[],
): FixtureNode => ({
  id,
  values: { [field]: value, amount: sumOf(children) },
  group: { field, value, expanded: false, children },
});

const sumOf = (nodes: readonly FixtureNode[]): number =>
  nodes.reduce((total, node) => total + Number(node.values.amount ?? 0), 0);

const leafCountOf = (node: FixtureNode): number =>
  node.group?.children.reduce((count, child) => count + leafCountOf(child), 0) ?? 1;

const buildTree = (revision: number): FixtureNode[] => {
  const amount = (base: number) => base * revision;
  const italy = group("g:IT", "country", "IT", [
    group("g:IT:Rome", "city", "Rome", [
      leaf({ id: "r1", country: "IT", city: "Rome", amount: amount(10) }, true),
      leaf({ id: "r2", country: "IT", city: "Rome", amount: amount(20) }, false),
    ]),
    group("g:IT:Milan", "city", "Milan", [
      leaf({ id: "r3", country: "IT", city: "Milan", amount: amount(30) }, true),
    ]),
  ]);
  const france = group("g:FR", "country", "FR", [
    group("g:FR:Paris", "city", "Paris", [
      leaf({ id: "r4", country: "FR", city: "Paris", amount: amount(40) }, true),
    ]),
  ]);
  return revision === 2 ? [italy] : [italy, france];
};

const flatten = (nodes: readonly FixtureNode[], depth: number, out: VisibleRow[]): void => {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.group?.expanded) flatten(node.group.children, depth + 1, out);
  }
};

const indexParents = (
  nodes: readonly FixtureNode[],
  parent: FixtureNode | null,
  out: Map<RowId, { node: FixtureNode; parent: FixtureNode | null }>,
): void => {
  for (const node of nodes) {
    out.set(node.id, { node, parent });
    if (node.group) indexParents(node.group.children, node, out);
  }
};

const toHierarchyRow = ({ node, depth }: VisibleRow): HierarchyRow => {
  if (node.group === undefined) return { kind: "record", id: node.id, depth };
  const { field, value, expanded, children } = node.group;
  return {
    kind: "group",
    id: node.id,
    depth,
    expanded,
    childCount: children.length,
    leafCount: leafCountOf(node),
    field,
    value,
  };
};

/** A total row on top, then the visible groups and leaves. */
export const createHierarchyFixture = (options: HierarchyFixtureOptions = {}): FixtureAccess => {
  const revision = options.revision ?? 1;
  const roots = buildTree(revision);
  const byId = new Map<RowId, { node: FixtureNode; parent: FixtureNode | null }>();
  indexParents(roots, null, byId);
  for (const id of options.expanded ?? []) {
    const target = byId.get(id)?.node.group;
    if (target) target.expanded = true;
  }
  const total: FixtureNode = { id: TOTAL_ID, values: { amount: sumOf(roots) } };
  const leafCount = roots.reduce((count, node) => count + leafCountOf(node), 0);

  let rows: VisibleRow[] = [];
  const rebuild = () => {
    rows = [{ node: total, depth: 0 }];
    flatten(roots, 0, rows);
  };
  rebuild();

  const visibleIndex = (id: RowId): number => rows.findIndex((row) => row.node.id === id);
  const locate = (id: RowId): number => {
    if (id === TOTAL_ID) return 0;
    let entry = byId.get(id);
    while (entry) {
      const index = visibleIndex(entry.node.id);
      if (index >= 0) return index;
      entry = entry.parent ? byId.get(entry.parent.id) : undefined;
    }
    return -1;
  };

  const access: FixtureAccess = {
    get rowCount() {
      return rows.length;
    },
    hierarchical: true,
    revision,
    getRowId: (viewRow) => rows[viewRow].node.id,
    getRow: (viewRow) => {
      const row = rows[viewRow];
      if (row === undefined) return undefined;
      if (row.node === total) return { kind: "total", id: TOTAL_ID, depth: 0, leafCount };
      return toHierarchyRow(row);
    },
    getValue: (viewRow, field) => rows[viewRow]?.node.values[field] ?? null,
    getRecord: (viewRow) => rows[viewRow]?.node.record,
    locate,
    release: vi.fn(),
  };
  if (options.withoutSetExpanded) return access;
  access.setExpanded = (ids, expanded) => {
    const targets = ids ?? [...byId.keys()];
    let changed = false;
    for (const id of targets) {
      const target = byId.get(id)?.node.group;
      if (target === undefined || target.expanded === expanded) continue;
      target.expanded = expanded;
      changed = true;
    }
    if (changed) rebuild();
    return changed;
  };
  return access;
};

/** A source whose every query answers with a fresh hierarchy from `next`. */
export const createHierarchySource = (
  next: () => FixtureAccess,
): DataSource<FixtureRecord> & { queries: number } => {
  const source = {
    queries: 0,
    query: async () => {
      source.queries += 1;
      const access = next();
      return { rows: [], totalRows: access.rowCount, access };
    },
  };
  return source;
};

export const fixtureColumns: ColumnDefinition[] = [
  { field: "country", cellDataType: "text", width: 120 },
  { field: "city", cellDataType: "text", width: 120 },
  { field: "amount", cellDataType: "number", width: 100, editable: true },
];

/** A grid bound to `next`'s hierarchies, recording every batch. */
export const createHierarchyGrid = (
  next: () => FixtureAccess,
  options: Partial<GridCoreOptions<FixtureRecord>> = {},
) => {
  const source = createHierarchySource(next);
  const grid = new GridCore<FixtureRecord>({
    columns: fixtureColumns,
    dataSource: source,
    rowHeight: 30,
    headerHeight: 30,
    ...options,
  });
  const batches: GridInstruction[][] = [];
  grid.onBatchInstruction((batch) => batches.push(batch));
  return { grid, source, batches };
};
