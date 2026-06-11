// Pure physics helpers for synthetic touch scrolling. No DOM access.
// Positions and velocities are expressed in logical (un-scaled) pixels;
// the adapter converts to DOM scroll space via the scroll ratio.

export interface VelocitySample {
  /** Timestamp in ms (performance.now() or event.timeStamp) */
  time: number;
  /** Logical scroll position at that time */
  position: number;
}

export interface FlingState {
  /** Logical scroll position */
  position: number;
  /** Logical velocity in px/ms */
  velocity: number;
}

/** Samples older than this window are ignored when computing release velocity */
export const VELOCITY_WINDOW_MS = 100;
/** Minimum release velocity (logical px/ms) required to start a fling */
export const MIN_FLING_VELOCITY = 0.25;
/** A fling stops once velocity decays below this (logical px/ms) */
export const STOP_FLING_VELOCITY = 0.01;
/** A single flick's release velocity is clamped to this (logical px/ms) */
export const MAX_FLICK_VELOCITY = 1.15;
/** Stacked flicks plateau at this combined velocity (logical px/ms) */
export const MAX_FLING_VELOCITY = 2.4;
/** Exponential decay time constant for fling deceleration (ms) */
export const FLING_TIME_CONSTANT_MS = 400;
/** Frame delta clamp so a stalled tab does not teleport the scroll position */
export const MAX_FRAME_DT_MS = 64;
/**
 * Fling render throttling may engage only above this velocity (px/ms).
 * Below it — and always while the finger is down — the pipeline renders
 * every frame: a reduced cadence at medium speed reads as freeze-and-jump
 * stutter, not as fast scrolling.
 */
export const RENDER_VELOCITY_THRESHOLD = 0.35;
/** Max time between rendered frames while render-throttled */
export const FAST_FLING_RENDER_INTERVAL_MS = 100;
/**
 * A frame-interval EMA above this means the device cannot sustain a full
 * pipeline run per frame; a fast fling then falls back to the throttled
 * render cadence until it slows below RENDER_VELOCITY_THRESHOLD.
 */
export const HEAVY_FRAME_BUDGET_MS = 28;
/** Content may run at most this far ahead of the last rendered frame (px) */
export const RENDER_STALENESS_BUDGET_PX = 250;
/** Pipeline-interval samples longer than this are idle gaps, not renders */
export const MAX_RENDER_INTERVAL_SAMPLE_MS = 1500;

/** Drop samples that fall outside the velocity window relative to `now`. */
export const pruneSamples = (
  samples: VelocitySample[],
  now: number,
): VelocitySample[] =>
  samples.filter((s) => now - s.time <= VELOCITY_WINDOW_MS);

/**
 * Average velocity over the retained samples, clamped to ±MAX_FLICK_VELOCITY
 * so a single flick stays gentle (stacking is what reaches MAX_FLING_VELOCITY).
 * Returns 0 when there is not enough recent data to derive a direction.
 */
export const computeReleaseVelocity = (
  samples: readonly VelocitySample[],
): number => {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined || first === last) return 0;
  const elapsed = last.time - first.time;
  if (elapsed <= 0) return 0;
  const velocity = (last.position - first.position) / elapsed;
  return Math.max(-MAX_FLICK_VELOCITY, Math.min(MAX_FLICK_VELOCITY, velocity));
};

/** Advance a fling by one frame: integrate position, decay velocity. */
/**
 * Stack a new flick on top of the velocity carried over from a fling that
 * was still running when the finger came back down. Same-direction flicks
 * accumulate (repeated flicking ramps navigation speed up to the cap);
 * an opposite-direction flick discards the carried velocity and starts
 * fresh, matching the physical expectation of catching and reversing.
 */
export const combineFlingVelocities = (
  release: number,
  carried: number,
): number => {
  const combined = release * carried > 0 ? release + carried : release;
  return Math.max(-MAX_FLING_VELOCITY, Math.min(MAX_FLING_VELOCITY, combined));
};

/**
 * Track how long the render pipeline actually takes between runs (EMA).
 * Degrades quickly when frames get slow and recovers slowly, so a burst of
 * heavy frames keeps the speed governor cautious for a while. Samples
 * longer than MAX_RENDER_INTERVAL_SAMPLE_MS are idle gaps and are ignored.
 */
export const updateRenderIntervalEma = (
  emaMs: number | null,
  sampleMs: number,
): number | null => {
  if (sampleMs > MAX_RENDER_INTERVAL_SAMPLE_MS) return emaMs;
  if (emaMs === null) return sampleMs;
  const alpha = sampleMs > emaMs ? 0.5 : 0.15;
  return emaMs + (sampleMs - emaMs) * alpha;
};

/**
 * Speed governor: the fastest fling the device can actually render. Caps
 * velocity so content never runs more than RENDER_STALENESS_BUDGET_PX ahead
 * of the last rendered frame — on a renderer that keeps up, the cap stays
 * at MAX_FLING_VELOCITY; on a struggling one, accumulated flicks plateau at
 * a speed the rendering can follow instead of leaving it behind.
 */
export const computeAdaptiveVelocityCap = (
  renderIntervalEmaMs: number | null,
): number => {
  if (renderIntervalEmaMs === null || renderIntervalEmaMs <= 0) {
    return MAX_FLING_VELOCITY;
  }
  const sustainable = RENDER_STALENESS_BUDGET_PX / renderIntervalEmaMs;
  return Math.max(
    MIN_FLING_VELOCITY,
    Math.min(MAX_FLING_VELOCITY, sustainable),
  );
};

export const stepFling = (state: FlingState, dtMs: number): FlingState => {
  // Position integration is clamped so a stalled frame (tab switch, heavy
  // render) cannot teleport the content. Velocity decay uses the FULL
  // elapsed time: when rendering drops to a few fps, the fling must still
  // die out on the wall clock — clamping decay too would stretch a 1.6s
  // fling into 10+ seconds of sustained scrolling on a struggling device.
  return {
    position:
      state.position + state.velocity * Math.min(dtMs, MAX_FRAME_DT_MS),
    velocity: state.velocity * Math.exp(-dtMs / FLING_TIME_CONSTANT_MS),
  };
};

export const isFlingDone = (velocity: number): boolean =>
  Math.abs(velocity) < STOP_FLING_VELOCITY;
