// packages/react/src/components/GroupLabelCell.tsx

import React from "react";
import type { HierarchyGroupRow, HierarchyTotalRow } from "@gp-grid/core";
import { groupLabelParams, groupToggleClassName } from "@gp-grid/core";
import { renderGroupLabel } from "../renderers/groupLabelRenderer";
import type { RowGroupCellContext } from "../hooks/useRowGroups";

export interface GroupLabelCellProps {
  row: HierarchyGroupRow | HierarchyTotalRow;
  rowIndex: number;
  label: string;
  context: RowGroupCellContext;
}

// The cell's own double-click toggles too, so a double-click on the expander
// must not reach it after its two pointer downs already toggled.
const stopDoubleClick = (e: React.MouseEvent): void => e.stopPropagation();

/** Content of a group or total row's label cell: the expander and the label. */
export const GroupLabelCell = (props: GroupLabelCellProps): React.ReactNode => {
  const { row, rowIndex, label, context } = props;
  const onPointerDown = (e: React.PointerEvent): void => {
    if (row.kind === "group") context.onTogglePointerDown(rowIndex, e);
  };

  return (
    <>
      <span
        className={groupToggleClassName(row)}
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onDoubleClick={stopDoubleClick}
      />
      <span className="gp-grid-group-label">
        {renderGroupLabel(groupLabelParams(row, rowIndex, label, context.onToggle), context.renderer)}
      </span>
    </>
  );
};
