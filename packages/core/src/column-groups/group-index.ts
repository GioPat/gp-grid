// packages/core/src/column-groups/group-index.ts
// Validates a column-group hierarchy against the schema's column ids and
// indexes it (PRD 007 D6) in one depth-first pass over an explicit stack, so
// deep input cannot overflow the call stack and the budgets stop the walk
// before anything grows past them.

import type {
  ColumnGroupChild,
  ColumnGroupDefinition,
  ColumnGroupLimits,
  ColumnSchemaError,
} from "../types/column-groups";

/** A rejection before a command and a message are attached to it. */
export type ColumnSchemaFault = Pick<ColumnSchemaError, "code" | "id" | "limit">;

/** One group of an accepted hierarchy. */
export interface GroupIndexNode {
  readonly group: ColumnGroupDefinition;
  /** Position of the parent group in `nodes`, `-1` for a root group. */
  readonly parent: number;
  /** Groups above this one, which is also the band it occupies. */
  readonly depth: number;
}

/** Where one column sits in an accepted hierarchy. */
export interface GroupIndexLeaf {
  /** Position of the parent group in `nodes`, `-1` for a root column. */
  readonly parent: number;
  /** Groups above the column, which is also the first band its header spans. */
  readonly depth: number;
}

/** An accepted hierarchy, proportional to its nodes. */
export interface ColumnGroupIndex {
  /** The accepted root children, as the caller passed them. */
  readonly roots: readonly ColumnGroupChild[];
  /** Every group, in depth-first pre-order. */
  readonly nodes: readonly GroupIndexNode[];
  /** `groupId` to its position in `nodes`. */
  readonly nodeIndex: ReadonlyMap<string, number>;
  /** Column id to its place, iterated in depth-first leaf order. */
  readonly leaves: ReadonlyMap<string, GroupIndexLeaf>;
  /** Column ids in depth-first order. */
  readonly leafOrder: readonly string[];
}

export type GroupIndexResult =
  | { readonly ok: true; readonly index: ColumnGroupIndex }
  | { readonly ok: false; readonly error: ColumnSchemaFault };

interface Frame {
  readonly children: readonly unknown[];
  /** Position of the frame's group in `nodes`, `-1` for the root list. */
  readonly node: number;
  /** Depth of the frame's children. */
  readonly depth: number;
  readonly group: ColumnGroupDefinition | null;
  cursor: number;
}

interface Walk {
  readonly limits: Readonly<Required<ColumnGroupLimits>>;
  readonly columnIds: ReadonlySet<string>;
  readonly stack: Frame[];
  readonly onPath: Set<object>;
  readonly visited: Set<object>;
  readonly nodes: GroupIndexNode[];
  readonly nodeIndex: Map<string, number>;
  readonly leaves: Map<string, GroupIndexLeaf>;
  readonly leafOrder: string[];
  visits: number;
}

export const isChildList = (value: unknown): value is readonly unknown[] =>
  Array.isArray(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isGroupDefinition = (value: unknown): value is ColumnGroupDefinition =>
  isRecord(value) &&
  typeof value.groupId === "string" &&
  value.groupId.length > 0 &&
  isChildList(value.children);

const malformed = (value: unknown): ColumnSchemaFault => {
  const id = isRecord(value) ? value.groupId : undefined;
  if (typeof id === "string" && id.length > 0) return { code: "malformed", id };
  return { code: "malformed" };
};

const visitLeaf = (walk: Walk, frame: Frame, columnId: string): ColumnSchemaFault | null => {
  // Only known ids are stored, so a stored id is never an unknown one.
  if (walk.leaves.has(columnId)) return { code: "repeatedLeaf", id: columnId };
  if (walk.columnIds.has(columnId)) {
    walk.leaves.set(columnId, { parent: frame.node, depth: frame.depth });
    walk.leafOrder.push(columnId);
    return null;
  }
  return { code: "unknownLeaf", id: columnId };
};

const enterGroup = (
  walk: Walk,
  frame: Frame,
  group: ColumnGroupDefinition,
): ColumnSchemaFault | null => {
  const id = group.groupId;
  if (walk.onPath.has(group)) return { code: "cycle", id };
  if (walk.visited.has(group)) return { code: "multipleParents", id };
  if (walk.nodeIndex.has(id)) return { code: "duplicateGroup", id };
  if (walk.columnIds.has(id)) return { code: "idCollision", id };
  const node = walk.nodes.length;
  walk.nodes.push({ group, parent: frame.node, depth: frame.depth });
  walk.nodeIndex.set(id, node);
  walk.visited.add(group);
  walk.onPath.add(group);
  walk.stack.push({ children: group.children, node, depth: frame.depth + 1, group, cursor: 0 });
  return null;
};

const visitChild = (walk: Walk, frame: Frame, child: unknown): ColumnSchemaFault | null => {
  walk.visits += 1;
  if (walk.visits > walk.limits.maxNodes) return { code: "limit", limit: "maxNodes" };
  if (frame.depth > walk.limits.maxDepth) return { code: "limit", limit: "maxDepth" };
  if (typeof child === "string") return visitLeaf(walk, frame, child);
  if (isGroupDefinition(child)) return enterGroup(walk, frame, child);
  return malformed(child);
};

const leaveFrame = (walk: Walk): void => {
  const frame = walk.stack.pop();
  if (frame?.group) walk.onPath.delete(frame.group);
};

const walkHierarchy = (walk: Walk): ColumnSchemaFault | null => {
  let frame = walk.stack.at(-1);
  while (frame) {
    if (frame.cursor < frame.children.length) {
      const child = frame.children[frame.cursor];
      frame.cursor += 1;
      const fault = visitChild(walk, frame, child);
      if (fault) return fault;
    } else {
      leaveFrame(walk);
    }
    frame = walk.stack.at(-1);
  }
  return null;
};

const indexHierarchy = (
  roots: readonly ColumnGroupChild[],
  leafIds: readonly string[],
  limits: Readonly<Required<ColumnGroupLimits>>,
): GroupIndexResult => {
  const walk: Walk = {
    limits,
    columnIds: new Set(leafIds),
    stack: [{ children: roots, node: -1, depth: 0, group: null, cursor: 0 }],
    onPath: new Set(),
    visited: new Set(),
    nodes: [],
    nodeIndex: new Map(),
    leaves: new Map(),
    leafOrder: [],
    visits: 0,
  };
  const fault = walkHierarchy(walk);
  if (fault) return { ok: false, error: fault };
  const missing = leafIds.find((columnId) => !walk.leaves.has(columnId));
  if (missing !== undefined) return { ok: false, error: { code: "missingLeaf", id: missing } };
  const index: ColumnGroupIndex = {
    roots,
    nodes: walk.nodes,
    nodeIndex: walk.nodeIndex,
    leaves: walk.leaves,
    leafOrder: walk.leafOrder,
  };
  return { ok: true, index };
};

/**
 * Validate `groups` against the schema's column ids and index it. Returns the
 * first error in traversal order; `missingLeaf` is checked after the pass.
 */
export const buildGroupIndex = (
  groups: readonly ColumnGroupChild[],
  leafIds: readonly string[],
  limits: Readonly<Required<ColumnGroupLimits>>,
): GroupIndexResult => {
  if (isChildList(groups)) return indexHierarchy(groups, leafIds, limits);
  return { ok: false, error: { code: "malformed" } };
};
