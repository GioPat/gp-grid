// packages/core/src/row-grouping/keys.ts
// Typed dimension keys and the group id encoding.

import type { CellValue, RowId } from "../types";

export const TAG_NULL = 0;
export const TAG_STRING = 1;
export const TAG_NUMBER = 2;
export const TAG_BOOLEAN = 3;
export const TAG_DATE = 4;
export const TAG_OBJECT = -1;

/** Scalar part of a key; a date is keyed by its timestamp. */
export type GroupKey = string | number | boolean | null;

/** One level of a group path: the dimension id, the key's tag and the key. */
export type GroupPathStep = readonly [dimensionId: string, tag: number, key: GroupKey];

export const GROUP_ID_PREFIX = "gp-group:";
export const TOTAL_ROW_ID = "gp-total";

const TAG_NAMES = ["z", "s", "n", "b", "d"] as const;

/** Tag of a raw value or a `toKey` result; `TAG_OBJECT` needs a `toKey`. */
export const keyTagOf = (value: unknown): number => {
  if (value === null || value === undefined) return TAG_NULL;
  switch (typeof value) {
    case "string":
      return TAG_STRING;
    case "number":
      return TAG_NUMBER;
    case "boolean":
      return TAG_BOOLEAN;
  }
  return value instanceof Date ? TAG_DATE : TAG_OBJECT;
};

/** Normalized key of a value of tag `tag`. */
export const keyOf = (value: unknown, tag: number): GroupKey => {
  if (tag === TAG_NULL) return null;
  if (tag === TAG_DATE) return (value as Date).getTime();
  // `+ 0` folds -0 into 0.
  if (tag === TAG_NUMBER) return (value as number) + 0;
  return value as string | boolean;
};

/** The value a group row exposes for its key. */
export const keyValue = (tag: number, key: GroupKey): CellValue =>
  tag === TAG_DATE ? new Date(key as number) : key;

const jsonKey = (key: GroupKey): GroupKey =>
  typeof key === "number" && !Number.isFinite(key) ? String(key) : key;

const stepJson = (dimensionId: string, tag: number, key: GroupKey): string =>
  JSON.stringify([dimensionId, TAG_NAMES[tag], jsonKey(key)]);

export const encodeGroupId = (path: readonly GroupPathStep[]): string =>
  `${GROUP_ID_PREFIX}[${path.map((step) => stepJson(...step)).join(",")}]`;

/** Id of a child group from its parent's id, `null` under the root. */
export const childGroupId = (
  parentId: string | null,
  dimensionId: string,
  tag: number,
  key: GroupKey,
): string => {
  const step = stepJson(dimensionId, tag, key);
  return parentId === null ? `${GROUP_ID_PREFIX}[${step}]` : `${parentId.slice(0, -1)},${step}]`;
};

const keyMatchesTag = (tag: number, key: unknown): boolean => {
  if (tag === TAG_NULL) return key === null;
  if (tag === TAG_STRING) return typeof key === "string";
  if (tag === TAG_BOOLEAN) return typeof key === "boolean";
  return typeof key === "number";
};

const decodeStep = (step: unknown): GroupPathStep | undefined => {
  if (!Array.isArray(step) || step.length !== 3) return undefined;
  const [dimensionId, name, raw] = step as unknown[];
  const tag = TAG_NAMES.indexOf(name as (typeof TAG_NAMES)[number]);
  const numeric = tag === TAG_NUMBER || tag === TAG_DATE;
  const key = numeric && typeof raw === "string" ? Number(raw) : raw;
  if (typeof dimensionId !== "string" || tag < 0 || !keyMatchesTag(tag, key)) return undefined;
  return [dimensionId, tag, key as GroupKey];
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** The path of a group id, or `undefined` when `id` is not one. */
export const decodeGroupId = (id: RowId): GroupPathStep[] | undefined => {
  if (typeof id !== "string" || !id.startsWith(GROUP_ID_PREFIX)) return undefined;
  const parsed = parseJson(id.slice(GROUP_ID_PREFIX.length));
  if (!Array.isArray(parsed)) return undefined;
  const path: GroupPathStep[] = [];
  for (const step of parsed) {
    const decoded = decodeStep(step);
    if (decoded === undefined) return undefined;
    path.push(decoded);
  }
  return path;
};
