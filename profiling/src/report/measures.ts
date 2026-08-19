// Aggregate User Timing measures (gp-grid:* spans, react:commit, …) per name.

import type { UserTimingMeasure } from "../capture";

export interface MeasureStats {
  name: string;
  count: number;
  totalMs: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
}

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, index)] ?? 0;
};

export const summarizeMeasures = (measures: UserTimingMeasure[]): MeasureStats[] => {
  const byName = new Map<string, number[]>();
  for (const measure of measures) {
    const durations = byName.get(measure.name) ?? [];
    durations.push(measure.duration);
    byName.set(measure.name, durations);
  }
  const stats: MeasureStats[] = [];
  for (const [name, durations] of byName) {
    const sorted = [...durations].sort((a, b) => a - b);
    const totalMs = sorted.reduce((sum, value) => sum + value, 0);
    stats.push({
      name,
      count: sorted.length,
      totalMs,
      meanMs: totalMs / sorted.length,
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted[sorted.length - 1] ?? 0,
    });
  }
  return stats.sort((a, b) => b.totalMs - a.totalMs);
};
