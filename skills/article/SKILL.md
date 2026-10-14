---
name: article
description: "Harvest a web article, blog post, newsletter, docs page or dev.to post as clean text with its links."
argument-hint: "<url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to articles

- **Tier 0** fetches the page and extracts the article locally — nothing is sent to a third-party
  reader. dev.to posts come from its API as the author's own Markdown.
- The script flags two failure shapes instead of returning junk: **almost no text** (the page is
  built by script — use the browser) and **possibly paywalled** (what you got may be a preview).
- PDFs are refused as pages: read them with a PDF tool.
- A long article is still one read; quote the exact sentence you act on, with its heading.
