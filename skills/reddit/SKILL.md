---
name: reddit
description: "Harvest a Reddit post and its top replies from the public feed (about one read a minute), share links included; the browser as fallback."
argument-hint: "<reddit-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to Reddit

- **Tier 0** reads the post and its top 16 replies from the public feed, in ~0.5 s. Reddit
  allows about **one read per minute** without an account (measured 2026-10-14; a burst answers
  429). The script retries once after 2 s, then says so — wait a minute, or use the browser.
- App share links (`/r/<sub>/s/<code>`) are resolved to the post automatically.
- **Browser fallback:** open the post on `www.reddit.com` and read the page text (measured with
  Playwright: post and 25 comments). `old.reddit.com` sends a fresh browser to a login page, and
  some built-in browsers refuse reddit.com entirely.
- The comments are usually the value: read the top ones, note who corrects whom.
- Video posts (`v.redd.it`): `H transcript <url>` / `H frames <url>` through yt-dlp.
