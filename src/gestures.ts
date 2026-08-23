// Gesture interpreter for World Deck's performance layer. Pure, stateless-
// where-possible helpers that turn a short position/velocity history into
// world-agnostic gestures (swipe, strike, shake, reversal, circle, stillness).
// No AudioContext/DOM/MediaPipe dependency here — mouse and hand input are
// both reduced to the same GestureSample shape upstream (in index.html) and
// fed through these same detectors, so "same gesture vocabulary, different
// musical interpretation" holds regardless of input source.

export interface GestureSample {
  time: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  velocity: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Derives one history sample from the previous sample and a new raw
 * position — the single place velocity is computed, so mouse and hand feed
 * identical math. */
export function computeSample(prev: GestureSample | null, x: number, y: number, time: number): GestureSample {
  if (!prev) return { time, x, y, vx: 0, vy: 0, velocity: 0 };
  const dt = Math.max(1, time - prev.time) / 1000;
  const vx = (x - prev.x) / dt;
  const vy = (y - prev.y) / dt;
  return { time, x, y, vx, vy, velocity: Math.hypot(vx, vy) };
}

export const HISTORY_WINDOW_MS = 700;

/** A rolling ~600-700ms history buffer. Old points are dropped on every
 * push rather than left to grow — this is the "do not store unlimited
 * history" buffer the detectors below read from. */
export function createGestureHistory(windowMs: number = HISTORY_WINDOW_MS) {
  let samples: GestureSample[] = [];
  return {
    push(sample: GestureSample): void {
      samples.push(sample);
      const cutoff = sample.time - windowMs;
      let start = 0;
      while (start < samples.length && samples[start].time < cutoff) start++;
      if (start > 0) samples = samples.slice(start);
    },
    get(): readonly GestureSample[] {
      return samples;
    },
    reset(): void {
      samples = [];
    },
  };
}

function windowSince(samples: readonly GestureSample[], windowMs: number): readonly GestureSample[] {
  if (samples.length === 0) return samples;
  const cutoff = samples[samples.length - 1].time - windowMs;
  let start = samples.length - 1;
  while (start > 0 && samples[start - 1].time >= cutoff) start--;
  return samples.slice(start);
}

export interface SwipeOptions {
  minDistance?: number;
  minVelocity?: number;
  windowMs?: number;
}
export interface SwipeResult {
  detected: boolean;
  direction: 1 | -1 | 0;
  intensity: number;
}

/** Chinese glissando / DJ-scratch trigger: a large, fast, direction-
 * consistent horizontal sweep. */
export function detectHorizontalSwipe(samples: readonly GestureSample[], opts: SwipeOptions = {}): SwipeResult {
  const minDistance = opts.minDistance ?? 0.16;
  const minVelocity = opts.minVelocity ?? 1.8;
  const windowMs = opts.windowMs ?? 250;
  const window = windowSince(samples, windowMs);
  if (window.length < 2) return { detected: false, direction: 0, intensity: 0 };

  const first = window[0];
  const last = window[window.length - 1];
  const dx = last.x - first.x;
  const dt = Math.max(1, last.time - first.time) / 1000;
  const avgVelocity = Math.abs(dx) / dt;
  const dxSign = Math.sign(dx);
  const consistent = window.every((s) => Math.abs(s.vx) < 0.15 || Math.sign(s.vx) === dxSign);

  if (Math.abs(dx) >= minDistance && avgVelocity >= minVelocity && consistent) {
    return { detected: true, direction: dxSign >= 0 ? 1 : -1, intensity: clamp01(avgVelocity / (minVelocity * 2)) };
  }
  return { detected: false, direction: 0, intensity: 0 };
}

export interface StrikeOptions {
  minDistance?: number;
  minVelocity?: number;
  windowMs?: number;
}
export interface StrikeResult {
  detected: boolean;
  intensity: number;
}

/** Japanese Koto strike: a fast, short downward movement (y grows downward
 * in screen/image space, so a strike is a positive dy). */
export function detectDownwardStrike(samples: readonly GestureSample[], opts: StrikeOptions = {}): StrikeResult {
  const minDistance = opts.minDistance ?? 0.1;
  const minVelocity = opts.minVelocity ?? 1.6;
  const windowMs = opts.windowMs ?? 200;
  const window = windowSince(samples, windowMs);
  if (window.length < 2) return { detected: false, intensity: 0 };

  const first = window[0];
  const last = window[window.length - 1];
  const dy = last.y - first.y;
  const dt = Math.max(1, last.time - first.time) / 1000;
  const avgVelocity = dy / dt;

  if (dy >= minDistance && avgVelocity >= minVelocity) {
    return { detected: true, intensity: clamp01(avgVelocity / (minVelocity * 2)) };
  }
  return { detected: false, intensity: 0 };
}

export interface ShakeOptions {
  windowMs?: number;
  maxTravel?: number;
  minReversals?: number;
  minVelocity?: number;
}
export interface ShakeResult {
  detected: boolean;
  intensity: number;
}

/** Celtic roll/grace ornament: a small, rapid left-right oscillation —
 * several direction reversals within a small total travel distance. This is
 * deliberately distinct from a swipe (large travel, one direction). */
export function detectRapidShake(samples: readonly GestureSample[], opts: ShakeOptions = {}): ShakeResult {
  const windowMs = opts.windowMs ?? 380;
  const maxTravel = opts.maxTravel ?? 0.1;
  const minReversals = opts.minReversals ?? 2;
  const minVelocity = opts.minVelocity ?? 0.8;
  const window = windowSince(samples, windowMs);
  if (window.length < 4) return { detected: false, intensity: 0 };

  let reversals = 0;
  let prevSign = 0;
  let peakVelocity = 0;
  for (const s of window) {
    const sign = Math.abs(s.vx) > minVelocity ? Math.sign(s.vx) : 0;
    if (sign !== 0) {
      if (prevSign !== 0 && sign !== prevSign) reversals++;
      prevSign = sign;
    }
    peakVelocity = Math.max(peakVelocity, Math.abs(s.vx));
  }
  const xs = window.map((s) => s.x);
  const travel = Math.max(...xs) - Math.min(...xs);

  if (reversals >= minReversals && travel > 0.008 && travel <= maxTravel) {
    return { detected: true, intensity: clamp01(peakVelocity / (minVelocity * 3)) };
  }
  return { detected: false, intensity: 0 };
}

export interface ReversalOptions {
  maxIntervalMs?: number;
  minVelocity?: number;
}
export interface ReversalResult {
  detected: boolean;
  direction: 1 | -1 | 0;
}

/** Blues bend/growl: one fast horizontal movement immediately followed by a
 * reversal — a single strong flip, not the small repeated shake above. */
export function detectFastReversal(samples: readonly GestureSample[], opts: ReversalOptions = {}): ReversalResult {
  const maxIntervalMs = opts.maxIntervalMs ?? 220;
  const minVelocity = opts.minVelocity ?? 2.0;
  const window = windowSince(samples, maxIntervalMs);
  if (window.length < 3) return { detected: false, direction: 0 };

  let flipIndex = -1;
  for (let i = 1; i < window.length; i++) {
    const prevSign = Math.sign(window[i - 1].vx);
    const curSign = Math.sign(window[i].vx);
    if (prevSign !== 0 && curSign !== 0 && prevSign !== curSign) {
      flipIndex = i;
      break;
    }
  }
  if (flipIndex === -1) return { detected: false, direction: 0 };

  const before = window.slice(0, flipIndex);
  const after = window.slice(flipIndex);
  const peakBefore = Math.max(...before.map((s) => Math.abs(s.vx)));
  const peakAfter = Math.max(...after.map((s) => Math.abs(s.vx)));

  if (peakBefore >= minVelocity && peakAfter >= minVelocity) {
    const lastVx = after[after.length - 1].vx;
    return { detected: true, direction: lastVx >= 0 ? 1 : -1 };
  }
  return { detected: false, direction: 0 };
}

export interface CircleOptions {
  windowMs?: number;
  minTurning?: number;
  maxRadius?: number;
  minRadius?: number;
}
export interface CircleResult {
  detected: boolean;
  intensity: number;
}

/** Egyptian breath ornament: a small, slow, tolerant circular/elliptical
 * motion. Uses accumulated signed turning angle around the window's centroid
 * rather than exact circle-fitting — a practical heuristic, not a geometry
 * solver. */
export function detectCircularMotion(samples: readonly GestureSample[], opts: CircleOptions = {}): CircleResult {
  const windowMs = opts.windowMs ?? 700;
  const minTurning = opts.minTurning ?? 4.5;
  const maxRadius = opts.maxRadius ?? 0.16;
  const minRadius = opts.minRadius ?? 0.015;
  const window = windowSince(samples, windowMs);
  if (window.length < 6) return { detected: false, intensity: 0 };

  const cx = window.reduce((a, s) => a + s.x, 0) / window.length;
  const cy = window.reduce((a, s) => a + s.y, 0) / window.length;
  let maxR = 0;
  for (const s of window) maxR = Math.max(maxR, Math.hypot(s.x - cx, s.y - cy));
  if (maxR > maxRadius || maxR < minRadius) return { detected: false, intensity: 0 };

  let turning = 0;
  let prevAngle: number | null = null;
  for (const s of window) {
    const angle = Math.atan2(s.y - cy, s.x - cx);
    if (prevAngle !== null) {
      let d = angle - prevAngle;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      turning += d;
    }
    prevAngle = angle;
  }

  if (Math.abs(turning) >= minTurning) {
    return { detected: true, intensity: clamp01(Math.abs(turning) / (Math.PI * 2)) };
  }
  return { detected: false, intensity: 0 };
}

export interface StillOptions {
  maxMovement?: number;
  minDurationMs?: number;
}
export interface StillResult {
  still: boolean;
  durationMs: number;
}

/** Chinese tremolo trigger: how long the most recent position has stayed
 * within `maxMovement` of itself. */
export function detectStillHold(samples: readonly GestureSample[], opts: StillOptions = {}): StillResult {
  const maxMovement = opts.maxMovement ?? 0.012;
  const minDurationMs = opts.minDurationMs ?? 350;
  if (samples.length === 0) return { still: false, durationMs: 0 };

  const last = samples[samples.length - 1];
  let start = samples.length - 1;
  while (start > 0) {
    const s = samples[start - 1];
    if (Math.hypot(s.x - last.x, s.y - last.y) > maxMovement) break;
    start--;
  }
  const durationMs = last.time - samples[start].time;
  return { still: durationMs >= minDurationMs, durationMs };
}

/** Per-gesture-key cooldowns so one continuous motion can't retrigger a
 * signature technique on every frame. */
export function createCooldownTracker() {
  const lastFired = new Map<string, number>();
  return {
    ready(key: string, now: number, cooldownMs: number): boolean {
      const last = lastFired.get(key) ?? -Infinity;
      return now - last >= cooldownMs;
    },
    fire(key: string, now: number): void {
      lastFired.set(key, now);
    },
    reset(key?: string): void {
      if (key) lastFired.delete(key);
      else lastFired.clear();
    },
  };
}

/** Two-threshold (Schmitt trigger) pinch state so distance jitter around one
 * boundary can't flicker note-on/note-off. `onThreshold` must be smaller than
 * `offThreshold` — pinch engages once distance drops below it, and only
 * releases once distance climbs back past the wider `offThreshold`. */
export function createPinchTracker(onThreshold = 0.045, offThreshold = 0.065) {
  let active = false;
  return {
    update(distance: number): boolean {
      if (!active && distance < onThreshold) active = true;
      else if (active && distance > offThreshold) active = false;
      return active;
    },
    get isActive(): boolean {
      return active;
    },
    reset(): void {
      active = false;
    },
  };
}

/** Exponential moving-average smoother — used for position/openness values
 * that feed continuous expression, kept separate from the unsmoothed history
 * used for gesture detection so smoothing can't blunt intentional gestures. */
export function createEmaSmoother(factor: number) {
  let value: number | null = null;
  return {
    update(x: number): number {
      value = value === null ? x : value + (x - value) * factor;
      return value;
    },
    get(): number {
      return value ?? 0;
    },
    reset(): void {
      value = null;
    },
  };
}

/** Continuous 0..1 hand openness from a set of fingertip-to-wrist distances,
 * normalised against an expected closed/open range so hand distance from the
 * camera doesn't dominate the measurement. */
export function computeHandOpenness(fingerSpreads: readonly number[], opts: { min?: number; max?: number } = {}): number {
  if (fingerSpreads.length === 0) return 0;
  const min = opts.min ?? 0.15;
  const max = opts.max ?? 0.35;
  const avg = fingerSpreads.reduce((a, b) => a + b, 0) / fingerSpreads.length;
  return clamp01((avg - min) / (max - min));
}
