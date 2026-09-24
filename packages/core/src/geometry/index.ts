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
  partitionByPin,
  flattenPartition,
  regionBounds,
  regionOfPin,
  clampIndexToRegion,
  baseIndexOfLayout,
  type ColumnPartition,
} from "./column-order";
export {
  EMPTY_REGION_LAYOUT,
  getColumnRegionLayout,
  regionAtIndex,
} from "./column-regions";
export {
  UNMEASURED_CENTER_EXTENT,
  buildCenterOffsets,
  resolveCenterRange,
  type CenterRangeInput,
} from "./column-range";
export {
  MAX_RETAINED_COLUMNS,
  MAX_RETENTION_KEYS,
  mergeRetained,
  resolveColumnWindow,
} from "./column-window";
export { createColumnGeometry } from "./column-geometry";
export {
  createRowGeometry,
  type RowGeometry,
  type RowGeometryDeps,
} from "./row-geometry";
export {
  clampFirstVisible,
  createRowMapper,
  type RowMapper,
  type RowScrollMapping,
} from "./row-mapping";
export {
  DEFAULT_MAX_FROZEN_ROWS,
  DEFAULT_MIN_SUFFIX_HEIGHT,
  UNMEASURED_VIEWPORT_HEIGHT,
  resolveFrozenRows,
  resolveRowRegionLayout,
  type FrozenRowsInput,
  type FrozenRowsLimit,
  type FrozenRowsState,
  type RowRegionLayout,
} from "./row-regions";
export {
  getRowClip,
  getRowRegionPosition,
  getSuffixRowViewportTop,
  getSuffixViewportHeight,
  getSuffixWindow,
  hitTestRowRegion,
  resolveRegionScrollCorrection,
  resolveRowRegionScrollTop,
  type RowRegion,
  type RowRegionHit,
  type RowRegionMappingInput,
  type RowRegionScrollCorrectionInput,
  type RowRegionScrollInput,
} from "./row-regions-mapping";
export {
  createGridGeometry,
  type FrozenRowsRequest,
  type GridGeometryDeps,
  type GridGeometryService,
  type GridViewportSample,
} from "./grid-geometry";
export { toReadonlyGeometry } from "./readonly-geometry";
