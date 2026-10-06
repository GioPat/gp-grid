// packages/core/src/utils/write-rejection.ts

import type {
  CellWriteRejectedEvent,
  WriteRejectionOperation,
  WriteRejectionReason,
} from "../types";

/**
 * Build the diagnostic emitted when a write is refused. Every write entry
 * point reports through this one shape so a consumer can observe rejections
 * consistently regardless of which command attempted the write.
 */
export const createWriteRejection = (
  row: number,
  col: number,
  field: string,
  operation: WriteRejectionOperation,
  reason: WriteRejectionReason,
): CellWriteRejectedEvent => ({
  row,
  col,
  field,
  reason,
  operation,
});
