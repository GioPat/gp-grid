import type { CellValue, ColumnDefinition } from "../types";

export interface ClipboardCell {
  value: CellValue;
  text: string;
}

export type ClipboardMatrix = ClipboardCell[][];

export type CoerceClipboardValueResult =
  | { ok: true; value: CellValue }
  | { ok: false };

export const normalizeClipboardText = (text: string): string =>
  text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");

export const parseClipboardText = (text: string): ClipboardMatrix => {
  const normalized = normalizeClipboardText(text);
  const lines = normalized.split("\n");

  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }

  return lines.map((line) =>
    line.split("\t").map((cellText) => ({
      value: cellText,
      text: cellText,
    })),
  );
};

export const coerceClipboardValue = (
  cell: ClipboardCell,
  column: ColumnDefinition,
): CoerceClipboardValueResult => {
  if (cell.value === null) return { ok: true, value: null };

  const text = cell.text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return coerceBlankValue(column);

  switch (column.cellDataType) {
    case "text":
      return { ok: true, value: text };
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

const coerceBlankValue = (
  column: ColumnDefinition,
): CoerceClipboardValueResult => {
  if (column.cellDataType === "text") return { ok: true, value: "" };
  return { ok: true, value: null };
};

const coerceNumber = (
  value: CellValue,
  trimmed: string,
): CoerceClipboardValueResult => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { ok: true, value };
  }

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue)) {
    return { ok: true, value: numericValue };
  }

  return { ok: false };
};

const coerceBoolean = (
  value: CellValue,
  trimmed: string,
): CoerceClipboardValueResult => {
  if (typeof value === "boolean") return { ok: true, value };

  const normalized = trimmed.toLowerCase();
  if (normalized === "true") return { ok: true, value: true };
  if (normalized === "false") return { ok: true, value: false };

  return { ok: false };
};

const coerceDate = (
  value: CellValue,
  trimmed: string,
): CoerceClipboardValueResult => {
  if (value instanceof Date && isValidDate(value)) {
    return { ok: true, value };
  }

  const parsed = new Date(trimmed);
  if (isValidDate(parsed)) {
    return { ok: true, value: parsed };
  }

  return { ok: false };
};

const coerceDateString = (
  trimmed: string,
  originalText: string,
): CoerceClipboardValueResult => {
  const parsed = new Date(trimmed);
  if (isValidDate(parsed)) {
    return { ok: true, value: originalText };
  }

  return { ok: false };
};

const coerceObject = (
  value: CellValue,
  trimmed: string,
): CoerceClipboardValueResult => {
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    return { ok: true, value };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object") {
      return { ok: true, value: parsed };
    }
  } catch {
    return { ok: false };
  }

  return { ok: false };
};

const isValidDate = (value: Date): boolean => Number.isFinite(value.getTime());
