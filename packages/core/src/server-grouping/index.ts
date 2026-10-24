// packages/core/src/server-grouping/index.ts
// The server grouping engine's public entry; only `src/index.ts` imports it.

export { createServerGroupingSource } from "./create-server-grouping-source";
export type { ServerGroupingConfig, ServerGroupingSource } from "./create-server-grouping-source";
