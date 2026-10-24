// packages/core/src/utils/cell-coercion.ts
// Converts a pasted or edited value to what the column's `cellDataType` holds.

import type { CellValue, ColumnDefinition } from "../types";
import type { ClipboardCell } from "./clipboard-helpers";

export type CoerceCellValueResult = { ok: true; value: CellValue } | { ok: false };

const ok = (value: CellValue): CoerceCellValueResult => ({ ok: true, value });
const REJECTED: CoerceCellValueResult = { ok: false };

const isValidDate = (value: Date): boolean => Number.isFinite(value.getTime());

const blankOf = (column: ColumnDefinition): CoerceCellValueResult =>
  ok(column.cellDataType === "text" ? "" : null);

const coerceNumber = (value: CellValue, trimmed: string): CoerceCellValueResult => {
  if (typeof value === "number") return Number.isFinite(value) ? ok(value) : REJECTED;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? ok(parsed) : REJECTED;
};

const coerceBoolean = (value: CellValue, trimmed: string): CoerceCellValueResult => {
  if (typeof value === "boolean") return ok(value);
  const normalized = trimmed.toLowerCase();
  if (normalized === "true") return ok(true);
  if (normalized === "false") return ok(false);
  return REJECTED;
};

const coerceDate = (value: CellValue, trimmed: string): CoerceCellValueResult => {
  if (value instanceof Date) return isValidDate(value) ? ok(value) : REJECTED;
  const parsed = new Date(trimmed);
  return isValidDate(parsed) ? ok(parsed) : REJECTED;
};

const coerceDateString = (trimmed: string, text: string): CoerceCellValueResult =>
  isValidDate(new Date(trimmed)) ? ok(text) : REJECTED;

const coerceObject = (value: CellValue, trimmed: string): CoerceCellValueResult => {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) return ok(value);
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" ? ok(parsed) : REJECTED;
  } catch {
    return REJECTED;
  }
};

/** A cell's text through the column type; a typed `value` of that type is checked, not parsed. */
export const coerceCellValue = (cell: ClipboardCell, column: ColumnDefinition): CoerceCellValueResult => {
  if (cell.value === null) return ok(null);
  const text = cell.text;
  const trimmed = text.trim();
  if (typeof cell.value === "string" && trimmed.length === 0) return blankOf(column);
  switch (column.cellDataType) {
    case "text":
      return ok(typeof cell.value === "string" ? text : cell.value);
    case "number":
      return coerceNumber(cell.value, trimmed);
    case "boolean":
      return coerceBoolean(cell.value, trimmed);
    case "date":
    case "dateTime":
      return coerceDate(cell.value, trimmed);
    case "dateString":
    case "dateTimeString":
      return coerceDateString(trimmed, text);
    case "object":
      return coerceObject(cell.value, trimmed);
  }
};

/** An editor's draft: a string is parsed like a pasted cell, a typed value only has to fit the column. */
export const coerceEditValue = (value: CellValue, column: ColumnDefinition | undefined): CoerceCellValueResult => {
  if (column === undefined) return ok(value);
  return coerceCellValue({ value, text: typeof value === "string" ? value : "" }, column);
};
