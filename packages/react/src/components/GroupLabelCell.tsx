// packages/react/src/components/GroupLabelCell.tsx

import React from "react";
import type { HierarchyGroupRow, HierarchyTotalRow } from "@gp-grid/core";
import { renderGroupLabel } from "../renderers/groupLabelRenderer";
import type { RowGroupCellContext } from "./row-group-attributes";

export interface GroupLabelCellProps {
  row: HierarchyGroupRow | HierarchyTotalRow;
  rowIndex: number;
  label: string;
  context: RowGroupCellContext;
}

// The cell's own double-click toggles too, so a double-click on the expander
// must not reach it after its two pointer downs already toggled (D5).
const stopDoubleClick = (e: React.MouseEvent): void => e.stopPropagation();

/** Content of a group or total row's label cell: the expander and the label. */
export const GroupLabelCell = (props: GroupLabelCellProps): React.ReactNode => {
  const { row, rowIndex, label, context } = props;
  const isGroup = row.kind === "group";
  const toggle = (): void => {
    if (isGroup) context.onToggle(rowIndex);
  };

  const toggleClassName = [
    "gp-grid-group-toggle",
    isGroup ? "" : "gp-grid-group-toggle--none",
    isGroup && row.expanded ? "gp-grid-group-toggle--expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <span
        className={toggleClassName}
        aria-hidden="true"
        onPointerDown={isGroup ? (e) => context.onTogglePointerDown(rowIndex, e) : undefined}
        onDoubleClick={stopDoubleClick}
      />
      <span className="gp-grid-group-label">
        {renderGroupLabel({ row, viewIndex: rowIndex, label, toggle }, context.renderer)}
      </span>
    </>
  );
};
