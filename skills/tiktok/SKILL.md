---
name: tiktok
description: "Harvest a TikTok video: caption, then captions or speech-to-text, then one contact sheet if needed."
argument-hint: "<tiktok-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to TikTok

- **Tier 0** reads the caption through yt-dlp, or the public oEmbed endpoint without it (slow —
  measured up to 32 s; the script gives up after 20 s).
- **Tier 1** uses captions when the video has some (`read` lists them); otherwise `H transcript` runs
  local speech-to-text — measured on a 56 s TikTok: 8.6 s, and it says so when there is only music.
- Same bait and on-screen rules as Instagram: climb to speech when the caption promises content
  it doesn't give, to frames when the screen names things.
- Short links (`vm.tiktok.com/…`) are handed to yt-dlp as they are; if one fails, open it in a
  browser to get the full `/@user/video/<id>` link.
