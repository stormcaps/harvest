---
name: bluesky
description: "Harvest a Bluesky post: the author's thread, link cards, image alt text and the top replies."
argument-hint: "<bsky.app-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to Bluesky

- **Tier 0** uses the public Bluesky API (no account): the author's chain of replies is the thread,
  other replies are listed by likes (top 15).
- Link cards and image alt text are included — the alt text is often where the detail is. When
  it is missing, `H images <url>` downloads the pictures to read them.
- Video posts: try `H transcript <url>` / `H frames <url>` (through yt-dlp); on an extractor error, use
  the browser.
