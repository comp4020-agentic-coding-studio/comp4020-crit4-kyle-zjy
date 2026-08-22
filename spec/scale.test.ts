import { describe, expect, it } from "vitest";
import {
  BASE_MIDI,
  createNoteResolver,
  midiToFreq,
  midiToName,
  quantizeToMidi,
  SCALES,
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
