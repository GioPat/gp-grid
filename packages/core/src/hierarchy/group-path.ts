// packages/core/src/hierarchy/group-path.ts
// Group ids over named-tag path steps, the form a service and an application see.

import type { GroupPathStep, RowId } from "../types";
import { TAG_NAMES, decodeTaggedId, encodeTaggedId, type TaggedStep } from "./keys";

const toTagged = ([dimensionId, name, key]: GroupPathStep): TaggedStep => [
  dimensionId,
  TAG_NAMES.indexOf(name),
  key,
];

const toNamed = ([dimensionId, tag, key]: TaggedStep): GroupPathStep => [dimensionId, TAG_NAMES[tag]!, key];

/** The id of the group at `path`; `[]` is the root. */
export const encodeGroupId = (path: readonly GroupPathStep[]): string => encodeTaggedId(path.map(toTagged));

/** The path of a group id, or `undefined` when `id` is not one. */
export const decodeGroupId = (id: RowId): GroupPathStep[] | undefined => decodeTaggedId(id)?.map(toNamed);
