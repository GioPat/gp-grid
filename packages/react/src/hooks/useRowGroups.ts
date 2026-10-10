// packages/react/src/hooks/useRowGroups.ts

import { useCallback, useEffect, useMemo } from "react";
import type React from "react";
import type {
  ColumnDefinition,
  ColumnLayoutSnapshot,
  GridCore,
  GridLabels,
  GroupCellInput,
  RowGrouping,
} from "@gp-grid/core";
import { groupTogglePointerDown, resolveGroupLabelColumnId } from "@gp-grid/core";
import type { ReactGroupLabelRenderer } from "../types";

type CoreRef<TData> = React.RefObject<GridCore<TData> | null>;

/** Shared by every cell while a hierarchy is bound; `null` while flat. */
export type RowGroupCellContext = GroupCellInput & {
  renderer?: ReactGroupLabelRenderer;
  onTogglePointerDown: (rowIndex: number, e: React.PointerEvent) => void;
  onToggle: (rowIndex: number) => void;
};

/** A later `rowGrouping` reaches the current core through `setGrouping`, never a new core. */
export const useRowGroupingSync = <TData>(
  coreRef: CoreRef<TData>,
  rowGrouping: RowGrouping | null | undefined,
): void => {
  useEffect(() => {
    coreRef.current?.rowGroups.setGrouping(rowGrouping ?? null);
  }, [coreRef, rowGrouping]);
};

export interface RowGroupCellOptions {
  hierarchical: boolean;
  layout: ColumnLayoutSnapshot | null;
  columns: readonly ColumnDefinition[];
  labels: GridLabels;
  groupLabelColumn?: string;
  groupLabelRenderer?: ReactGroupLabelRenderer;
}

/** What the cells of a hierarchy share; `null` while the grid is flat. */
export const useRowGroupCellContext = <TData>(
  coreRef: CoreRef<TData>,
  options: RowGroupCellOptions,
): RowGroupCellContext | null => {
  const { hierarchical, layout, columns, labels, groupLabelColumn, groupLabelRenderer } = options;

  const onTogglePointerDown = useCallback(
    (rowIndex: number, e: React.PointerEvent): void => {
      groupTogglePointerDown(coreRef.current, rowIndex, e);
    },
    [coreRef],
  );

  const onToggle = useCallback(
    (rowIndex: number): void => {
      coreRef.current?.input.handleGroupToggle(rowIndex);
    },
    [coreRef],
  );

  return useMemo(() => {
    if (hierarchical === false || layout === null) return null;
    return {
      labelColumnId: resolveGroupLabelColumnId(layout, groupLabelColumn),
      labels,
      columns,
      renderer: groupLabelRenderer,
      onTogglePointerDown,
      onToggle,
    };
  }, [
    hierarchical,
    layout,
    columns,
    labels,
    groupLabelColumn,
    groupLabelRenderer,
    onTogglePointerDown,
    onToggle,
  ]);
};
