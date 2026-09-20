// packages/core/src/geometry/index.ts

export { buildOffsets, searchOffsets, clampIndex } from "./offsets";
export { windowOf, type AxisWindow, type VirtualAxis } from "./virtual-axis";
export { createFixedAxis } from "./fixed-axis";
export { createPrefixAxis } from "./prefix-axis";
export {
  DEFAULT_MIN_COLUMN_WIDTH,
  isUsableWidth,
  normalizeColumnWidth,
  resolveColumnWidths,
  type WidthSource,
} from "./column-widths";
export {
  createColumnLayoutResolver,
  createSeedColumnLayout,
  resolveColumnLayout,
  type ColumnLayoutInput,
  type ColumnLayoutResolver,
} from "./column-layout";
export { createColumnIndex, type ColumnIndex } from "./column-index";
export {
  createRowGeometry,
  type RowGeometry,
  type RowGeometryDeps,
  type RowMapper,
  type RowScrollMapping,
} from "./row-geometry";
export {
  createGridGeometry,
  type GridGeometryDeps,
  type GridGeometryService,
  type GridViewportSample,
} from "./grid-geometry";
export { toReadonlyGeometry } from "./readonly-geometry";
