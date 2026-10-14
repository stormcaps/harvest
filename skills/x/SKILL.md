---
name: x
description: "Harvest an X/Twitter post or thread: the whole author thread, quoted post and article text, then video tiers if the post is a video."
argument-hint: "<x.com-or-twitter.com-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to X

- **Tier 0** uses the public FxTwitter API: the author's whole self-reply thread arrives in one
  request (a 12-post thread in ~1.4 s), with the quoted post, X Articles, media and counts.
- **Screenshots are often the tip itself** (code, a settings panel, a terminal): `read` lists the
  post's images, `H images <url>` downloads them to the work folder for reading.
- Videos in the post: `H transcript <url>` and `H frames <url>` on the post URL, through yt-dlp.
- Other people's replies are not fetched; open the post in a browser only if the discussion
  matters to the decision.
- "1/🧵" threads that continue in a *new* post (not a reply) need that post's link too.
- Deleted, private or age-gated posts fail at tier 0 — the browser is the only next step.
