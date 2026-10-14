---
name: video
description: "Harvest a video from any other site yt-dlp supports (Loom and ~1,800 others): description, captions or speech-to-text, frames."
argument-hint: "<video-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to other video sites

- Same ladder as YouTube, through yt-dlp, which reads ~1,800 sites. Measured 2026-10-14: Loom
  share links read without an account; **Vimeo now refuses anonymous reads** (it asks for a login).
- LinkedIn posts are behind a login wall: read them in a browser. Whether their videos read
  anonymously was not measured — try `H read`, and fall back to the browser on a login error.
- If yt-dlp does not know the site, `read` says so — try `H read` as an article, then the browser.
