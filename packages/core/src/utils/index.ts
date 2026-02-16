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
