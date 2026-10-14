# Reading long content

A 40-minute video holds a few minutes of signal. Read at the right altitude, or the transcript
floods the context and the signal drowns in it.

## Transcripts

`H transcript` prints a transcript under ~12,000 characters directly. Longer ones stay on disk
(the path is printed): one line per 30-second paragraph, each starting with its `[mm:ss]` — so any
slice can be cited without the rest.

| Length | How to read |
| --- | --- |
| under 12 min | the printed transcript, in one pass |
| 12–30 min | the file in 3 slices by line range; note the items per slice, then synthesize |
| 30–60 min | 5–6 slices, one subagent per slice if available, then synthesize |
| over 60 min | 8–10 slices in parallel subagents, then synthesize |

Give every slice reader the same brief: the title, the project's current needs, the transcript
path and its line range, and the return shape — *items with exact quotes and timestamps, and
where the speaker changes topic*. A subagent refused the read gets its slice pasted instead. Chapters,
when the video has them, are a free map: read the chapters that match a need first.

Use `--bucket 60` for a coarser file on very long talks, `--lang <code>` to force a caption
language.

## Repositories

Read the README, then the inventory, then open in full the files whose idea we might lack — and
write how many you opened out of how many were listed. Over ~200 readable files, focus on the
inventory kinds that match the project's needs and tell the user what you skipped.

## Quoting

- Timestamps and post numbers come from the transcript or the API, never from memory.
- Quote exact words for anything you will act on. Paraphrase loses the condition that made the
  tip true.
- A transcript is automatic text: names and jargon are often wrong. Fix them from context (the
  frames, the caption, the links) and say so when the fix changes the meaning.

## Lenses

The default lens is **knowledge for this project**: items, verdicts, where they go. When the user
asks how a piece of content is *built* (a hook, a script, a talk to imitate), use the **structure
lens** instead: the opening lines quoted with the move they make; the real beats with timestamps;
the reusable skeleton with the seconds each beat gets.
