// packages/core/src/indexed-data-store/field-helpers.ts

import type { CellValue, Row } from "../types";

/**
 * Default field value accessor supporting dot notation.
 * @example
 * getFieldValue({ user: { name: "John" } }, "user.name") // "John"
 */
export function getFieldValue<TData extends Row>(
  row: TData,
  field: string
): CellValue {
  const parts = field.split(".");
  let value: unknown = row;

  for (const part of parts) {
    if (value == null || typeof value !== "object") {
      return null;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return (value ?? null) as CellValue;
}

/**
 * Set field value supporting dot notation.
 * Creates nested objects if they don't exist.
 * @example
 * const obj = { user: {} };
 * setFieldValue(obj, "user.name", "John");
 * // obj is now { user: { name: "John" } }
 */
export function setFieldValue<TData extends Row>(
  row: TData,
  field: string,
  value: CellValue
): void {
  const parts = field.split(".");
  let current: unknown = row;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (current == null || typeof current !== "object") {
      return;
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (current != null && typeof current === "object") {
    (current as Record<string, unknown>)[parts[parts.length - 1]!] = value;
  }
}
