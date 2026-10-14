---
name: hackernews
description: "Harvest a Hacker News story: the discussion tree, then the linked article if the discussion is not enough."
argument-hint: "<news.ycombinator.com/item?id=…>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to Hacker News

- **Tier 0** reads the whole comment tree through the Algolia HN API in one request (top 30,
  two levels deep).
- The story usually links somewhere: `H read <linked-url>` harvests the article itself. The
  discussion is best for objections, alternatives and real-world experience.
