// packages/core/src/column-groups/index.ts

export {
  buildGroupIndex,
  type ColumnGroupIndex,
  type ColumnSchemaFault,
  type GroupIndexLeaf,
  type GroupIndexNode,
  type GroupIndexResult,
} from "./group-index";
export {
  EMPTY_HEADER_RUNS,
  buildHeaderRuns,
  createHeaderRunsCache,
  leafDepthOf,
  type HeaderRunSet,
  type HeaderRunsCache,
  type HeaderRunsResult,
} from "./header-runs";
export { EMPTY_HEADER_FRAGMENTS, selectHeaderFragments } from "./header-fragments";
