---
name: threads
description: "Harvest a Threads post: the first post's text from the public preview, the rest of the thread through the browser."
argument-hint: "<threads-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to Threads

- **Tier 0** reads the public preview of the post — the first post only.
- The rest of a multi-post thread, and replies, need the browser: read page text, not screenshots.
- Video posts: try `H transcript <url>`; if yt-dlp cannot read Threads, say so and use the browser.
