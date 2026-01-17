// packages/core/src/utils/field-accessor.ts

import type { CellValue } from "../types";

/**
 * Get a nested value from an object using dot notation path
 * @param data - The object to read from
 * @param field - Dot-separated path (e.g., "address.city")
 * @returns The value at the path or null if not found
 */
export const getFieldValue = <T>(data: T, field: string): CellValue => {
  const parts = field.split(".");
  let value: unknown = data;

  for (const part of parts) {
    if (value == null || typeof value !== "object") {
      return null;
    }
    value = (value as Record<string, unknown>)[part];
  }

  return (value ?? null) as CellValue;
};

/**
 * Set a nested value in an object using dot notation path
 * Creates intermediate objects if they don't exist
 * @param data - The object to modify
 * @param field - Dot-separated path (e.g., "address.city")
 * @param value - The value to set
 */
export const setFieldValue = (
  data: Record<string, unknown>,
  field: string,
  value: CellValue,
): void => {
  const parts = field.split(".");
  let obj = data;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in obj)) {
      obj[part] = {};
    }
    obj = obj[part] as Record<string, unknown>;
  }

  const lastPart = parts[parts.length - 1]!;
  obj[lastPart] = value;
};
