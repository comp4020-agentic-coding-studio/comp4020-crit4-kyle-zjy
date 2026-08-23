import { describe, expect, it } from "vitest";
import {
  computeHandOpenness,
  computeSample,
  createCooldownTracker,
  createEmaSmoother,
  createGestureHistory,
  createPinchTracker,
  detectCircularMotion,
  detectDownwardStrike,
  detectFastReversal,
  detectHorizontalSwipe,
  detectRapidShake,
  detectStillHold,
  type GestureSample,
} from "../src/gestures";

// Builds a synthetic trajectory: an array of {t, x, y} waypoints -> a chain
// of GestureSamples with real vx/vy/velocity, exactly how the runtime feeds
// mouse or hand positions through computeSample() one at a time.
function trajectory(points: Array<{ t: number; x: number; y: number }>): GestureSample[] {
  const samples: GestureSample[] = [];
  let prev: GestureSample | null = null;
  for (const p of points) {
    const s = computeSample(prev, p.x, p.y, p.t);
    samples.push(s);
    prev = s;
  }
  return samples;
}

describe("computeSample", () => {
  it("first sample has zero velocity", () => {
    const s = computeSample(null, 0.5, 0.5, 0);
    expect(s.vx).toBe(0);
    expect(s.vy).toBe(0);
    expect(s.velocity).toBe(0);
  });

  it("derives signed vx/vy from consecutive positions", () => {
    const first = computeSample(null, 0.2, 0.2, 0);
    const second = computeSample(first, 0.3, 0.1, 100);
    expect(second.vx).toBeCloseTo(1.0, 5); // +0.1 over 100ms
    expect(second.vy).toBeCloseTo(-1.0, 5);
  });
});

describe("createGestureHistory", () => {
  it("drops samples older than the window", () => {
    const history = createGestureHistory(300);
    for (let t = 0; t <= 1000; t += 50) {
      history.push(computeSample(null, 0.5, 0.5, t));
    }
    const kept = history.get();
    expect(kept.length).toBeGreaterThan(0);
    expect(kept[0].time).toBeGreaterThanOrEqual(700); // 1000 - 300
  });

  it("reset() clears the buffer", () => {
    const history = createGestureHistory();
    history.push(computeSample(null, 0.5, 0.5, 0));
    history.reset();
    expect(history.get().length).toBe(0);
  });
});

describe("detectHorizontalSwipe", () => {
  it("detects a fast, consistent-direction horizontal sweep", () => {
    const traj = trajectory([
      { t: 0, x: 0.1, y: 0.5 },
      { t: 40, x: 0.3, y: 0.5 },
      { t: 80, x: 0.5, y: 0.5 },
      { t: 120, x: 0.7, y: 0.5 },
      { t: 160, x: 0.9, y: 0.5 },
    ]);
    const result = detectHorizontalSwipe(traj);
    expect(result.detected).toBe(true);
    expect(result.direction).toBe(1);
  });

  it("does not fire on slow drift", () => {
    const traj = trajectory([
      { t: 0, x: 0.1, y: 0.5 },
      { t: 200, x: 0.15, y: 0.5 },
      { t: 400, x: 0.2, y: 0.5 },
    ]);
    expect(detectHorizontalSwipe(traj).detected).toBe(false);
  });

  it("reports the opposite direction for a right-to-left sweep", () => {
    const traj = trajectory([
      { t: 0, x: 0.9, y: 0.5 },
      { t: 40, x: 0.7, y: 0.5 },
      { t: 80, x: 0.5, y: 0.5 },
      { t: 120, x: 0.3, y: 0.5 },
      { t: 160, x: 0.1, y: 0.5 },
    ]);
    expect(detectHorizontalSwipe(traj).direction).toBe(-1);
  });
});

describe("detectDownwardStrike", () => {
  it("detects a fast downward movement", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.1 },
      { t: 30, x: 0.5, y: 0.25 },
      { t: 60, x: 0.5, y: 0.4 },
      { t: 90, x: 0.5, y: 0.55 },
    ]);
    expect(detectDownwardStrike(traj).detected).toBe(true);
  });

  it("does not fire on upward movement", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.55 },
      { t: 30, x: 0.5, y: 0.4 },
      { t: 60, x: 0.5, y: 0.25 },
      { t: 90, x: 0.5, y: 0.1 },
    ]);
    expect(detectDownwardStrike(traj).detected).toBe(false);
  });

  it("does not fire on a slow descent", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.1 },
      { t: 300, x: 0.5, y: 0.25 },
      { t: 600, x: 0.5, y: 0.4 },
    ]);
    expect(detectDownwardStrike(traj).detected).toBe(false);
  });
});

describe("detectRapidShake", () => {
  it("detects a small rapid left-right oscillation", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.5 },
      { t: 30, x: 0.55, y: 0.5 },
      { t: 60, x: 0.48, y: 0.5 },
      { t: 90, x: 0.55, y: 0.5 },
      { t: 120, x: 0.48, y: 0.5 },
      { t: 150, x: 0.53, y: 0.5 },
    ]);
    const result = detectRapidShake(traj);
    expect(result.detected).toBe(true);
  });

  it("does not fire on a large single-direction swipe", () => {
    const traj = trajectory([
      { t: 0, x: 0.1, y: 0.5 },
      { t: 40, x: 0.3, y: 0.5 },
      { t: 80, x: 0.5, y: 0.5 },
      { t: 120, x: 0.7, y: 0.5 },
      { t: 160, x: 0.9, y: 0.5 },
    ]);
    expect(detectRapidShake(traj).detected).toBe(false);
  });

  it("does not fire on a still hand", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.5 },
      { t: 50, x: 0.5, y: 0.5 },
      { t: 100, x: 0.5, y: 0.5 },
      { t: 150, x: 0.5, y: 0.5 },
    ]);
    expect(detectRapidShake(traj).detected).toBe(false);
  });
});

describe("detectFastReversal", () => {
  it("detects a fast horizontal movement immediately followed by a reversal", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.5 },
      { t: 30, x: 0.65, y: 0.5 },
      { t: 60, x: 0.8, y: 0.5 },
      { t: 90, x: 0.65, y: 0.5 },
      { t: 120, x: 0.5, y: 0.5 },
    ]);
    const result = detectFastReversal(traj);
    expect(result.detected).toBe(true);
    expect(result.direction).toBe(-1);
  });

  it("does not fire on a one-directional swipe with no reversal", () => {
    const traj = trajectory([
      { t: 0, x: 0.1, y: 0.5 },
      { t: 40, x: 0.3, y: 0.5 },
      { t: 80, x: 0.5, y: 0.5 },
      { t: 120, x: 0.7, y: 0.5 },
    ]);
    expect(detectFastReversal(traj).detected).toBe(false);
  });

  it("does not fire on a slow reversal", () => {
    const traj = trajectory([
      { t: 0, x: 0.4, y: 0.5 },
      { t: 300, x: 0.5, y: 0.5 },
      { t: 600, x: 0.4, y: 0.5 },
    ]);
    expect(detectFastReversal(traj).detected).toBe(false);
  });
});

describe("detectCircularMotion", () => {
  it("detects a small slow circular motion", () => {
    const points = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      points.push({ t: i * 40, x: 0.5 + Math.cos(angle) * 0.05, y: 0.5 + Math.sin(angle) * 0.05 });
    }
    const traj = trajectory(points);
    expect(detectCircularMotion(traj).detected).toBe(true);
  });

  it("does not fire on a straight line", () => {
    const traj = trajectory([
      { t: 0, x: 0.3, y: 0.5 },
      { t: 100, x: 0.4, y: 0.5 },
      { t: 200, x: 0.5, y: 0.5 },
      { t: 300, x: 0.6, y: 0.5 },
      { t: 400, x: 0.7, y: 0.5 },
      { t: 500, x: 0.8, y: 0.5 },
    ]);
    expect(detectCircularMotion(traj).detected).toBe(false);
  });

  it("does not fire on a circle too large to be the breath ornament", () => {
    const points = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      points.push({ t: i * 40, x: 0.5 + Math.cos(angle) * 0.4, y: 0.5 + Math.sin(angle) * 0.4 });
    }
    expect(detectCircularMotion(trajectory(points)).detected).toBe(false);
  });
});

describe("detectStillHold", () => {
  it("reports still after holding position past the duration threshold", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.5 },
      { t: 100, x: 0.5, y: 0.5 },
      { t: 200, x: 0.5, y: 0.5 },
      { t: 300, x: 0.5, y: 0.5 },
      { t: 400, x: 0.5, y: 0.5 },
    ]);
    const result = detectStillHold(traj);
    expect(result.still).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(350);
  });

  it("is not still if the position moved recently", () => {
    const traj = trajectory([
      { t: 0, x: 0.5, y: 0.5 },
      { t: 100, x: 0.5, y: 0.5 },
      { t: 200, x: 0.5, y: 0.5 },
      { t: 300, x: 0.7, y: 0.5 },
      { t: 400, x: 0.7, y: 0.5 },
    ]);
    expect(detectStillHold(traj).still).toBe(false);
  });
});

describe("createCooldownTracker", () => {
  it("blocks a second fire within the cooldown window", () => {
    const cooldown = createCooldownTracker();
    expect(cooldown.ready("glissando", 0, 400)).toBe(true);
    cooldown.fire("glissando", 0);
    expect(cooldown.ready("glissando", 100, 400)).toBe(false);
    expect(cooldown.ready("glissando", 400, 400)).toBe(true);
  });

  it("tracks cooldowns independently per key", () => {
    const cooldown = createCooldownTracker();
    cooldown.fire("glissando", 0);
    expect(cooldown.ready("roll", 10, 400)).toBe(true);
  });
});

describe("createPinchTracker", () => {
  it("does not flicker on jitter around a single threshold", () => {
    const pinch = createPinchTracker(0.045, 0.065);
    expect(pinch.update(0.05)).toBe(false); // above onThreshold: not pinched yet
    expect(pinch.update(0.04)).toBe(true); // crosses onThreshold: pinch starts
    // jitter between the two thresholds should not release the pinch
    expect(pinch.update(0.05)).toBe(true);
    expect(pinch.update(0.06)).toBe(true);
    expect(pinch.update(0.05)).toBe(true);
    expect(pinch.update(0.07)).toBe(false); // past offThreshold: releases
  });
});

describe("createEmaSmoother", () => {
  it("converges toward repeated input without jumping instantly", () => {
    const smoother = createEmaSmoother(0.3);
    const first = smoother.update(1);
    expect(first).toBe(1); // first sample seeds the value directly
    const second = smoother.update(0);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(1);
  });
});

describe("computeHandOpenness", () => {
  it("maps a closed fist toward 0", () => {
    expect(computeHandOpenness([0.15, 0.16, 0.14, 0.15])).toBeCloseTo(0, 1);
  });

  it("maps a fully open hand toward 1", () => {
    expect(computeHandOpenness([0.35, 0.36, 0.34, 0.35])).toBeCloseTo(1, 1);
  });

  it("maps a mid-spread hand near 0.5", () => {
    expect(computeHandOpenness([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.5, 1);
  });
});
