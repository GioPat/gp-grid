// packages/react/src/components/GridHeaderGroupCell.tsx

import React from "react";
import type {
  ColumnGroupLookup,
  GridCore,
  HeaderBox,
  HeaderFragment,
  ResolvedColumn,
} from "@gp-grid/core";
import { renderGroupHeader } from "../renderers/headerRenderer";
import type { ReactHeaderRendererRegistry } from "../types";

export interface GridHeaderGroupCellProps<TData = unknown> {
  fragment: HeaderFragment;
  id: string;
  box: HeaderBox;
  /** `ColumnLayoutSnapshot.columns`, which the fragment's leaves index. */
  layoutColumns: readonly ResolvedColumn[];
  coreRef: React.RefObject<GridCore<TData> | null>;
  /** Resolves the group from the `columnGroups` prop while the core is null. */
  lookupGroup: ColumnGroupLookup;
  headerRenderers: ReactHeaderRendererRegistry;
}

/**
 * One fragment of a column group (D9): a header with no action. It never
 * carries `data-col-index`, which the filter popup and the fit read as a leaf.
 */
export const GridHeaderGroupCell = <TData = unknown>(
  props: GridHeaderGroupCellProps<TData>,
): React.ReactNode => {
  const { fragment, id, box, layoutColumns, coreRef, lookupGroup, headerRenderers } = props;
  const core = coreRef.current;
  const group = core === null
    ? lookupGroup(fragment.groupId)
    : core.columns.getGroup(fragment.groupId);
  const wrapClass = group?.wrapHeaderText === true ? " gp-grid-header-cell--wrap" : "";

  return (
    <div
      id={id}
      className={`gp-grid-header-cell gp-grid-header-group${wrapClass}`}
      role="columnheader"
      aria-colindex={fragment.firstDisplayIndex + 1}
      aria-colspan={fragment.leafCount}
      aria-rowindex={fragment.band + 1}
      data-group-id={fragment.groupId}
      data-band={fragment.band}
      data-fragment={fragment.fragmentId}
      style={{
        insetInlineStart: `${fragment.regionOffset}px`,
        width: `${fragment.width}px`,
        height: `${box.height}px`,
        top: `${box.top}px`,
      }}
    >
      {renderGroupHeader({ fragment, group, layoutColumns, headerRenderers })}
    </div>
  );
};
