// packages/core/src/utils/index.ts

export {
  calculateColumnPositions,
  calculateScaledColumnPositions,
  getTotalWidth,
  findColumnAtX,
} from "./positioning";

export {
  normalizeRange,
  isCellInRange,
  isCellSelected,
  isCellActive,
  isRowVisible,
  isCellEditing,
  isCellInFillPreview,
  buildCellClasses,
  isRowInSelectionRange,
  isColumnInSelectionRange,
} from "./classNames";

export type { NormalizedRange } from "./classNames";

export { getFieldValue, setFieldValue } from "../indexed-data-store/field-helpers";

export {
  createInstructionEmitter,
  createBatchInstructionEmitter,
} from "./event-emitter";

export type {
  InstructionEmitter,
  BatchInstructionEmitter,
  BatchInstructionListener,
} from "./event-emitter";

export { findSlotForRow, scrollCellIntoView } from "./scroll-helpers";

export { formatCellValue } from "./format-helpers";

export { calculateFillHandlePosition } from "./fill-helpers";
export type {
  VisibleColumnInfo,
  CalculateFillHandlePositionParams,
  FillHandlePosition,
} from "./fill-helpers";

export { calculateFilterPopupPosition } from "./popup-position";
export type { PopupPosition } from "./popup-position";

export { buildDataSourceRequest } from "./data-source-request";
export type { BuildRequestOptions } from "./data-source-request";

export { reorderCachedRows } from "./cached-rows";

export { computeColumnPositions } from "./column-positions";

export { readCell, writeCell } from "./cell-access";
export type { WriteCellDeps } from "./cell-access";
