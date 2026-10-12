// The 008 fixture's tree with every leaf run unloaded at first: a leaf is a
// placeholder, with a pending id and no row, until `load` fills its view rows.

import { vi } from "vitest";
import type {
  CellValue,
  GridCoreOptions,
  GridInstruction,
  HierarchicalRowAccess,
  HierarchyChange,
  HierarchyGroupRow,
  HierarchyRow,
  RowId,
} from "../src/types";
import type { AxisBounds } from "../src/types/geometry";
import type { AssignSlotInstruction } from "../src/types/instructions";
import { TOTAL_ID, createHierarchyGrid, type FixtureRecord } from "./hierarchy-fixture";

export interface LazyFixtureOptions {
  /** Group ids that start expanded. */
  expanded?: readonly RowId[];
  /** Leaves under every city; the 008 tree's two in Rome and one elsewhere by default. */
  leavesPerCity?: number;
}

interface LazyGroup {
  field: string;
  value: CellValue;
  expanded: boolean;
  error?: string;
  children: LazyNode[];
}

interface LazyNode {
  id: RowId;
  /** Set on a leaf until it loads. */
  pendingId?: string;
  values: Record<string, CellValue>;
  group?: LazyGroup;
  record?: FixtureRecord;
}

interface VisibleRow {
  node: LazyNode;
  depth: number;
}

export type LazyFixtureAccess = HierarchicalRowAccess & {
  release: ReturnType<typeof vi.fn>;
  /** The ranges of every `requestRows` call, in order. */
  requests: AxisBounds[][];
  listenerCount(): number;
  /** Loads the placeholders in `range` and notifies `"rows"`. */
  load(range: AxisBounds): void;
  /** Notifies `"view"` whose `apply` collapses a group with `error`. */
  fail(groupId: RowId, message?: string): void;
  /** Calls of a `"view"` change's `apply` that moved the rows. */
  applyCount: number;
  /** A failure no group row shows: notifies `"error"`. */
  rootFail(message?: string): void;
};

const sumOf = (nodes: readonly LazyNode[]): number =>
  nodes.reduce((total, node) => total + Number(node.values.amount ?? 0), 0);

const leafCountOf = (node: LazyNode): number =>
  node.group?.children.reduce((count, child) => count + leafCountOf(child), 0) ?? 1;

const group = (id: RowId, field: string, value: CellValue, children: LazyNode[]): LazyNode => ({
  id,
  values: { [field]: value, amount: sumOf(children) },
  group: { field, value, expanded: false, children },
});

const buildTree = (leavesPerCity: number | undefined): LazyNode[] => {
  let sequence = 0;
  const city = (country: string, name: string, leaves: number): LazyNode => {
    const id = `g:${country}:${name}`;
    const children = Array.from({ length: leavesPerCity ?? leaves }, (_, ordinal): LazyNode => {
      sequence += 1;
      const record: FixtureRecord = { id: `r${sequence}`, country, city: name, amount: sequence * 10 };
      const values = record as unknown as Record<string, CellValue>;
      return { id: record.id, pendingId: `gp-pending:${ordinal}@${id}`, values, record };
    });
    return group(id, "city", name, children);
  };
  return [
    group("g:IT", "country", "IT", [city("IT", "Rome", 2), city("IT", "Milan", 1)]),
    group("g:FR", "country", "FR", [city("FR", "Paris", 1)]),
  ];
};

const flatten = (nodes: readonly LazyNode[], depth: number, out: VisibleRow[]): void => {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.group?.expanded) flatten(node.group.children, depth + 1, out);
  }
};

/** Leaves under both their record id and their pending id. */
const indexParents = (
  nodes: readonly LazyNode[],
  parent: LazyNode | null,
  out: Map<RowId, { node: LazyNode; parent: LazyNode | null }>,
): void => {
  for (const node of nodes) {
    out.set(node.id, { node, parent });
    if (node.pendingId !== undefined) out.set(node.pendingId, { node, parent });
    if (node.group) indexParents(node.group.children, node, out);
  }
};

const rowIdOf = (node: LazyNode): RowId => node.pendingId ?? node.id;

const toHierarchyRow = ({ node, depth }: VisibleRow): HierarchyRow | undefined => {
  if (node.pendingId !== undefined) return undefined;
  if (node.group === undefined) return { kind: "record", id: node.id, depth };
  const { field, value, expanded, children, error } = node.group;
  const row: HierarchyGroupRow = {
    kind: "group",
    id: node.id,
    depth,
    expanded,
    childCount: children.length,
    leafCount: leafCountOf(node),
    field,
    value,
  };
  return error === undefined ? row : { ...row, error };
};

/** A total row on top, then the visible groups and leaves; a leaf loads only through `load`. */
export const createLazyHierarchyFixture = (options: LazyFixtureOptions = {}): LazyFixtureAccess => {
  const roots = buildTree(options.leavesPerCity);
  const byId = new Map<RowId, { node: LazyNode; parent: LazyNode | null }>();
  indexParents(roots, null, byId);
  for (const id of options.expanded ?? []) {
    const target = byId.get(id)?.node.group;
    if (target) target.expanded = true;
  }
  const total: LazyNode = { id: TOTAL_ID, values: { amount: sumOf(roots) } };
  const leafCount = roots.reduce((count, node) => count + leafCountOf(node), 0);
  const listeners = new Set<(change: HierarchyChange) => void>();
  const notify = (change: HierarchyChange) => {
    for (const listener of [...listeners]) listener(change);
  };
  /** A pending change: a listener applies it, or it applies at once without one. */
  const notifyView = (move: () => void) => {
    let pending = true;
    const apply = () => {
      if (pending === false) return;
      pending = false;
      access.applyCount += 1;
      move();
      rebuild();
    };
    if (listeners.size === 0) apply();
    else notify({ kind: "view", apply });
  };

  let rows: VisibleRow[] = [];
  const rebuild = () => {
    rows = [{ node: total, depth: 0 }];
    flatten(roots, 0, rows);
  };
  rebuild();

  const indexOf = (node: LazyNode): number => rows.findIndex((row) => row.node === node);
  const locate = (id: RowId): number => {
    if (id === TOTAL_ID) return 0;
    let entry = byId.get(id);
    while (entry) {
      const index = indexOf(entry.node);
      if (index >= 0) return index;
      entry = entry.parent ? byId.get(entry.parent.id) : undefined;
    }
    return -1;
  };
  const placeholder = (viewRow: number): boolean => rows[viewRow]?.node.pendingId !== undefined;

  const access: LazyFixtureAccess = {
    get rowCount() {
      return rows.length;
    },
    hierarchical: true,
    getRowId: (viewRow) => rowIdOf(rows[viewRow]!.node),
    getRow: (viewRow) => {
      const row = rows[viewRow];
      if (row === undefined) return undefined;
      if (row.node === total) return { kind: "total", id: TOTAL_ID, depth: 0, leafCount };
      return toHierarchyRow(row);
    },
    getValue: (viewRow, field) => (placeholder(viewRow) ? null : (rows[viewRow]?.node.values[field] ?? null)),
    getRecord: (viewRow) => (placeholder(viewRow) ? undefined : rows[viewRow]?.node.record),
    locate,
    setExpanded: (ids, expanded) => {
      let changed = false;
      for (const id of ids ?? [...byId.keys()]) {
        const target = byId.get(id)?.node.group;
        if (target === undefined || target.expanded === expanded) continue;
        target.expanded = expanded;
        if (expanded) delete target.error;
        changed = true;
      }
      if (changed) rebuild();
      return changed;
    },
    requestRows: (ranges) => {
      access.requests.push(ranges.map(({ start, end }) => ({ start, end })));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    release: vi.fn(),
    requests: [],
    listenerCount: () => listeners.size,
    load: ({ start, end }) => {
      for (const row of rows.slice(start, end)) delete row.node.pendingId;
      notify({ kind: "rows", start, end });
    },
    fail: (groupId, message = "boom") => {
      const target = byId.get(groupId)?.node.group;
      if (target === undefined) return;
      notifyView(() => {
        target.expanded = false;
        target.error = message;
      });
    },
    applyCount: 0,
    rootFail: (message = "root page failed") => notify({ kind: "error", message }),
  };
  return access;
};

/** A grid over `access` whose viewport is set before the first load, as a wrapper mounts it. */
export const mountLazyGrid = async (
  access: LazyFixtureAccess,
  options: Partial<GridCoreOptions<FixtureRecord>> = {},
  height = 120,
) => {
  const setup = createHierarchyGrid(() => access, options);
  setup.grid.setViewport(0, 0, 400, height);
  await setup.grid.initialize();
  return setup;
};

/** The slot assignment each mounted row last received. */
export const mountedRows = (batches: readonly GridInstruction[][]): Map<number, AssignSlotInstruction> => {
  const slots = new Map<string, AssignSlotInstruction>();
  for (const instruction of batches.flat()) {
    if (instruction.type === "ASSIGN_SLOT") slots.set(instruction.slotId, instruction);
    if (instruction.type === "DESTROY_SLOT") slots.delete(instruction.slotId);
  }
  return new Map([...slots.values()].map((assign) => [assign.rowIndex, assign]));
};
