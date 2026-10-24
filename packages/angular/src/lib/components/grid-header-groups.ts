import { TemplateRef } from '@angular/core';
import type {
  ColumnGroupDefinition,
  ColumnGroupHeaderParams,
  HeaderAssociations,
  HeaderFragment,
  HeaderFragments,
  HeaderRendererParams,
  ResolvedColumn,
} from '@gp-grid/core';

/** Renders one fragment of a column group. */
export type GroupHeaderRendererTemplate = TemplateRef<{ $implicit: ColumnGroupHeaderParams }>;

/**
 * Header renderer registry, shared by columns and groups: a key receives the
 * params of whichever definition names it.
 */
export type HeaderRendererRegistry = Record<
  string,
  TemplateRef<{ $implicit: HeaderRendererParams }> | GroupHeaderRendererTemplate
>;

/** Band placement of a leaf in a grouped header (D9); absent while flat. */
export interface LeafHeaderBands {
  /** 1-based first band. */
  rowIndex: number;
  /** Bands the leaf spans. */
  rowSpan: number;
  /** Ids of its mounted ancestor fragments, outermost first. */
  describedBy: string | undefined;
}

export const NO_HEADER_FRAGMENTS: HeaderFragments = { start: [], center: [], end: [] };

/** `null` while flat, which `associations` is. */
export const leafHeaderBands = (
  associations: HeaderAssociations | null,
  bandCount: number,
  column: ResolvedColumn,
): LeafHeaderBands | null => {
  if (associations === null) return null;
  return {
    rowIndex: column.headerBand + 1,
    rowSpan: bandCount - column.headerBand,
    describedBy: associations.describedBy.get(column.columnId),
  };
};

/**
 * A group's renderer: its own template, or a key of the header renderer
 * registry. The global header renderer does not apply to groups.
 */
export const resolveGroupTemplate = (
  group: ColumnGroupDefinition | undefined,
  registry: HeaderRendererRegistry,
): GroupHeaderRendererTemplate | null => {
  const renderer: unknown = group?.headerRenderer;
  if (renderer instanceof TemplateRef) return renderer as GroupHeaderRendererTemplate;
  if (typeof renderer === 'string') {
    return (registry[renderer] as GroupHeaderRendererTemplate | undefined) ?? null;
  }
  return null;
};

/** `layoutColumns` is `ColumnLayoutSnapshot.columns`, which the fragment's leaves index. */
export const groupHeaderParams = (
  fragment: HeaderFragment,
  group: ColumnGroupDefinition,
  layoutColumns: readonly ResolvedColumn[],
): ColumnGroupHeaderParams => ({
  group,
  groupId: fragment.groupId,
  band: fragment.band,
  region: fragment.region,
  leafCount: fragment.leafCount,
  columnIds: layoutColumns
    .slice(fragment.firstDisplayIndex, fragment.firstDisplayIndex + fragment.leafCount)
    .map((column) => column.columnId),
});
