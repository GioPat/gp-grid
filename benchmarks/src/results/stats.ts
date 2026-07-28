import type { MetricStats } from "../data/types";

type NumericMetricMap = Record<string, number>;

const toNumericMetricMap = <T extends object>(sample: T): NumericMetricMap => {
  const entries = Object.entries(sample).filter((entry): entry is [string, number] => {
    return typeof entry[1] === "number" && Number.isFinite(entry[1]);
  });

  return Object.fromEntries(entries);
};

// Aggregating samples (median of an even count, means) reintroduces float
// noise like 44.349999999999994; cap every published stat at two decimals.
const round2 = (value: number): number => {
  return Math.round(value * 100) / 100;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }

  const left = sorted[middle - 1] ?? 0;
  const right = sorted[middle] ?? 0;
  return (left + right) / 2;
};

export const calculateMetricStats = <T extends object>(samples: T[]): MetricStats => {
  const metricNames = new Set<string>();

  for (const sample of samples) {
    for (const metricName of Object.keys(toNumericMetricMap(sample))) {
      metricNames.add(metricName);
    }
  }

  const stats: MetricStats = {};

  for (const metricName of metricNames) {
    const values = samples
      .map((sample) => toNumericMetricMap(sample)[metricName])
      .filter((value): value is number => value !== undefined);

    if (values.length > 0) {
      const sum = values.reduce((total, value) => total + value, 0);
      stats[metricName] = {
        min: round2(Math.min(...values)),
        max: round2(Math.max(...values)),
        median: round2(median(values)),
        mean: round2(sum / values.length),
      };
    }
  }

  return stats;
};

export const calculateMedianMetrics = <T extends object>(samples: T[]): T => {
  const stats = calculateMetricStats(samples);
  const medianEntries = Object.entries(stats).map(([metricName, metricStats]) => {
    return [metricName, metricStats.median] as const;
  });

  return Object.fromEntries(medianEntries) as T;
};
