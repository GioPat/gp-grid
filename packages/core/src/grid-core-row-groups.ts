// packages/core/src/grid-core-row-groups.ts
// `GridCore.rowGroups`: expansion commands over the bound hierarchy.

import type {
  HierarchicalRowAccess,
  HierarchyChange,
  HierarchyRow,
  RowGroupResult,
  RowGrouping,
  RowGroupingResult,
  RowGroupToggledEvent,
  RowId,
} from "./types";
import { applyViewRowsChange, type HierarchyChangeDeps } from "./grid-core-hierarchy-change";

export interface GridRowGroupsApi {
  /** Whether a hierarchy is bound. */
  isActive(): boolean;
  /** `null` targets every group. */
  setExpanded(ids: readonly RowId[] | null, expanded: boolean): RowGroupResult;
  /** Flip one visible group. */
  toggle(id: RowId): RowGroupResult;
  /** Regroup the resident flat rows with no query; `null` returns to them. */
  setGrouping(grouping: RowGrouping | null): RowGroupingResult;
}

export interface RowGroupsControllerDeps<TData> extends HierarchyChangeDeps<TData> {
  isDestroyed: () => boolean;
  /** The loaded-window path of a flat page: pending heights by id, then the slots. */
  onRowsLoaded: (totalRowsChanged: boolean) => void;
  onRowGroupToggled?: (event: RowGroupToggledEvent) => void;
}

const APPLIED: RowGroupResult = { status: "applied" };
const UNCHANGED: RowGroupResult = { status: "unchanged" };
const UNSUPPORTED = { status: "unsupported" } as const;

/** PRD 012 D1: a group row with `childCount` 0 never expands. */
const isChildless = (row: HierarchyRow | undefined): boolean => row?.kind === "group" && row.childCount === 0;

const isChildlessId = (hierarchy: HierarchicalRowAccess, id: RowId): boolean => {
  const viewIndex = hierarchy.locate(id);
  const row = viewIndex < 0 ? undefined : hierarchy.getRow(viewIndex);
  return row?.id === id && isChildless(row);
};

export class RowGroupsController<TData> implements GridRowGroupsApi {
  private readonly deps: RowGroupsControllerDeps<TData>;

  constructor(deps: RowGroupsControllerDeps<TData>) {
    this.deps = deps;
  }

  isActive(): boolean {
    return this.deps.rowData.getHierarchy() !== null;
  }

  setExpanded(ids: readonly RowId[] | null, expanded: boolean): RowGroupResult {
    const hierarchy = this.expandable();
    if (hierarchy === null) return UNSUPPORTED;
    const targets = ids?.filter((id) => isChildlessId(hierarchy, id) === false) ?? null;
    if (targets?.length === 0) return UNCHANGED;
    const applied = applyViewRowsChange(this.deps, () => hierarchy.setExpanded?.(targets, expanded) === true);
    return applied ? APPLIED : UNCHANGED;
  }

  toggle(id: RowId): RowGroupResult {
    const hierarchy = this.expandable();
    if (hierarchy === null) return UNSUPPORTED;
    const viewIndex = hierarchy.locate(id);
    const row = viewIndex < 0 ? undefined : hierarchy.getRow(viewIndex);
    if (row?.kind !== "group" || row.id !== id || isChildless(row)) return UNCHANGED;
    return this.setExpanded([id], row.expanded === false);
  }

  setGrouping(grouping: RowGrouping | null): RowGroupingResult {
    if (this.deps.isDestroyed()) return UNSUPPORTED;
    const rowData = this.deps.rowData;
    let result: RowGroupingResult = UNCHANGED;
    applyViewRowsChange(this.deps, () => {
      const bound = rowData.getHierarchy();
      result = rowData.setGrouping(grouping);
      return rowData.getHierarchy() !== bound;
    });
    return result;
  }

  /**
   * A pointer or key gesture on a view row; only a gesture fires `onRowGroupToggled`.
   *
   * @internal
   */
  toggleAt(viewIndex: number): RowGroupResult {
    if (this.expandable() === null) return UNSUPPORTED;
    const row = this.deps.rowData.getHierarchyRow(viewIndex);
    if (row?.kind !== "group" || isChildless(row)) return UNCHANGED;
    const expanded = row.expanded === false;
    const result = this.setExpanded([row.id], expanded);
    if (result.status === "applied") this.deps.onRowGroupToggled?.({ rowId: row.id, expanded });
    return result;
  }

  /**
   * PRD 009 D4: a change the bound hierarchy reported outside any core call.
   *
   * @internal
   */
  applyHierarchyChange(change: HierarchyChange): void {
    if (this.deps.isDestroyed()) {
      // The provider's rows move only through `apply()`, with or without a live core.
      if (change.kind === "view") change.apply();
      return;
    }
    switch (change.kind) {
      case "rows":
        this.deps.rowData.bumpDataRevision();
        this.deps.onRowsLoaded(false);
        return;
      case "view":
        applyViewRowsChange(this.deps, () => {
          change.apply();
          return true;
        });
        return;
      case "error":
        this.deps.batcher.emit({ type: "DATA_ERROR", error: change.message });
    }
  }

  /** The bound hierarchy when it can expand, else `null`. */
  private expandable(): HierarchicalRowAccess | null {
    if (this.deps.isDestroyed()) return null;
    const hierarchy = this.deps.rowData.getHierarchy();
    return hierarchy?.setExpanded === undefined ? null : hierarchy;
  }
}
