---
name: youtube
description: "Harvest a YouTube video or Short: description, chapters, captions, then frames only if the screen matters."
argument-hint: "<youtube-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to YouTube

- **Tier 0 is rich here:** the description often carries the links, and the chapters are a free
  map of the talk. Read chapters that match a need before the rest.
- **Tier 1:** `H transcript <url>` takes the speaker's own language first (human captions, then
  the original auto-captions). A track marked MACHINE-TRANSLATED is a fallback: quote it with care.
- **Tier 2** only runs when the video has no captions at all.
- **Tier 3** for tutorials where code, a UI or a diagram is on screen: `H frames <url>`. A screen
  recording has no hard cuts, so the sheet falls back to evenly spaced instants — it says so.
- Shorts behave like reels: the caption is short and the speech carries the content.
- Long talks: slice the transcript (reading guide) — never read a 2-hour transcript whole.
