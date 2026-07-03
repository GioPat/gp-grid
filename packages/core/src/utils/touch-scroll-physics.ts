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
/**
 * Fallback plateau for stacked flick velocity (logical px/ms) when no grid
 * context is available. GridCore derives the real default from row height
 * (20,000 rows/s → 640 at a 32px row height); configurable per grid via
 * `GridCoreOptions.maxFlingVelocity`.
 */
export const MAX_FLING_VELOCITY = 640;
/**
 * A single flick's release velocity is clamped to this (logical px/ms) so
 * one swipe stays gentle — stacking flicks is what builds up to the cap.
 */
export const MAX_FLICK_VELOCITY = 2.4;
/**
 * Compounding applied to the carried velocity when a flick stacks onto a
 * same-direction fling. A finger physically tops out at a few px/ms, so
 * additive stacking alone can never reach caps of tens of px/ms (thousands
 * of rows per second); multiplying the caught momentum lets repeated
 * flicking ramp to the cap within a handful of gestures.
 */
export const STACKED_FLICK_GAIN = 4;
/**
 * Exponential decay time constant for fling deceleration (ms). Deliberately
 * floatier than native scroll views (iOS ≈ 500ms): momentum here is a
 * navigation tool for huge datasets, so a released fling should coast
 * rather than brake.
 */
export const FLING_TIME_CONSTANT_MS = 1200;
/** Frame delta clamp so a stalled tab does not teleport the scroll position */
export const MAX_FRAME_DT_MS = 64;
/**
 * Fling render throttling may engage only above this speed, expressed in
 * rows per second. Below it — and always while the finger is down — the
 * pipeline renders every frame: at the throttled ~10Hz cadence a jump of
 * only a few rows reads as rows locking and snapping, not as fast
 * scrolling. Above it each throttled render advances 15+ rows, which
 * reads as continuous flow.
 */
export const MIN_THROTTLED_ROWS_PER_SECOND = 150;

/** Velocity (logical px/ms) above which fling render throttling may engage. */
export const renderThrottleThreshold = (rowHeight: number): number =>
  (MIN_THROTTLED_ROWS_PER_SECOND * rowHeight) / 1000;
/** Max time between rendered frames while render-throttled */
export const FAST_FLING_RENDER_INTERVAL_MS = 100;
/**
 * A frame-interval EMA above this means the device cannot sustain a full
 * pipeline run per frame; a fast fling then falls back to the throttled
 * render cadence until it slows below RENDER_VELOCITY_THRESHOLD.
 */
export const HEAVY_FRAME_BUDGET_MS = 28;
/**
 * Floor for how far content may run ahead of the last rendered frame (px).
 * The effective budget scales with the fling cap (cap × TARGET_FRAME_MS)
 * so a renderer keeping a 60fps pace can always carry the full configured
 * speed; this floor only governs small caps.
 */
export const RENDER_STALENESS_BUDGET_PX = 250;
/** Healthy-device frame duration (ms) used to scale the staleness budget */
export const TARGET_FRAME_MS = 17;
/** Pipeline-interval samples longer than this are idle gaps, not renders */
export const MAX_RENDER_INTERVAL_SAMPLE_MS = 1500;

/** Drop samples that fall outside the velocity window relative to `now`. */
export const pruneSamples = (
  samples: VelocitySample[],
  now: number,
): VelocitySample[] =>
  samples.filter((s) => now - s.time <= VELOCITY_WINDOW_MS);

/**
 * Average velocity over the retained samples, clamped to the single-flick
 * cap (or the fling cap when configured lower) so one flick stays gentle —
 * stacking is what reaches the fling cap. Returns 0 when there is not
 * enough recent data to derive a direction.
 */
export const computeReleaseVelocity = (
  samples: readonly VelocitySample[],
  maxFlingVelocity: number = MAX_FLING_VELOCITY,
): number => {
  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined || first === last) return 0;
  const elapsed = last.time - first.time;
  if (elapsed <= 0) return 0;
  const velocity = (last.position - first.position) / elapsed;
  const flickCap = Math.min(MAX_FLICK_VELOCITY, maxFlingVelocity);
  return Math.max(-flickCap, Math.min(flickCap, velocity));
};

/**
 * Stack a new flick on top of the velocity carried over from a fling that
 * was still running when the finger came back down. Same-direction flicks
 * compound the carried momentum by STACKED_FLICK_GAIN (repeated flicking
 * ramps navigation speed up to the cap within a handful of gestures); an
 * opposite-direction flick discards the carried velocity and starts fresh,
 * matching the physical expectation of catching and reversing.
 */
export const combineFlingVelocities = (
  release: number,
  carried: number,
  maxFlingVelocity: number = MAX_FLING_VELOCITY,
): number => {
  const combined =
    release * carried > 0 ? release + carried * STACKED_FLICK_GAIN : release;
  return Math.max(-maxFlingVelocity, Math.min(maxFlingVelocity, combined));
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
 * velocity so content never runs more than the staleness budget ahead of
 * the last rendered frame. The budget scales with the configured fling cap
 * so a renderer keeping a healthy 60fps pace carries the full configured
 * speed; on a struggling one, accumulated flicks plateau at a speed the
 * rendering can follow instead of leaving it behind.
 */
export const computeAdaptiveVelocityCap = (
  renderIntervalEmaMs: number | null,
  maxFlingVelocity: number = MAX_FLING_VELOCITY,
): number => {
  if (renderIntervalEmaMs === null || renderIntervalEmaMs <= 0) {
    return maxFlingVelocity;
  }
  const budgetPx = Math.max(
    RENDER_STALENESS_BUDGET_PX,
    maxFlingVelocity * TARGET_FRAME_MS,
  );
  const sustainable = budgetPx / renderIntervalEmaMs;
  return Math.max(
    MIN_FLING_VELOCITY,
    Math.min(maxFlingVelocity, sustainable),
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
