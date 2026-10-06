// packages/core/src/row-grouping/grouped-access.ts
// The engine's HierarchicalRowAccess over a grouped view and its flat source (D1, D9).

import type {
  CellValue,
  FlatRowSource,
  HierarchicalRowAccess,
  HierarchyRecordChange,
  HierarchyRow,
  RowId,
} from "../types";
import type { ExpansionState } from "./expansion-state";
import { findGroup } from "./group-lookup";
import { groupIdOf } from "./group-tree";
import {
  buildGroupedView,
  createPositionFinder,
  locateGroup,
  locatePosition,
  type GroupedView,
  type GroupingSpec,
} from "./grouped-view";
import { GROUP_ID_PREFIX, TOTAL_ROW_ID, keyValue } from "./keys";

type Reader = (row: number) => CellValue;

const groupRow = (view: GroupedView, group: number): HierarchyRow => {
  const { tree } = view;
  const depth = tree.depth[group]!;
  return {
    kind: "group",
    id: groupIdOf(tree, group),
    depth,
    expanded: view.expanded[group] === 1,
    childCount: tree.childCount[group]!,
    leafCount: tree.leafEnd[group]! - tree.leafStart[group]!,
    field: tree.dimensions[depth]!.field,
    value: keyValue(tree.tag[group]!, tree.key[group]!),
  };
};

/** Groups on the paths of the given flat positions, the root included. */
const pathGroups = (view: GroupedView, positions: readonly number[]): Set<number> => {
  const groups = new Set<number>([view.tree.groupCount]);
  for (const position of positions) {
    for (let g = view.tree.rowGroup[position]!; g >= 0; g = view.tree.parent[g]!) groups.add(g);
  }
  return groups;
};

export const createGroupedAccess = <TData = unknown>(
  source: FlatRowSource,
  spec: GroupingSpec,
  expansion: ExpansionState,
  initial: GroupedView,
): HierarchicalRowAccess<TData> => {
  let view = initial;
  const readers = new Map<string, Reader>();
  const finder = createPositionFinder(source);
  const dimensionFields = new Set(spec.dimensions.map((dimension) => dimension.field));

  const readerOf = (field: string): Reader => {
    let reader = readers.get(field);
    if (reader === undefined) {
      reader = source.reader(field);
      readers.set(field, reader);
    }
    return reader;
  };

  const recordId = (position: number): RowId => {
    const id = source.getRowId(position);
    finder.remember(id, position);
    return id;
  };

  const isTotal = (viewRow: number) => viewRow >= 0 && viewRow === view.visible.totalIndex;
  const aggregateGroupAt = (viewRow: number) =>
    isTotal(viewRow) ? view.tree.groupCount : view.visible.groupAt(viewRow);

  const getRowId = (viewRow: number): RowId => {
    const position = view.visible.leafAt(viewRow);
    if (position >= 0) return recordId(position);
    if (isTotal(viewRow)) return TOTAL_ROW_ID;
    const group = view.visible.groupAt(viewRow);
    return group < 0 ? -1 : groupIdOf(view.tree, group);
  };

  const getRow = (viewRow: number): HierarchyRow | undefined => {
    const position = view.visible.leafAt(viewRow);
    if (position >= 0) return { kind: "record", id: recordId(position), depth: spec.dimensions.length };
    if (isTotal(viewRow)) return { kind: "total", id: TOTAL_ROW_ID, depth: 0, leafCount: view.tree.leafOrder.length };
    const group = view.visible.groupAt(viewRow);
    return group < 0 ? undefined : groupRow(view, group);
  };

  const getValue = (viewRow: number, field: string): CellValue => {
    const position = view.visible.leafAt(viewRow);
    if (position >= 0) return readerOf(field)(position) ?? null;
    const group = aggregateGroupAt(viewRow);
    return group < 0 ? null : (view.foldOf.get(field)?.values[group] ?? null);
  };

  const locate = (id: RowId): number => {
    if (id === TOTAL_ROW_ID) return view.visible.totalIndex;
    if (typeof id === "string" && id.startsWith(GROUP_ID_PREFIX)) {
      const group = findGroup(view.tree, id);
      return group < 0 ? -1 : locateGroup(view, group);
    }
    const position = finder.find(id);
    return position < 0 ? -1 : locatePosition(view, position);
  };

  const setGroup = (group: number, open: boolean): boolean => {
    const bit = open ? 1 : 0;
    if (view.expanded[group] === bit) return false;
    view.expanded[group] = bit;
    expansion.record(groupIdOf(view.tree, group), view.tree.depth[group]!, open);
    return true;
  };

  const setExpanded = (ids: readonly RowId[] | null, open: boolean): boolean => {
    let changed = false;
    if (ids === null) {
      for (let group = 0; group < view.tree.groupCount; group++) changed = setGroup(group, open) || changed;
    } else {
      for (const id of ids) {
        const group = findGroup(view.tree, id);
        changed = (group >= 0 && setGroup(group, open)) || changed;
      }
    }
    if (changed) view.visible.rebuild();
    return changed;
  };

  const getRecord = (viewRow: number): TData | undefined => {
    const position = view.visible.leafAt(viewRow);
    return position < 0 ? undefined : (source.getRecord?.(position) as TData | undefined);
  };

  const refold = (positions: readonly number[], fields: ReadonlySet<string>) => {
    const groups = pathGroups(view, positions);
    for (const fold of view.folds) {
      if (fields.has(fold.sourceField)) fold.refold(groups);
    }
  };

  /** Expands every collapsed ancestor of a record that changed terminal group, so it stays visible. */
  const revealMoved = (positions: readonly number[], groupIds: readonly string[]) => {
    let changed = false;
    for (const [index, position] of positions.entries()) {
      const terminal = view.tree.rowGroup[position]!;
      if (groupIdOf(view.tree, terminal) === groupIds[index]) continue;
      for (let g = terminal; g >= 0; g = view.tree.parent[g]!) changed = setGroup(g, true) || changed;
    }
    if (changed) view.visible.rebuild();
  };

  const regroup = (changes: readonly HierarchyRecordChange[]): boolean => {
    const moved = changes
      .filter((change) => dimensionFields.has(change.field))
      .map((change) => view.visible.leafAt(change.viewRow))
      .filter((position) => position >= 0);
    const groupIds = moved.map((position) => groupIdOf(view.tree, view.tree.rowGroup[position]!));
    const rebuilt = buildGroupedView(source, spec, expansion);
    // An edit that makes a key an object without `toKey` keeps the groups it had.
    if ("reason" in rebuilt) return false;
    view = rebuilt;
    revealMoved(moved, groupIds);
    return true;
  };

  const recordsChanged = (changes: readonly HierarchyRecordChange[]): boolean => {
    const positions = changes.map((change) => view.visible.leafAt(change.viewRow)).filter((p) => p >= 0);
    const fields = new Set(changes.map((change) => change.field));
    if ([...fields].some((field) => dimensionFields.has(field)) && regroup(changes)) return true;
    refold(positions, fields);
    return false;
  };

  return {
    hierarchical: true,
    get rowCount() {
      return view.visible.rowCount;
    },
    getRowId,
    getRow,
    getValue,
    locate,
    setExpanded,
    getRecord,
    recordsChanged,
  };
};
