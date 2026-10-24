// packages/vue/src/components/group-depth-style.ts

import { GROUP_DEPTH_PROPERTY, type HierarchyRow } from "@gp-grid/core";

/** The label column's indent custom property, as a style string fragment. */
export const groupDepthStyle = (row: HierarchyRow | undefined): string =>
  row === undefined ? "" : ` ${GROUP_DEPTH_PROPERTY}: ${row.depth};`;
