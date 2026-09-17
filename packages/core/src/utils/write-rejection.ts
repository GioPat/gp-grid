// packages/core/src/utils/write-rejection.ts

import type { CellWriteRejectedEvent, WriteRejectionOperation } from "../types";

/**
 * Build the diagnostic emitted when the bound source refuses a write. Every
 * write entry point reports through this one shape so a consumer can observe
 * rejections consistently regardless of which command attempted the write.
 */
export const createWriteRejection = (
  row: number,
  col: number,
  field: string,
  operation: WriteRejectionOperation,
): CellWriteRejectedEvent => ({
  row,
  col,
  field,
  reason: "read-only-source",
  operation,
});
