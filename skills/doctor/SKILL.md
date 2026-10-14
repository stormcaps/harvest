---
name: doctor
description: "Check which tools harvest can use on this machine, what each missing one unlocks, and the official line to install it."
disable-model-invocation: true
allowed-tools:
  - Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" *)
  - Read(${CLAUDE_PLUGIN_ROOT}/.work/**)
  - Read(/${CLAUDE_PLUGIN_ROOT}/.work/**)
---

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/harvest.mjs" doctor` and show its output as is.

Then, for each missing tool, say in one line which of the user's sources it would unlock. Do not
install anything yourself: give the install line and let the user run it. On Windows, give one
command per code block (Windows PowerShell 5.1 has no `&&`).
