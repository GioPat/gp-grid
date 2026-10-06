// packages/core/src/grid-core-row-groups.ts
// `GridCore.rowGroups` (D3): expansion commands over the bound hierarchy.

import type {
  HierarchicalRowAccess,
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
  /** Regroup the resident rows with no query; `"unsupported"` without a local engine. */
  setGrouping(grouping: RowGrouping | null): RowGroupingResult;
}

export interface RowGroupsControllerDeps<TData> extends HierarchyChangeDeps<TData> {
  isDestroyed: () => boolean;
  onRowGroupToggled?: (event: RowGroupToggledEvent) => void;
}

const APPLIED: RowGroupResult = { status: "applied" };
const UNCHANGED: RowGroupResult = { status: "unchanged" };
const UNSUPPORTED = { status: "unsupported" } as const;

export class RowGroupsController<TData> implements GridRowGroupsApi {
  private readonly deps: RowGroupsControllerDeps<TData>;

  constructor(deps: RowGroupsControllerDeps<TData>) {
    this.deps = deps;
  }

  isActive(): boolean {
    return this.deps.getRowData().getHierarchy() !== null;
  }

  setExpanded(ids: readonly RowId[] | null, expanded: boolean): RowGroupResult {
    const hierarchy = this.expandable();
    if (hierarchy === null) return UNSUPPORTED;
    const applied = applyViewRowsChange(this.deps, () => hierarchy.setExpanded?.(ids, expanded) === true);
    return applied ? APPLIED : UNCHANGED;
  }

  toggle(id: RowId): RowGroupResult {
    const hierarchy = this.expandable();
    if (hierarchy === null) return UNSUPPORTED;
    const viewIndex = hierarchy.locate(id);
    const row = viewIndex < 0 ? undefined : hierarchy.getRow(viewIndex);
    if (row?.kind !== "group" || row.id !== id) return UNCHANGED;
    return this.setExpanded([id], row.expanded === false);
  }

  setGrouping(): RowGroupingResult {
    return UNSUPPORTED;
  }

  /**
   * A pointer or key gesture on a view row; only a gesture fires `onRowGroupToggled`.
   *
   * @internal
   */
  toggleAt(viewIndex: number): RowGroupResult {
    if (this.expandable() === null) return UNSUPPORTED;
    const row = this.deps.getRowData().getHierarchyRow(viewIndex);
    if (row?.kind !== "group") return UNCHANGED;
    const expanded = row.expanded === false;
    const result = this.setExpanded([row.id], expanded);
    if (result.status === "applied") this.deps.onRowGroupToggled?.({ rowId: row.id, expanded });
    return result;
  }

  /** The bound hierarchy when it can expand, else `null`. */
  private expandable(): HierarchicalRowAccess | null {
    if (this.deps.isDestroyed()) return null;
    const hierarchy = this.deps.getRowData().getHierarchy();
    return hierarchy?.setExpanded === undefined ? null : hierarchy;
  }
}
