import { computed } from '@angular/core';
import type { Signal } from '@angular/core';
import { resolveGroupLabelColumnId } from '@gp-grid/core';
import type {
  ColumnDefinition,
  ColumnLayoutSnapshot,
  GridInstruction,
  GridLabels,
} from '@gp-grid/core';
import type { RowGroupCellContext } from './components/row-group-cells';
import type { GroupLabelRendererTemplate } from './types';

/** `GridState.hierarchical` as the reducer derives it; `null` when the batch loads nothing. */
export const hierarchicalOf = (instructions: readonly GridInstruction[]): boolean | null => {
  let hierarchical: boolean | null = null;
  for (const instruction of instructions) {
    if (instruction.type === 'DATA_LOADED') hierarchical = instruction.hierarchical === true;
  }
  return hierarchical;
};

export interface RowGroupCellDeps {
  hierarchical: Signal<boolean>;
  layout: Signal<ColumnLayoutSnapshot | null>;
  columns: Signal<readonly ColumnDefinition[]>;
  labels: Signal<GridLabels>;
  groupLabelColumn: Signal<string | undefined>;
  groupLabelRenderer: Signal<GroupLabelRendererTemplate | null>;
  onTogglePointerDown: (rowIndex: number, event: PointerEvent) => void;
  onToggle: (rowIndex: number) => void;
}

/** What the cells of a hierarchy share; `null` while the grid is flat. */
export const createRowGroupCells = (deps: RowGroupCellDeps): Signal<RowGroupCellContext | null> =>
  computed(() => {
    const layout = deps.layout();
    if (deps.hierarchical() === false || layout === null) return null;
    return {
      labelColumnId: resolveGroupLabelColumnId(layout, deps.groupLabelColumn()),
      labels: deps.labels(),
      columns: deps.columns(),
      renderer: deps.groupLabelRenderer(),
      onTogglePointerDown: deps.onTogglePointerDown,
      onToggle: deps.onToggle,
    };
  });
