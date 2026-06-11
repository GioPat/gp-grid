import { describe, expect, it } from "vitest";
import {
  combineFlingVelocities,
  computeAdaptiveVelocityCap,
  computeReleaseVelocity,
  isFlingDone,
  pruneSamples,
  stepFling,
  updateRenderIntervalEma,
  MAX_FLICK_VELOCITY,
  MAX_FLING_VELOCITY,
  MAX_FRAME_DT_MS,
  MAX_RENDER_INTERVAL_SAMPLE_MS,
  MIN_FLING_VELOCITY,
  RENDER_STALENESS_BUDGET_PX,
  STOP_FLING_VELOCITY,
  VELOCITY_WINDOW_MS,
  type VelocitySample,
} from "../src/utils/touch-scroll-physics";

describe("touch-scroll-physics", () => {
  describe("computeReleaseVelocity", () => {
    it("returns 0 with fewer than 2 samples", () => {
      expect(computeReleaseVelocity([])).toBe(0);
      expect(computeReleaseVelocity([{ time: 0, position: 0 }])).toBe(0);
    });

    it("returns 0 when samples share the same timestamp", () => {
      const samples: VelocitySample[] = [
        { time: 100, position: 0 },
        { time: 100, position: 50 },
      ];
      expect(computeReleaseVelocity(samples)).toBe(0);
    });

    it("derives velocity with correct sign and magnitude from a swipe", () => {
      // 40 logical px in 100 ms → 0.4 px/ms downward (positive)
      const down: VelocitySample[] = [
        { time: 0, position: 0 },
        { time: 50, position: 20 },
        { time: 100, position: 40 },
      ];
      expect(computeReleaseVelocity(down)).toBeCloseTo(0.4);

      const up = down.map((s) => ({ time: s.time, position: -s.position }));
      expect(computeReleaseVelocity(up)).toBeCloseTo(-0.4);
    });

    it("clamps a single flick to MAX_FLICK_VELOCITY in both directions", () => {
      const fast: VelocitySample[] = [
        { time: 0, position: 0 },
        { time: 10, position: 1000 },
      ];
      expect(computeReleaseVelocity(fast)).toBe(MAX_FLICK_VELOCITY);
      const fastUp: VelocitySample[] = [
        { time: 0, position: 0 },
        { time: 10, position: -1000 },
      ];
      expect(computeReleaseVelocity(fastUp)).toBe(-MAX_FLICK_VELOCITY);
    });
  });

  describe("pruneSamples", () => {
    it("drops samples older than the velocity window", () => {
      const samples: VelocitySample[] = [
        { time: 0, position: 0 },
        { time: 50, position: 10 },
        { time: 200, position: 20 },
      ];
      const pruned = pruneSamples(samples, 200);
      expect(pruned).toEqual([{ time: 200, position: 20 }]);
    });

    it("makes a fast direction reversal fling in the new direction", () => {
      // Finger scrolls down for 300ms, then sharply reverses upward.
      const samples: VelocitySample[] = [
        { time: 0, position: 0 },
        { time: 100, position: 200 },
        { time: 200, position: 400 },
        { time: 320, position: 380 },
        { time: 360, position: 330 },
        { time: 400, position: 280 },
      ];
      const recent = pruneSamples(samples, 400);
      // Only the reversal survives the window → negative velocity.
      expect(recent.every((s) => 400 - s.time <= VELOCITY_WINDOW_MS)).toBe(true);
      expect(computeReleaseVelocity(recent)).toBeLessThan(0);
    });
  });

  describe("combineFlingVelocities", () => {
    it("stacks same-direction flicks and plateaus at MAX_FLING_VELOCITY", () => {
      expect(combineFlingVelocities(0.5, 0.3)).toBeCloseTo(0.8);
      expect(combineFlingVelocities(2, 2)).toBe(MAX_FLING_VELOCITY);
      expect(combineFlingVelocities(-2, -2)).toBe(-MAX_FLING_VELOCITY);
      // The plateau gives flicking headroom over a single flick.
      expect(MAX_FLING_VELOCITY).toBeGreaterThan(MAX_FLICK_VELOCITY);
    });

    it("discards carried velocity on direction reversal", () => {
      expect(combineFlingVelocities(0.5, -0.4)).toBe(0.5);
      expect(combineFlingVelocities(-0.3, 0.5)).toBe(-0.3);
    });

    it("ignores zero carried velocity", () => {
      expect(combineFlingVelocities(0.5, 0)).toBe(0.5);
      expect(combineFlingVelocities(0, 1)).toBe(0);
    });
  });

  describe("updateRenderIntervalEma", () => {
    it("starts at the first sample", () => {
      expect(updateRenderIntervalEma(null, 200)).toBe(200);
    });

    it("degrades fast and recovers slowly", () => {
      const degraded = updateRenderIntervalEma(100, 500) as number;
      expect(degraded).toBe(300); // alpha 0.5 upward
      const recovered = updateRenderIntervalEma(500, 100) as number;
      expect(recovered).toBe(440); // alpha 0.15 downward
    });

    it("ignores idle gaps", () => {
      expect(
        updateRenderIntervalEma(200, MAX_RENDER_INTERVAL_SAMPLE_MS + 1),
      ).toBe(200);
      expect(
        updateRenderIntervalEma(null, MAX_RENDER_INTERVAL_SAMPLE_MS + 1),
      ).toBeNull();
    });
  });

  describe("computeAdaptiveVelocityCap", () => {
    it("allows the full cap with no measurements or a fast renderer", () => {
      expect(computeAdaptiveVelocityCap(null)).toBe(MAX_FLING_VELOCITY);
      expect(computeAdaptiveVelocityCap(50)).toBe(MAX_FLING_VELOCITY);
    });

    it("caps speed by the render staleness budget on slow renderers", () => {
      expect(computeAdaptiveVelocityCap(600)).toBeCloseTo(
        RENDER_STALENESS_BUDGET_PX / 600,
      );
    });

    it("never drops below the minimum fling velocity", () => {
      expect(computeAdaptiveVelocityCap(100000)).toBe(MIN_FLING_VELOCITY);
    });
  });

  describe("stepFling", () => {
    it("integrates position and decays velocity monotonically until done", () => {
      let state = { position: 0, velocity: 2 };
      let previousVelocity = state.velocity;
      let frames = 0;
      while (!isFlingDone(state.velocity)) {
        state = stepFling(state, 16);
        expect(Math.abs(state.velocity)).toBeLessThan(Math.abs(previousVelocity));
        previousVelocity = state.velocity;
        frames++;
        expect(frames).toBeLessThan(1000); // must terminate
      }
      expect(state.position).toBeGreaterThan(0);
      expect(Math.abs(state.velocity)).toBeLessThan(STOP_FLING_VELOCITY);
    });

    it("clamps position integration but decays velocity in wall-clock time", () => {
      const normal = stepFling({ position: 0, velocity: 1 }, MAX_FRAME_DT_MS);
      const stalled = stepFling({ position: 0, velocity: 1 }, 5000);
      // A stalled frame must not teleport the content...
      expect(stalled.position).toBe(normal.position);
      // ...but 5 seconds of wall time must still kill the fling — otherwise
      // a device rendering at a few fps stretches flings out indefinitely.
      expect(isFlingDone(stalled.velocity)).toBe(true);
      expect(Math.abs(stalled.velocity)).toBeLessThan(Math.abs(normal.velocity));
    });
  });
});
