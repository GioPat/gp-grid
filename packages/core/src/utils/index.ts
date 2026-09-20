// packages/core/src/utils/index.ts

export {
  calculateColumnPositions,
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

export { scrollCellIntoView } from "./scroll-helpers";

export { formatCellValue } from "./format-helpers";

export { calculateFillHandlePosition } from "./fill-helpers";
export type {
  CalculateFillHandlePositionParams,
  FillHandlePosition,
} from "./fill-helpers";

export { calculateFilterPopupPosition } from "./popup-position";
export type { PopupPosition } from "./popup-position";

export { bindPeekSelectAll } from "./peek-select-all";

export { buildDataSourceRequest } from "./data-source-request";
export type { BuildRequestOptions } from "./data-source-request";

export { reorderCachedRows } from "./cached-rows";


export { readCell, writeCell } from "./cell-access";
export type { WriteCellDeps } from "./cell-access";

export { createWriteRejection } from "./write-rejection";
