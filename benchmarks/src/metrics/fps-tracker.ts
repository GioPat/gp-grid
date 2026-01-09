// FPS tracking using Chrome DevTools Protocol

import type { CDPSession } from "@playwright/test";
import type { ScrollMetrics } from "../data/types";

interface FrameEvent {
  timestamp: number;
  duration: number;
}

export class FPSTracker {
  private client: CDPSession;
  private frames: FrameEvent[] = [];
  private startTime = 0;
  private traceData: unknown[] = [];

  constructor(client: CDPSession) {
    this.client = client;
  }

  async start(): Promise<void> {
    this.frames = [];
    this.traceData = [];
    this.startTime = Date.now();

    // Enable performance domain
    await this.client.send("Performance.enable");

    // Start tracing for frame events
    await this.client.send("Tracing.start", {
      categories:
        "disabled-by-default-devtools.timeline.frame,devtools.timeline",
      options: "sampling-frequency=10000",
    });

    // Listen for trace data
    this.client.on("Tracing.dataCollected", (data) => {
      if (data.value) {
        this.traceData.push(...data.value);
      }
    });
  }

  async stop(): Promise<ScrollMetrics> {
    // Stop tracing and wait for data
    await this.client.send("Tracing.end");

    // Wait a bit for trace data to be collected
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Process trace data to extract frame timings
    this.processTraceData();

    return this.calculateMetrics();
  }

  private processTraceData(): void {
    // Look for frame events in trace data
    for (const event of this.traceData) {
      const e = event as {
        name?: string;
        ts?: number;
        dur?: number;
        cat?: string;
      };
      if (
        e.name === "DrawFrame" ||
        e.name === "BeginFrame" ||
        e.name === "Commit"
      ) {
        this.frames.push({
          timestamp: (e.ts ?? 0) / 1000, // Convert microseconds to milliseconds
          duration: (e.dur ?? 0) / 1000,
        });
      }
    }

    // Sort frames by timestamp
    this.frames.sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateMetrics(): ScrollMetrics {
    if (this.frames.length < 2) {
      return {
        avgFPS: 0,
        minFPS: 0,
        maxFPS: 0,
        frameDropCount: 0,
        percentile95FPS: 0,
        scrollLatencyMs: Date.now() - this.startTime,
        totalFrames: this.frames.length,
      };
    }

    const fpsSamples: number[] = [];
    let droppedFrames = 0;

    for (let i = 1; i < this.frames.length; i++) {
      const delta = this.frames[i].timestamp - this.frames[i - 1].timestamp;
      if (delta > 0) {
        const fps = 1000 / delta;
        fpsSamples.push(fps);

        // Frame drop = delta > 25ms (below 40 FPS)
        if (delta > 25) {
          droppedFrames++;
        }
      }
    }

    if (fpsSamples.length === 0) {
      return {
        avgFPS: 60,
        minFPS: 60,
        maxFPS: 60,
        frameDropCount: 0,
        percentile95FPS: 60,
        scrollLatencyMs: Date.now() - this.startTime,
        totalFrames: this.frames.length,
      };
    }

    // Sort for percentile calculation
    fpsSamples.sort((a, b) => a - b);

    const sum = fpsSamples.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(fpsSamples.length * 0.05);

    return {
      avgFPS: Math.round((sum / fpsSamples.length) * 10) / 10,
      minFPS: Math.round(fpsSamples[0] * 10) / 10,
      maxFPS: Math.round(fpsSamples[fpsSamples.length - 1] * 10) / 10,
      frameDropCount: droppedFrames,
      percentile95FPS: Math.round(fpsSamples[p95Index] * 10) / 10,
      scrollLatencyMs: Date.now() - this.startTime,
      totalFrames: this.frames.length,
    };
  }
}

// Alternative simpler FPS measurement using requestAnimationFrame
export async function measureFPSSimple(
  page: import("@playwright/test").Page,
  durationMs: number
): Promise<{ avgFPS: number; samples: number[] }> {
  const result = await page.evaluate(async (duration) => {
    return new Promise<{ avgFPS: number; samples: number[] }>((resolve) => {
      const samples: number[] = [];
      let lastTime = performance.now();
      let frameCount = 0;
      const startTime = lastTime;

      function frame() {
        const now = performance.now();
        const delta = now - lastTime;

        if (delta > 0) {
          samples.push(1000 / delta);
        }

        lastTime = now;
        frameCount++;

        if (now - startTime < duration) {
          requestAnimationFrame(frame);
        } else {
          const avgFPS =
            samples.length > 0
              ? samples.reduce((a, b) => a + b, 0) / samples.length
              : 0;
          resolve({ avgFPS, samples });
        }
      }

      requestAnimationFrame(frame);
    });
  }, durationMs);

  return result;
}
