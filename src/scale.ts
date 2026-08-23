// Pure scale/note math for World Deck. No AudioContext/DOM dependency, so
// it's directly unit-testable and shared between the runtime engine
// (index.html) and spec/scale.test.ts.

export const BASE_MIDI = 48; // C3
export const OCTAVE_SPAN = 3;

export const SCALES = {
  chineseGong: [0, 2, 4, 7, 9],
  japaneseInSen: [0, 1, 5, 7, 10],
  celticDorian: [0, 2, 3, 5, 7, 9, 10],
  egyptianPentatonic: [0, 2, 5, 7, 10],
  bluesMinor: [0, 3, 5, 6, 7, 10],
} as const;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Pointer X (0..1) -> a discrete zone index across `intervals.length *
 * octaveSpan` equal-width zones, then -> a MIDI note. Never interpolates
 * between notes. */
export function zoneIndexForX(x01: number, intervals: readonly number[], octaveSpan = OCTAVE_SPAN): number {
  const span = intervals.length * octaveSpan;
  return Math.min(span - 1, Math.floor(clamp01(x01) * span));
}

export function midiForZoneIndex(
  zoneIndex: number,
  intervals: readonly number[],
  baseMidi = BASE_MIDI,
): number {
  const octave = Math.floor(zoneIndex / intervals.length);
  const degree = intervals[zoneIndex % intervals.length];
  return baseMidi + octave * 12 + degree;
}

export function quantizeToMidi(
  x01: number,
  intervals: readonly number[],
  baseMidi = BASE_MIDI,
  octaveSpan = OCTAVE_SPAN,
): number {
  return midiForZoneIndex(zoneIndexForX(x01, intervals, octaveSpan), intervals, baseMidi);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  const name = NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export interface NoteResolverOptions {
  intervals: readonly number[];
  baseMidi?: number;
  octaveSpan?: number;
  /** Fraction of a zone's width a boundary crossing must clear before the
   * note actually changes, as a Schmitt trigger — kills flip-flop from tiny
   * jitter sitting right on a zone edge. */
  deadZone?: number;
  /** Minimum milliseconds between note changes, regardless of how many
   * zone boundaries were crossed in between — kills machine-gun retriggers
   * from fast jitter. */
  retriggerMs?: number;
}

export interface NoteResolution {
  midi: number;
  zoneIndex: number;
  changed: boolean;
}

/** Stateful pointer-X -> discrete-note resolver with hysteresis and a
 * retrigger floor. `now` is caller-supplied (performance.now() at runtime,
 * an injected fake clock in tests) so this has no hidden timer dependency. */
export function createNoteResolver(opts: NoteResolverOptions) {
  const { intervals, baseMidi = BASE_MIDI, octaveSpan = OCTAVE_SPAN } = opts;
  const deadZone = opts.deadZone ?? 0.15;
  const retriggerMs = opts.retriggerMs ?? 45;
  const span = intervals.length * octaveSpan;

  let lastZoneIndex: number | null = null;
  let lastChangeTime = -Infinity;

  return {
    reset(): void {
      lastZoneIndex = null;
      lastChangeTime = -Infinity;
    },

    /** The last resolved zone index, or null before the first resolve() —
     * lets a signature-gesture trigger (e.g. glissando) start from "the note
     * currently sounding" without re-deriving it from a stale pointer X. */
    currentZoneIndex(): number | null {
      return lastZoneIndex;
    },

    resolve(x01: number, now: number): NoteResolution {
      const raw = clamp01(x01) * span;
      const candidate = Math.min(span - 1, Math.floor(raw));

      let zoneIndex = lastZoneIndex ?? candidate;
      let changed = lastZoneIndex === null;

      if (lastZoneIndex !== null && candidate !== lastZoneIndex) {
        const boundary = candidate > lastZoneIndex ? lastZoneIndex + 1 : lastZoneIndex;
        const distancePastBoundary = Math.abs(raw - boundary);
        if (distancePastBoundary >= deadZone && now - lastChangeTime >= retriggerMs) {
          zoneIndex = candidate;
          changed = true;
        }
      }

      if (changed) {
        lastZoneIndex = zoneIndex;
        lastChangeTime = now;
      }

      return { midi: midiForZoneIndex(zoneIndex, intervals, baseMidi), zoneIndex, changed };
    },
  };
}
