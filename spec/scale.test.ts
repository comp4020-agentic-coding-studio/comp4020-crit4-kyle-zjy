import { describe, expect, it } from "vitest";
import {
  BASE_MIDI,
  createNoteResolver,
  midiToFreq,
  midiToName,
  OCTAVE_SPAN,
  quantizeToMidi,
  SCALES,
  zoneIndexForX,
} from "../src/scale";

// World Deck's spec: horizontal pointer position must select discrete notes
// from the current world's scale — never a chromatic note outside it, and
// never a continuous glide between two notes.
describe("quantizeToMidi", () => {
  for (const [name, intervals] of Object.entries(SCALES)) {
    it(`${name}: every sampled X lands on a pitch class in the scale`, () => {
      for (let i = 0; i <= 30; i++) {
        const x01 = i / 30;
        const midi = quantizeToMidi(x01, intervals);
        const pitchClass = ((midi - BASE_MIDI) % 12 + 12) % 12;
        expect(intervals).toContain(pitchClass);
      }
    });
  }

  it("never returns a note below the base or beyond the octave span", () => {
    const intervals = SCALES.chineseGong;
    expect(quantizeToMidi(0, intervals)).toBe(BASE_MIDI);
    const maxMidi = quantizeToMidi(1, intervals);
    expect(maxMidi).toBeLessThan(BASE_MIDI + 12 * 3);
  });

  for (const [name, intervals] of Object.entries(SCALES)) {
    it(`${name}: spans the full intended octave range (reaches both the lowest and a top-octave note)`, () => {
      const lowest = quantizeToMidi(0, intervals);
      const highest = quantizeToMidi(1 - 1e-9, intervals);
      expect(lowest).toBe(BASE_MIDI + intervals[0]);
      expect(highest).toBeGreaterThanOrEqual(BASE_MIDI + 12 * (OCTAVE_SPAN - 1));
      expect(highest).toBeLessThan(BASE_MIDI + 12 * OCTAVE_SPAN);
    });
  }

  it("same-zone X movement always resolves to the same MIDI note across the full zone width", () => {
    const intervals = SCALES.chineseGong;
    const span = intervals.length * 3;
    // Sample densely across zone index 2's full width and confirm every
    // sample lands on the same MIDI note — movement inside a zone must
    // never change pitch.
    const zone = 2;
    const midis = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const x01 = (zone + i / 20) / span; // stays within [zone, zone+1) of the span
      midis.add(quantizeToMidi(x01, intervals));
    }
    expect(midis.size).toBe(1);
  });
});

describe("midiToFreq / midiToName", () => {
  it("A4 (MIDI 69) is 440Hz", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
  });

  it("names MIDI 60 as C4", () => {
    expect(midiToName(60)).toBe("C4");
  });

  it("names MIDI 61 as C#4", () => {
    expect(midiToName(61)).toBe("C#4");
  });
});

describe("createNoteResolver: hysteresis", () => {
  it("does not flip-flop on jitter sitting on a zone boundary", () => {
    const intervals = SCALES.chineseGong;
    const resolver = createNoteResolver({ intervals, deadZone: 0.15, retriggerMs: 0 });
    const span = intervals.length * 3;
    const boundaryX = 1 / span; // edge between zone 0 and zone 1

    resolver.resolve(boundaryX - 0.02 / span, 0);
    let changes = 0;
    for (let i = 0; i < 40; i++) {
      // tiny jitter of +/- 0.3% of a zone width around the boundary
      const jitter = (i % 2 === 0 ? 1 : -1) * 0.003 / span;
      const { changed } = resolver.resolve(boundaryX + jitter, i);
      if (changed) changes++;
    }
    expect(changes).toBe(0);
  });

  it("does register a real crossing well past the boundary", () => {
    const intervals = SCALES.chineseGong;
    const resolver = createNoteResolver({ intervals, deadZone: 0.15, retriggerMs: 0 });
    const first = resolver.resolve(0.0, 0);
    const second = resolver.resolve(1.0, 100);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(true);
    expect(second.midi).not.toBe(first.midi);
  });

  it("first resolve() call always reports a change (the initial note-on)", () => {
    const resolver = createNoteResolver({ intervals: SCALES.chineseGong });
    expect(resolver.resolve(0.5, 0).changed).toBe(true);
  });
});

describe("createNoteResolver: zone-gated note changes", () => {
  it("only reports changed when the underlying quantized zone actually crosses a boundary", () => {
    const intervals = SCALES.chineseGong;
    const resolver = createNoteResolver({ intervals, deadZone: 0, retriggerMs: 0 });
    const span = intervals.length * 3;
    let now = 0;
    let prevZone = resolver.resolve(0, now).zoneIndex;
    for (let i = 1; i <= span * 2; i++) {
      now += 10;
      const x01 = i / (span * 2);
      const expectedZone = zoneIndexForX(x01, intervals);
      const { zoneIndex, changed } = resolver.resolve(x01, now);
      expect(changed).toBe(zoneIndex !== prevZone);
      if (changed) expect(zoneIndex).toBe(expectedZone);
      prevZone = zoneIndex;
    }
  });
});

describe("createNoteResolver: retrigger interval", () => {
  it("throttles rapid successive crossings within the retrigger window", () => {
    const intervals = SCALES.chineseGong;
    const resolver = createNoteResolver({ intervals, deadZone: 0, retriggerMs: 50 });
    const span = intervals.length * 3;
    resolver.resolve(0, 0);

    let changes = 0;
    // Sweep across several zone boundaries within 20ms — far less than the
    // 50ms retrigger floor — one event per millisecond.
    for (let t = 1; t <= 20; t++) {
      const { changed } = resolver.resolve(t / span, t);
      if (changed) changes++;
    }
    expect(changes).toBe(0);

    // Once past the retrigger window, a genuine crossing goes through.
    const { changed } = resolver.resolve(10 / span, 60);
    expect(changed).toBe(true);
  });
});
