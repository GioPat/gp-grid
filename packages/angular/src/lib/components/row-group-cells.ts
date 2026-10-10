import type { GroupCellInput } from '@gp-grid/core';
import type { GroupLabelRendererTemplate } from '../types';

/** Shared by every cell while a hierarchy is bound; `null` while flat. */
export type RowGroupCellContext = GroupCellInput & {
  renderer: GroupLabelRendererTemplate | null;
  onTogglePointerDown: (rowIndex: number, event: PointerEvent) => void;
  onToggle: (rowIndex: number) => void;
};
