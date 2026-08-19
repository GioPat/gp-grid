// Runtime User Timing spans around the gp-grid core pipeline seams.
//
// Playground-only: nothing in this file ships in @gp-grid/*. It is installed
// by ./hooks.ts when the page is opened with `?profiling=1`, and it works by
// wrapping methods on a live GridCore instance (and two of its internal
// collaborators) so the pipeline stays untouched when profiling is off.
//
// Spans (all named `gp-grid:<span>`, visible in the DevTools "Timings" track):
//   setViewport — the hot scroll path (viewport update → rows → slots → emit)
//   syncSlots   — the virtualization compute inside setViewport
//   dispatch    — InstructionBatcher.notify/flush: the core → wrapper hand-off,
//                 i.e. the wrapper's synchronous instruction apply (reducer
//                 dispatch); flush covers batched ops (sort/filter results,
//                 column layout changes), notify the unbatched scroll path
//   setSort / setFilter — synchronous part only (both are async)
//
// If a core refactor renames one of these seams, install throws so the harness
// fails loudly instead of silently reporting zero spans.

import type { GridCore } from "@gp-grid/react";

const SPAN_PREFIX = "gp-grid:";
const installedCores = new WeakSet<object>();

type Method = (this: unknown, ...args: unknown[]) => unknown;

const wrapMethod = (target: object, key: string, span: string): void => {
  const record = target as Record<string, unknown>;
  const original = record[key];
  if (typeof original !== "function") {
    throw new Error(
      `profiling: cannot wrap "${span}" — "${key}" is not a function on the target`,
    );
  }
  const method = original as Method;
  record[key] = function measured(this: unknown, ...args: unknown[]): unknown {
    const start = performance.now();
    const result = method.apply(this, args);
    performance.measure(SPAN_PREFIX + span, { start, end: performance.now() });
    return result;
  };
};

// GridCore keeps its collaborators in TS-private fields; they are plain
// properties at runtime. Read them defensively so a rename is reported.
const readInternal = (core: GridCore<unknown>, field: string): object => {
  const value = (core as unknown as Record<string, unknown>)[field];
  if (typeof value !== "object" || value === null) {
    throw new Error(
      `profiling: GridCore.${field} not found — core internals changed, update span-wrappers.ts`,
    );
  }
  return value;
};

/** Install the spans on one core instance. Idempotent per instance. */
export const installCoreSpans = (core: GridCore<unknown>): void => {
  if (installedCores.has(core)) return;
  installedCores.add(core);

  wrapMethod(core, "setViewport", "setViewport");
  wrapMethod(core, "setSort", "setSort");
  wrapMethod(core, "setFilter", "setFilter");
  wrapMethod(readInternal(core, "slotPool"), "syncSlots", "syncSlots");
  const batcher = readInternal(core, "batcher");
  wrapMethod(batcher, "notify", "dispatch");
  wrapMethod(batcher, "flush", "dispatch");
};

export const hasCoreSpans = (core: GridCore<unknown>): boolean =>
  installedCores.has(core);
