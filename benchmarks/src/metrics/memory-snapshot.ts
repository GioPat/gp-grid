// Memory measurement utilities using Chrome DevTools Protocol

import type { CDPSession } from "@playwright/test";

export interface HeapInfo {
  usedHeapSize: number;
  totalHeapSize: number;
}

export async function getHeapSize(client: CDPSession): Promise<number> {
  const result = await client.send("Runtime.getHeapUsage");
  return result.usedSize;
}

export async function getHeapInfo(client: CDPSession): Promise<HeapInfo> {
  const result = await client.send("Runtime.getHeapUsage");
  return {
    usedHeapSize: result.usedSize,
    totalHeapSize: result.totalSize,
  };
}

export async function forceGC(client: CDPSession): Promise<void> {
  await client.send("HeapProfiler.enable");
  await client.send("HeapProfiler.collectGarbage");
  // Give GC time to complete
  await new Promise((resolve) => setTimeout(resolve, 100));
}

export function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

// Memory tracker for continuous monitoring
export class MemoryTracker {
  private client: CDPSession;
  private samples: number[] = [];
  private intervalId: NodeJS.Timeout | null = null;

  constructor(client: CDPSession) {
    this.client = client;
  }

  async startTracking(intervalMs = 100): Promise<void> {
    this.samples = [];

    const collectSample = async () => {
      try {
        const size = await getHeapSize(this.client);
        this.samples.push(size);
      } catch {
        // Ignore errors during sampling
      }
    };

    // Collect initial sample
    await collectSample();

    // Start interval sampling
    this.intervalId = setInterval(collectSample, intervalMs);
  }

  stopTracking(): {
    samples: number[];
    peak: number;
    average: number;
    min: number;
  } {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.samples.length === 0) {
      return { samples: [], peak: 0, average: 0, min: 0 };
    }

    const peak = Math.max(...this.samples);
    const min = Math.min(...this.samples);
    const average =
      this.samples.reduce((a, b) => a + b, 0) / this.samples.length;

    return {
      samples: this.samples,
      peak,
      average,
      min,
    };
  }
}

// Measure memory impact of an operation
export async function measureMemoryImpact(
  client: CDPSession,
  operation: () => Promise<void>
): Promise<{ before: number; after: number; delta: number }> {
  await forceGC(client);
  const before = await getHeapSize(client);

  await operation();

  await forceGC(client);
  const after = await getHeapSize(client);

  return {
    before,
    after,
    delta: after - before,
  };
}
