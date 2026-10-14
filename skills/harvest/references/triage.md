# Triage — what to keep, and why

The question is never "is this good?" but **"what does this help *this* project do better, and do
we already have it?"** Most of a harvest is sorting; say what you rejected as clearly as what you
kept.

## 1 · Start from the project's pain, not from the source

Before judging a single item, write down what the project struggles with now: the **pain signals**
`H profile` lists (README, docs and status lines that state a problem; TODO/FIXME), open issues, a
roadmap, recent fixes in `git log`, the user's own complaints in the conversation. Then read the items with one question: *which of these would help with that?*

> Judge an item by the **problem it solves**, never by the genre of what carries it. A repo called
> "clone any app" can be exactly the tool for "we can't reproduce our own mockups".

## 2 · Classify each item

| The item is… | What to establish |
| --- | --- |
| a tool, service, MCP server or plugin | its official source first (named without a link? find it). Already configured here? (`.mcp.json`, settings, package manifests) — same capability under another name? maintained? licence? |
| a repo | read it: `H read <github-url>` (inventory + audit). Read the README, then the files whose idea we might lack — and the **code** of its scripts, where the best mechanisms live |
| a technique or way of working | is the idea already written in our instructions, docs or skills? |
| a UI / UX pattern | do our design docs or components already handle it? |
| a prompt, skill, command or agent | do we have a similar one? Compare idea by idea |
| a security warning or audit | is the fault known here, and can we *see* it when it happens? |
| a number ("10× faster", "saves 80% tokens") | only true if verifiable — otherwise UNVERIFIED |

## 3 · Measure overlap — with a witness

Search the repo for the **idea**, not the source's wording: its key terms, synonyms, in English
and in the project's language. Record what you searched and where. A zero only counts when a
witness term near it does match — otherwise the search may simply be blind (wrong folder, wrong
language, generated files).

- Already said, entirely → duplicate: name the file.
- **Similar, with one or two useful differences → MERGE those differences into the existing
  document.** Never reject an item for being similar, and never add a second file next to the
  first.
- New → it may be ADOPTED.

## 4 · Look for something better, or smaller

- **A built-in may already do it.** Agent tools ship features fast; check the tool's current docs
  before adopting a workaround for something now native.
- **A better-maintained alternative** — name it, with the evidence (activity, adoption, scope).
- **Only a fraction is needed?** Implement that fraction in place, rewritten and attributed,
  instead of importing a whole plugin, package or framework. Ten lines you own beat a dependency
  you don't read.
- **A script in another language** is ported when the need exists. The need decides, never the
  language.
- **A whole method that would replace ours:** don't swap it in; extract the pieces we lack.

## 5 · One verdict per item

| Verdict | Means | Must carry |
| --- | --- | --- |
| **ADOPTED** | new and useful: written into the project, or — for anything to install — proposed and waiting for the user's yes | where it went (or the exact proposal), and the measured gap |
| **MERGED** | its differences folded into an existing document | which document, which differences |
| **DEFERRED** | useful, but not now — written where that day will find it (the doc that topic opens, or a tracked task) | the place |
| **REJECTED** | one of four reasons only: need absent (no current pain, no likely future use) · complete duplicate (file named) · risk (named) · pollution (adds state, files or commands with no use) | the reason |
| **UNVERIFIED** | not read in full, judged on a title, a claim that cannot be checked, a tier not climbed | what would settle it |

Knowledge for a component the project does not have *yet* is not "need absent": DEFER it into the
document that work will open (a design doc, a skill's reference), so it is there that day.

## 6 · Spend reading where the need is

Decide need before depth. An item whose need is clearly absent is REJECTED on that ground alone —
don't download, audit or read its repo to confirm it. Audits and deep reads are for candidates
(ADOPTED, MERGED or DEFERRED). Measured on a reel naming four plugins: auditing all four cost
109 MB of downloads for one candidate.

## 7 · Smells

- **Engagement bait** ("comment X to get the link"): the content is in the video, not the caption —
  climb to the transcript before judging.
- **Hype numbers** and screenshots of results: UNVERIFIED until measured on this project.
- **Sponsored or affiliate content:** say so in the report; it does not change the verdict rule.
- **A list of N tools:** each tool is its own item, triaged on its own.
