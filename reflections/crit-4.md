# Crit 4 reflection

**What was the breakthrough that moved the work forward?**

The breakthrough wasn't a feature, it was noticing that the feature wasn't
shipping. I'd built World Deck --- five playable world instruments, gesture
control, audio-reactive particles --- across eleven staged commits, all of it
in `demo.html`, checking my work by opening that file in the dev server. But
`index.html`, the file GitHub Pages actually serves, was still the original
template starter page the whole time. Everything I'd verified in the browser
was true of a file nobody visiting the deployed site would ever see. Fixing it
meant deleting the stale `index.html` and renaming the real page into its
place, and then following that thread to a `pnpm check` failure I'd have
otherwise patched around: a leftover starter test asserting a marker that no
longer existed. Reading why that test was there, instead of just editing its
selector to pass, was what actually closed the loop.

**What did this work change about who I want to be as a software developer?**

It sharpened a habit I want to keep: check the artifact that ships, not the
file you happen to have open. A dev server showing the right thing on screen
told me nothing about what was actually at the site root. I want to be the
kind of developer who treats "does the deployed page match what I built" as
its own question, separate from "does the code I'm editing work" --- and who,
when a check breaks, reads why it exists before deciding whether to fix it or
retire it.
