// packages/core/src/pivot/pivot-access.ts
// The pivot's HierarchicalRowAccess over one view: group rows, the total row and generated cells (PRD 012 D5).

import type { CellValue, HierarchicalRowAccess, HierarchyRow, RowId } from "../types";
import { createGroupExpansion } from "../hierarchy/group-expansion";
import { findGroup } from "../hierarchy/group-lookup";
import { groupIdOf } from "../hierarchy/group-tree";
import type { ExpansionState } from "../hierarchy/tree-expansion";
import { GROUP_ID_PREFIX, TOTAL_ROW_ID, keyValue } from "../hierarchy/keys";
import { locateGroup } from "../hierarchy/visible-rows";
import type { PivotView } from "./pivot-view";

const isTerminal = (view: PivotView, group: number): boolean =>
  view.tree.depth[group] === view.tree.dimensions.length - 1;

const groupRow = (view: PivotView, group: number): HierarchyRow => {
  const { tree } = view;
  const depth = tree.depth[group]!;
  return {
    kind: "group",
    id: groupIdOf(tree, group),
    depth,
    expanded: view.expanded[group] === 1,
    childCount: isTerminal(view, group) ? 0 : tree.childCount[group]!,
    leafCount: tree.leafEnd[group]! - tree.leafStart[group]!,
    field: tree.dimensions[depth]!.field,
    value: keyValue(tree.tag[group]!, tree.key[group]!),
  };
};

const cellOf = (view: PivotView, group: number, columnId: string): CellValue => {
  const column = view.resolve(columnId);
  if (column === null) return null;
  if (column.tuple < 0) return view.totals[column.measure]?.[group] ?? null;
  return view.folds[column.measure]!.valueAt(group, column.tuple);
};

/** Answers nothing once released, so a grid holding it after `destroy()` reads empty rows. */
export const createPivotAccess = <TData = unknown>(
  initial: PivotView,
  expansion: ExpansionState,
): HierarchicalRowAccess<TData> => {
  let view: PivotView | null = initial;

  const isTotal = (current: PivotView, viewRow: number) => viewRow >= 0 && viewRow === current.visible.totalIndex;

  const groupAtRow = (current: PivotView, viewRow: number): number =>
    isTotal(current, viewRow) ? current.tree.groupCount : current.visible.groupAt(viewRow);

  const getRowId = (viewRow: number): RowId => {
    if (view === null) return -1;
    if (isTotal(view, viewRow)) return TOTAL_ROW_ID;
    const group = view.visible.groupAt(viewRow);
    return group < 0 ? -1 : groupIdOf(view.tree, group);
  };

  const getRow = (viewRow: number): HierarchyRow | undefined => {
    if (view === null) return undefined;
    if (isTotal(view, viewRow)) {
      return { kind: "total", id: TOTAL_ROW_ID, depth: 0, leafCount: view.tree.leafOrder.length };
    }
    const group = view.visible.groupAt(viewRow);
    return group < 0 ? undefined : groupRow(view, group);
  };

  const getValue = (viewRow: number, columnId: string): CellValue => {
    if (view === null) return null;
    const group = groupAtRow(view, viewRow);
    return group < 0 ? null : cellOf(view, group, columnId);
  };

  const locate = (id: RowId): number => {
    if (view === null) return -1;
    if (id === TOTAL_ROW_ID) return view.visible.totalIndex;
    if (typeof id !== "string" || id.startsWith(GROUP_ID_PREFIX) === false) return -1;
    const group = findGroup(view.tree, id);
    return group < 0 ? -1 : locateGroup(view, group);
  };

  // `setExpanded` checks the release before calling it.
  const expand = createGroupExpansion(
    () => view!,
    expansion,
    (group) => isTerminal(view!, group) === false,
  );

  return {
    hierarchical: true,
    get rowCount() {
      return view?.visible.rowCount ?? 0;
    },
    getRowId,
    getRow,
    getValue,
    locate,
    setExpanded: (ids, open) => view !== null && expand(ids, open),
    release: () => {
      view = null;
    },
  };
};
