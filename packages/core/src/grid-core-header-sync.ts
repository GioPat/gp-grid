// packages/core/src/grid-core-header-sync.ts
// Header snapshot/diff state for ViewSync: a header instruction is emitted
// only when the column identity, its sort state or its filter flag moved.

import type { InstructionBatcher, SortFilterManager } from "./managers";
import type { ColumnDefinition, SortDirection } from "./types";

interface EmittedHeader {
  column: ColumnDefinition;
  sortDirection?: SortDirection;
  sortIndex?: number;
  hasFilter: boolean;
}

export interface HeaderSyncDeps<TData> {
  batcher: InstructionBatcher;
  sortFilter: SortFilterManager<TData>;
  getColumns: () => ColumnDefinition[];
}

export class HeaderSync<TData> {
  private readonly deps: HeaderSyncDeps<TData>;
  /** Baseline a header must differ from to be re-emitted. */
  private readonly emittedHeaders = new Map<string, EmittedHeader>();
  private emittedHeaderIds: string[] = [];

  constructor(deps: HeaderSyncDeps<TData>) {
    this.deps = deps;
  }

  emitHeaders(): void {
    const { batcher, sortFilter } = this.deps;
    const columns = this.deps.getColumns();
    const sortInfoMap = sortFilter.getSortInfoMap();

    const currentIds: string[] = [];
    const currentIdSet = new Set<string>();
    for (const column of columns) {
      const columnId = column.colId ?? column.field;
      currentIds.push(columnId);
      currentIdSet.add(columnId);
      const sortInfo = sortInfoMap.get(columnId);
      const hasFilter = sortFilter.hasActiveFilter(columnId);
      if (this.headerIsUnchanged(columnId, column, sortInfo, hasFilter)) continue;
      this.emittedHeaders.set(columnId, {
        column,
        sortDirection: sortInfo?.direction,
        sortIndex: sortInfo?.index,
        hasFilter,
      });
      batcher.emit({
        type: "UPDATE_HEADER",
        columnId,
        column,
        sortDirection: sortInfo?.direction,
        sortIndex: sortInfo?.index,
        hasFilter,
      });
    }

    const removedIds = this.emittedHeaderIds.filter((id) => currentIdSet.has(id) === false);
    if (removedIds.length > 0) {
      batcher.emit({ type: "REMOVE_HEADERS", columnIds: removedIds });
      for (const id of removedIds) this.emittedHeaders.delete(id);
    }
    this.emittedHeaderIds = currentIds;
  }

  private headerIsUnchanged(
    columnId: string,
    column: ColumnDefinition,
    sortInfo: { direction?: SortDirection | null; index?: number } | undefined,
    hasFilter: boolean,
  ): boolean {
    const previous = this.emittedHeaders.get(columnId);
    if (previous === undefined) return false;
    return (
      previous.column === column &&
      previous.sortDirection === sortInfo?.direction &&
      previous.sortIndex === sortInfo?.index &&
      previous.hasFilter === hasFilter
    );
  }
}
