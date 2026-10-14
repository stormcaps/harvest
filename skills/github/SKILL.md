---
name: github
description: "Harvest a GitHub repository or gist: inventory of skills, commands, agents, hooks, MCP and scripts, a security audit, the licence, and only what changed since the last harvest."
argument-hint: "<github.com/owner/repo-or-gist-url>"
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Harvest $ARGUMENTS.

`H` means `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs"`. First print the method with `H guide method`
and follow its steps 1 to 8 for this link; the notes below are what is specific to this source.

## What is specific to GitHub

- **Tier 0** downloads one commit's archive to the plugin's work folder (no clone, no history), inventories
  it, and audits it. Anonymous GitHub API calls are limited to 60/hour; set `GITHUB_TOKEN` to lift it.
- **Already harvested?** `H profile --find <url>` finds the source line, which records the commit;
  `H read <url> --since <sha>` then lists only what changed.
- **Read the content, not the names.** Read the README, then open every file whose idea we might
  lack, including the **code of scripts** — the best mechanisms live there. Report how many files
  you opened out of how many were listed.
- **The licence** in the report decides what can be copied (see the security guide).
- The extracted tree is at the path `read` prints, for reading with your file tools. `H clean <url>`
  deletes every archive of this repo.
- **Gists** are read through the GitHub API: every file, inline. A gist is code — audit before reuse.
- Over ~200 readable files: focus on what matches the project's needs and say what was skipped.
