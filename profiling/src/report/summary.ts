// Turn a parsed profile (+ measures) into the numbers the report prints:
// per-bucket self time and the hottest functions by self time.

import {
  ACTIVE_BUCKETS,
  BUCKET_LABELS,
  BUCKET_ORDER,
  FUNCTION_BUCKETS,
  type Bucket,
  bucketFor,
} from "./buckets";
import { frameLabel, type ProfileAnalysis } from "./cpuprofile";
import type { MeasureStats } from "./measures";
import type { FrameResolver, ResolvedFrame } from "./sourcemaps";

export interface BucketRow {
  bucket: Bucket;
  label: string;
  selfMs: number;
  percentOfActive: number;
}

export interface FunctionRow {
  name: string;
  bucket: Bucket;
  file: string;
  line: number | null;
  selfMs: number;
  totalMs: number;
  percentOfActive: number;
}

export interface ArtifactSummary {
  name: string;
  capture: "cpuprofile" | "trace";
  durationMs: number;
  /** JS time excluding (idle). */
  activeMs: number;
  buckets: BucketRow[];
  topFunctions: FunctionRow[];
  measures: MeasureStats[];
}

const TOP_FUNCTIONS = 25;
const toMs = (micros: number): number => micros / 1000;

interface FunctionAccumulator {
  frame: ResolvedFrame;
  bucket: Bucket;
  selfMicros: number;
  totalMicros: number;
}

const functionKey = (frame: ResolvedFrame): string =>
  `${frame.name}@${frame.file}:${frame.line ?? "?"}`;

// Resolve every node once; frames are keyed by original location so the same
// function reached through different callers collapses into one row.
const resolveNodes = (
  analysis: ProfileAnalysis,
  resolver: FrameResolver,
): Map<number, { key: string; frame: ResolvedFrame; bucket: Bucket | null }> => {
  const resolved = new Map<number, { key: string; frame: ResolvedFrame; bucket: Bucket | null }>();
  for (const { node } of analysis.nodes.values()) {
    const frame = resolver.resolve(node);
    const label = frame.name.length > 0 ? frame.name : frameLabel(node);
    const withLabel: ResolvedFrame = { ...frame, name: label };
    resolved.set(node.id, {
      key: functionKey(withLabel),
      frame: withLabel,
      bucket: bucketFor(node.callFrame.functionName, frame.file),
    });
  }
  return resolved;
};

const accumulateFunctions = (
  analysis: ProfileAnalysis,
  resolved: ReturnType<typeof resolveNodes>,
): Map<string, FunctionAccumulator> => {
  const functions = new Map<string, FunctionAccumulator>();
  const ensure = (id: number): FunctionAccumulator | null => {
    const info = resolved.get(id);
    if (info === null || info === undefined || info.bucket === null) return null;
    let acc = functions.get(info.key);
    if (acc === undefined) {
      acc = { frame: info.frame, bucket: info.bucket, selfMicros: 0, totalMicros: 0 };
      functions.set(info.key, acc);
    }
    return acc;
  };
  for (const entry of analysis.nodes.values()) {
    if (entry.selfMicros <= 0) continue;
    const self = ensure(entry.node.id);
    if (self !== null) self.selfMicros += entry.selfMicros;
    // Total: credit each distinct function on the stack once (recursion-safe).
    const seen = new Set<string>();
    let current: number | undefined = entry.node.id;
    while (current !== undefined) {
      const info = resolved.get(current);
      if (info !== undefined && seen.has(info.key) === false) {
        seen.add(info.key);
        const acc = ensure(current);
        if (acc !== null) acc.totalMicros += entry.selfMicros;
      }
      current = analysis.parents.get(current);
    }
  }
  return functions;
};

const bucketRows = (functions: Map<string, FunctionAccumulator>, activeMicros: number): BucketRow[] => {
  const totals = new Map<Bucket, number>();
  for (const acc of functions.values()) {
    totals.set(acc.bucket, (totals.get(acc.bucket) ?? 0) + acc.selfMicros);
  }
  return BUCKET_ORDER.map((bucket) => {
    const selfMicros = totals.get(bucket) ?? 0;
    return {
      bucket,
      label: BUCKET_LABELS[bucket],
      selfMs: toMs(selfMicros),
      percentOfActive: activeMicros > 0 ? (selfMicros / activeMicros) * 100 : 0,
    };
  });
};

const topFunctionRows = (functions: Map<string, FunctionAccumulator>, activeMicros: number): FunctionRow[] =>
  [...functions.values()]
    .filter((acc) => FUNCTION_BUCKETS.includes(acc.bucket))
    .sort((a, b) => b.selfMicros - a.selfMicros)
    .slice(0, TOP_FUNCTIONS)
    .map((acc) => ({
      name: acc.frame.name,
      bucket: acc.bucket,
      file: acc.frame.file,
      line: acc.frame.line,
      selfMs: toMs(acc.selfMicros),
      totalMs: toMs(acc.totalMicros),
      percentOfActive: activeMicros > 0 ? (acc.selfMicros / activeMicros) * 100 : 0,
    }));

export const summarizeProfile = (
  name: string,
  analysis: ProfileAnalysis,
  resolver: FrameResolver,
  measures: MeasureStats[],
): ArtifactSummary => {
  const resolved = resolveNodes(analysis, resolver);
  const functions = accumulateFunctions(analysis, resolved);
  let activeMicros = 0;
  for (const acc of functions.values()) {
    if (ACTIVE_BUCKETS.includes(acc.bucket)) activeMicros += acc.selfMicros;
  }
  return {
    name,
    capture: "cpuprofile",
    durationMs: toMs(analysis.durationMicros),
    activeMs: toMs(activeMicros),
    buckets: bucketRows(functions, activeMicros),
    topFunctions: topFunctionRows(functions, activeMicros),
    measures,
  };
};

/** Trace captures only carry measures; no sampled breakdown. */
export const summarizeMeasuresOnly = (name: string, measures: MeasureStats[]): ArtifactSummary => ({
  name,
  capture: "trace",
  durationMs: 0,
  activeMs: 0,
  buckets: [],
  topFunctions: [],
  measures,
});
