import type { Page } from "@playwright/test";
import type { ScrollMetrics } from "../data/types";

interface BrowserPerformanceMetrics {
  largestContentfulPaint: number;
  totalBlockingTime: number;
}

interface BrowserFpsMetrics {
  avgFPS: number;
  minFPS: number;
  maxFPS: number;
  frameDropCount: number;
  p05FPS: number;
  p95FrameTimeMs: number;
  totalFrames: number;
}

export const installPerformanceObservers = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    type BenchmarkWindow = Window & {
      __benchmarkPerformanceMetrics?: {
        largestContentfulPaint: number;
        totalBlockingTime: number;
      };
    };

    const benchmarkWindow = window as BenchmarkWindow;
    benchmarkWindow.__benchmarkPerformanceMetrics = {
      largestContentfulPaint: 0,
      totalBlockingTime: 0,
    };

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const lastEntry = list.getEntries().at(-1);
        if (lastEntry) {
          benchmarkWindow.__benchmarkPerformanceMetrics!.largestContentfulPaint =
            lastEntry.startTime;
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // LCP is browser-dependent; keep the default zero value when unsupported.
    }

    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            benchmarkWindow.__benchmarkPerformanceMetrics!.totalBlockingTime +=
              entry.duration - 50;
          }
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch {
      // Long task entries are not available in every browser context.
    }
  });
};

export const getPerformanceMetrics = async (
  page: Page,
): Promise<BrowserPerformanceMetrics> => {
  return page.evaluate(() => {
    type BenchmarkWindow = Window & {
      __benchmarkPerformanceMetrics?: {
        largestContentfulPaint: number;
        totalBlockingTime: number;
      };
    };

    const metrics = (window as BenchmarkWindow).__benchmarkPerformanceMetrics;
    return {
      largestContentfulPaint: Math.round(metrics?.largestContentfulPaint ?? 0),
      totalBlockingTime: Math.round(metrics?.totalBlockingTime ?? 0),
    };
  });
};

const percentile = (values: number[], percentileValue: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * percentileValue)),
  );

  return sorted[index] ?? 0;
};

export const startFPSSampling = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    type BenchmarkWindow = Window & {
      __benchmarkFpsSampler?: {
        running: boolean;
        lastTime: number;
        frameDurations: number[];
        requestId: number;
      };
    };

    const benchmarkWindow = window as BenchmarkWindow;
    const sampler = {
      running: true,
      lastTime: performance.now(),
      frameDurations: [] as number[],
      requestId: 0,
    };

    const frame = (now: number): void => {
      const delta = now - sampler.lastTime;
      if (delta > 0) {
        sampler.frameDurations.push(delta);
      }
      sampler.lastTime = now;

      if (sampler.running) {
        sampler.requestId = requestAnimationFrame(frame);
      }
    };

    sampler.requestId = requestAnimationFrame(frame);
    benchmarkWindow.__benchmarkFpsSampler = sampler;
  });
};

export const stopFPSSampling = async (page: Page): Promise<BrowserFpsMetrics> => {
  const frameDurations = await page.evaluate(() => {
    type BenchmarkWindow = Window & {
      __benchmarkFpsSampler?: {
        running: boolean;
        frameDurations: number[];
        requestId: number;
      };
    };

    const sampler = (window as BenchmarkWindow).__benchmarkFpsSampler;
    if (sampler === undefined) {
      return [] as number[];
    }

    sampler.running = false;
    cancelAnimationFrame(sampler.requestId);
    return sampler.frameDurations;
  });

  const positiveDurations = frameDurations.filter((duration) => duration > 0);
  const fpsSamples = positiveDurations.map((duration) => 1000 / duration);
  const totalFrames = fpsSamples.length;

  // Average FPS must be frames / total-elapsed-time, NOT the mean of the
  // per-frame instantaneous rates. The latter is biased upward because short
  // frames each contribute one large sample while a single long (janky) frame
  // contributes only one small sample.
  const totalDurationMs = positiveDurations.reduce(
    (total, value) => total + value,
    0,
  );
  const avgFPS = totalDurationMs > 0 ? (1000 * totalFrames) / totalDurationMs : 0;

  return {
    avgFPS: Math.round(avgFPS * 10) / 10,
    minFPS: Math.round(percentile(fpsSamples, 0) * 10) / 10,
    maxFPS: Math.round(percentile(fpsSamples, 0.999) * 10) / 10,
    frameDropCount: frameDurations.filter((duration) => duration > 25).length,
    p05FPS: Math.round(percentile(fpsSamples, 0.05) * 10) / 10,
    p95FrameTimeMs: Math.round(percentile(frameDurations, 0.95) * 10) / 10,
    totalFrames,
  };
};

export const buildScrollMetrics = (
  fpsMetrics: BrowserFpsMetrics,
  scrollDurationMs: number,
  actualScrollDeltaPx: number,
): ScrollMetrics => {
  const scrollPxPerSecond =
    scrollDurationMs > 0
      ? Math.round((Math.abs(actualScrollDeltaPx) / scrollDurationMs) * 1000)
      : 0;

  return {
    ...fpsMetrics,
    scrollDurationMs,
    actualScrollDeltaPx: Math.round(actualScrollDeltaPx),
    scrollPxPerSecond,
  };
};
