---
name: instagram
description: "Harvest an Instagram reel or post: caption first, then speech-to-text and one contact sheet when the caption is bait or cut short."
argument-hint: "<instagram-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to Instagram

- **Tier 0** reads the public caption the link preview shows (no login, ~1 s).
- **Engagement bait** ("comment CODE and I'll send the links") is flagged by `read`: the content is
  in the video. Go to tier 2 directly — reels rarely have captions, so `H transcript` runs local
  speech-to-text (needs whisper-cli; `H doctor` says what is missing).
- **Tier 3 is required** when the caption is bait and the speech names tools without links: reels
  show the exact repo (`owner/name`), the UI or the command on screen, and nowhere else. Measured on
  a reel naming four plugins: only the contact sheet gave the repo owner.
- **Image posts** (`/p/`): `H images <url>` fetches the picture the preview shows. A **carousel**
  previews its first slide only: open the post in a browser for the others, and delete any
  screenshot you had to take.
- Never read or post comments: a reel's comment section is usually one bait word, thousands of
  times.
