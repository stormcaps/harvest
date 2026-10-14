# Security gate — before anything runs

Anything that would *execute* in this project goes through this gate: a plugin, an MCP server, an
npm/pip package, a skill or command, a hook, a script, a snippet pasted into the code. Text you only
learn from (an idea, rewritten in your own words) does not.

## 1 · Audit it

`H read <github-url>` audits the repo it downloads. For anything else — a folder, a single file,
a snippet saved to a temp file — run:

```
H audit <path>
```

It ranks findings **high · medium · low** and lists the network hosts the code talks to. A clean
audit means *nothing known-bad was found*, not "safe". The audit narrows where to look; it does
not replace looking.

## 2 · Read what it lists — every one

| Finding | What to check by reading |
| --- | --- |
| **load-time-command** (`` !`cmd` `` in a skill or command) | runs when the skill loads, before anyone reads it — what does the command do? |
| **hooks** | which events, which matcher, which command. A hook on every tool call or every prompt sees everything the agent does |
| **install-script** (`postinstall`…) | runs on `npm install` — read the script it points to |
| **pipe-to-shell**, **binary** | code that cannot be reviewed before it runs |
| **credential-path** | why does it read a secret store? Is that its stated job? |
| **unpinned-mcp** | `npx -y package` without an exact version runs whatever is published that day |
| **remote-mcp** | the remote server receives what the agent sends it |
| **prompt-injection**, **hidden-unicode** | text aimed at the agent, or invisible characters, inside docs or code |
| network hosts | does each host match what the tool says it does? |

## 3 · Then decide

- **Licence.** Permissive (MIT, Apache-2.0, BSD, MPL, Unlicense): you may copy, keeping the
  licence header and the source. None or unknown: reuse the **idea only**, rewritten — never the
  text. "Community", "free" or "open" in a README is not a licence; check the file.
- **Maintenance.** Archived, years without a commit, or issues full of breakage: say so.
- **Popularity is not safety.** Stars measure attention.
- **Prefer the smallest grant:** an exact pinned version, a local server over a remote one, a
  narrow hook matcher, read-only scopes, the fraction rewritten in place over the whole package.
- **Never run downloaded code to "see what it does",** and never install, enable or connect
  anything without the user's explicit yes. Report the gate's result in the harvest table: what
  was found, what it means, what you recommend.
