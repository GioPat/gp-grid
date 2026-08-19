// Parse a V8 .cpuprofile: attribute sampled time to nodes (self), roll it up
// through parents (total), and emit folded stacks for external flamegraph
// tools. Time unit is microseconds throughout.

import type { CpuProfile, CpuProfileNode } from "../capture";

export interface ProfileNodeStats {
  node: CpuProfileNode;
  selfMicros: number;
  totalMicros: number;
}

export interface ProfileAnalysis {
  /** Wall time between first and last sample. */
  durationMicros: number;
  /** Sum of all attributed sample time. */
  sampledMicros: number;
  nodes: Map<number, ProfileNodeStats>;
  parents: Map<number, number>;
  /** Folded stacks: "root;a;b <micros>" per distinct stack. */
  folded: string[];
}

const buildParents = (nodes: CpuProfileNode[]): Map<number, number> => {
  const parents = new Map<number, number>();
  for (const node of nodes) {
    if (node.parent !== undefined) parents.set(node.id, node.parent);
    for (const child of node.children ?? []) parents.set(child, node.id);
  }
  return parents;
};

// timeDeltas[i] is the gap *before* samples[i]; the time a sample "owns" is
// the gap until the next one, which is what DevTools does as well.
const attributeSelfTime = (
  profile: CpuProfile,
  stats: Map<number, ProfileNodeStats>,
): number => {
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  let sampled = 0;
  for (let i = 0; i < samples.length; i++) {
    const owned = deltas[i + 1] ?? 0;
    const entry = stats.get(samples[i]!);
    if (entry === undefined || owned <= 0) continue;
    entry.selfMicros += owned;
    sampled += owned;
  }
  return sampled;
};

const rollUpTotals = (
  stats: Map<number, ProfileNodeStats>,
  parents: Map<number, number>,
): void => {
  for (const entry of stats.values()) {
    let current: number | undefined = entry.node.id;
    while (current !== undefined) {
      const owner = stats.get(current);
      if (owner !== undefined) owner.totalMicros += entry.selfMicros;
      current = parents.get(current);
    }
  }
};

export const frameLabel = (node: CpuProfileNode): string => {
  const name = node.callFrame.functionName;
  return name.length > 0 ? name : "(anonymous)";
};

const stackOf = (
  id: number,
  stats: Map<number, ProfileNodeStats>,
  parents: Map<number, number>,
): string[] => {
  const frames: string[] = [];
  let current: number | undefined = id;
  while (current !== undefined) {
    const entry = stats.get(current);
    if (entry !== undefined) frames.push(frameLabel(entry.node));
    current = parents.get(current);
  }
  return frames.reverse();
};

const foldStacks = (
  stats: Map<number, ProfileNodeStats>,
  parents: Map<number, number>,
): string[] => {
  const lines: string[] = [];
  for (const entry of stats.values()) {
    if (entry.selfMicros <= 0) continue;
    const stack = stackOf(entry.node.id, stats, parents).join(";");
    lines.push(`${stack} ${entry.selfMicros}`);
  }
  return lines;
};

export const analyzeProfile = (profile: CpuProfile): ProfileAnalysis => {
  const stats = new Map<number, ProfileNodeStats>();
  for (const node of profile.nodes) {
    stats.set(node.id, { node, selfMicros: 0, totalMicros: 0 });
  }
  const parents = buildParents(profile.nodes);
  const sampledMicros = attributeSelfTime(profile, stats);
  rollUpTotals(stats, parents);
  return {
    durationMicros: profile.endTime - profile.startTime,
    sampledMicros,
    nodes: stats,
    parents,
    folded: foldStacks(stats, parents),
  };
};
