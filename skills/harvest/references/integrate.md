# Integrate — where harvested knowledge belongs

Knowledge nobody's agent will read is lost. The goal: every kept item lands where the agent that
works on that topic will meet it — in the project's own structure when there is one, in a small,
clearly-wired one when there isn't.

## 0 · The project's own process wins

If `H profile` lists an **intake** (a CONTRIBUTING guide, an inbox, a proposals folder, a library
with a review gate), or the instruction files describe how knowledge is added, follow that instead
of this guide. A project that regenerates documents from sources: edit the source, not the output.

## 1 · Rules for every write

- **One idea, one home.** Merge into the document that already covers the topic. A second file on
  the same subject is how knowledge rots.
- **Instruction files stay lean.** `CLAUDE.md`, `AGENTS.md` and their kin load into every session:
  add a one-line rule or a pointer, never an essay.
- **Write in the project's language** (`profile.language`), even when the source was in another one.
- **Cite where it lands:** `Source: <title> — <url> (<author>, <date>[, at mm:ss])`. That line is
  also the harvest ledger — `H profile --find <url>` finds it next time. No separate log file.
  Every section carries its own full line, URL included — never "same video": sections get moved.
- **Images: none by default.** A link and a timestamp let anyone go back. Keep one or two frames
  only when the visual cannot be said in words (a layout, a motion, a diagram):
  `H keep-frame <url> <seconds> <assets-folder>/<name>.webp` (≤ 120 KB, the folder the project
  already uses for images, else next to the knowledge doc), referenced from the text.
- **Lessons that can be violated become checks.** "Keep functions short" is advice; "a function
  over 40 lines fails review — split it" is a rule an agent can apply. Write it with what a
  violation looks like, in the checklist or review skill that runs at that moment.

## 2 · Where each kind of item goes

| Item | Level 0 · bare | 1 · instruction file only | 2 · documented | 3 · ecosystem |
| --- | --- | --- | --- | --- |
| A rule that applies to every task | create the instruction file (ask) with the rule | one line in it | one line in it, the detail in the doc it points to | the shared rules file, or the skill that enforces it |
| A technique / how-to | `docs/knowledge/<topic>.md` + index (ask) | same, plus a pointer line | the topic's existing doc, else a new doc + index entry | merge into the skill or library entry that owns the topic |
| A decision ("we use X because Y") | in the knowledge doc | same | a decision record, in the repo's format | same |
| A UI / UX pattern | `docs/knowledge/ui.md` | same | the design doc | the design system / asset library |
| A tool, MCP server, plugin | proposed only — install after yes, pinned | same | same + a line in the doc listing tools | same, in the place tools are declared |
| A prompt, skill, command | `.claude/skills/<name>/SKILL.md` (ask) | same | same | merge into the existing skill when it is similar |
| Code to reuse | the smallest rewritten piece, in place, attributed | same | same | the shared library when there is one |
| Knowledge for a component not built yet | DEFER into the knowledge doc of that topic | same | the doc that work will open | the skill reference that triggers on it |

**Several repositories that share a library:** the knowledge belongs where it is maintained. If the
current repo consumes a shared library or base, propose the change there rather than a local copy.

## 3 · Creating structure when there is none (level 0–1)

Propose this minimal shape, and ask before creating it:

```
docs/knowledge/README.md     ← the index: one line per topic file, with what it covers
docs/knowledge/<topic>.md    ← grouped by topic, never one file per source
```

…and one line in the instruction file (create `CLAUDE.md` if the project has none, or append to
`AGENTS.md` if that is what it uses):

```
Before working on a topic, read docs/knowledge/README.md — it lists what we have learned and where.
```

That line is what makes the agent find the knowledge. Without it, the folder is invisible.

## 4 · A topic file's shape

```markdown
# <Topic>

## <Technique or rule, as a short imperative>

<What to do, in the project's terms. Why it helps. How to check it was done.>

Source: <title> — <url> (<author>, <date>, at mm:ss)
```
