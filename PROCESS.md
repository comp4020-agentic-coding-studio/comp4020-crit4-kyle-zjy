# Process overview

A reading-guide to how the work came together --- a map to your process, not an
essay about it. Markers read this file and follow its citations; they don't
trawl the repo for evidence you didn't point at, so if a moment mattered, cite
it.

This file is the shape; the course site's
[assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
is the requirement, and its
[word counts](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#word-counts)
cover every deliverable.

## What I built

World Deck is a gesture-controlled audio-visual instrument styled as a DJ
deck: a crossfader and energy control sweep between five world instruments
(Chinese Guzheng, Japanese Koto, Celtic Tin Whistle, Egyptian Ney, Blues
Harmonica), each with its own synth voice, scale, and particle silhouette,
playable by mouse or by hand gesture (pitch/timbre from position, pinch for
note-on/off, a scratch gesture for fast reversal, a two-finger pinch for
energy) with the particle field breathing and sparking in time with the audio.

## The moments that mattered

1. **Built the instrument in the wrong file for eleven commits.** World Deck
   was built up stage by stage in `demo.html`
   ([`fdc77fe`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-kyle-zjy/commit/fdc77fe)
   through
   [`c075ebd`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-kyle-zjy/commit/c075ebd)),
   while `index.html` --- the file GitHub Pages actually serves at the site
   root --- was still the untouched template starter page. The obvious fix
   was to copy the finished markup over; instead I deleted the stale
   `index.html` and renamed `demo.html` into its place, so there was exactly
   one page and no risk of the two drifting apart
   ([`f377a5a...23db18f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-kyle-zjy/compare/f377a5a...23db18f)).
   I knew it mattered because until that rename, everything I'd been checking
   in the browser during dev was invisible to a marker looking at the
   deployed root.
2. **Deleting a test instead of patching its assertion.** The rename broke
   `pnpm check`: `spec/starter.test.ts` still asserted the old starter page's
   `data-testid="intro"` marker, which no longer existed. The quick fix would
   have been to update the selector to something in World Deck. Instead I
   read the test's own file --- `spec/README.md` calls it out as "a worked
   example, not part of the always-on contract," meant to be replaced once
   the starter page is --- and removed it outright rather than keep patching
   an implementation-detail test to track a page it was never written for
   ([`ba418eb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-kyle-zjy/commit/ba418eb)).
   `pnpm check` went from red (stale selector) to green with the invariants
   in `spec/invariants.test.ts` still exercising the real, built `dist/`
   output.
3. **Removing dead code while wiring reactivity, not after.** Stage 8 added
   audio-reactive particle breathing, sparkle, and note-attack shockwaves; in
   the same commit I found `changeShape()` had gone dead once particle shape
   was driven by the active world instead of a manual toggle, and removed it
   rather than let it sit alongside the new reactive path
   ([`607ef04`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit4-kyle-zjy/commit/607ef04)).
   `pnpm typecheck` and `pnpm build` staying green through that commit is
   what told me nothing else still called it.

## Before you ship

`pnpm check:evidence` verifies your citations resolve to real commits, that a
reflection entry the marker reads is in `reflections/`, and that your
`CLAUDE.md` is there --- before a marker ever opens the file. It checks that
your map is traceable, not that it is good: the marker judges whether your
small, deliberately chosen set of moments shows real judgement and reflection. A
green check is not a substitute for that curation.

Images aren't checked: whether one renders is visible the moment you look. Open
this file on GitHub and look at it before you ship.
