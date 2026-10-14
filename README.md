# Harvest

**Turn a link into knowledge your project keeps.** A Claude Code plugin that reads reels, videos,
threads, posts, repos and articles at the lowest possible cost, weighs every tip, tool and repo they
mention against what your project already has, audits anything before it is imported, and files
what is worth keeping where your agents will find it.

```
/harvest:instagram https://www.instagram.com/reel/…
```

A real run, on a small Vite app whose README says *"UI bugs are hard to debug, we only test by
hand in the browser"* — a 46-second reel whose caption only says "comment CODING for the links":

```
## Harvest — "Your Claude Code is running at 0/4 power" (Instagram reel, 2026-09-29)
Read: caption · local speech-to-text · contact sheet of 6 shots · 53 s · 4.1 MB fetched · 17.4 MB deleted

| Item                | Verdict                  | Why                                                        |
| Chrome DevTools MCP | ADOPTED, waiting for OK  | answers the README's pain; official repo audited: telemetry |
|                     |                          | on by default → proposed pinned, with --no-usage-statistics |
| Supabase plugin     | REJECTED                 | need absent: offline app, no database                       |
| Vercel plugin       | REJECTED                 | need absent: nothing deployed ("Versailles" in the speech)  |
| oh-my-claudecode    | REJECTED                 | need absent; owner read off the contact sheet, not audited  |

Nothing installed, nothing written. Comments not read, on purpose.
```

## Why

A 40-minute video holds a few minutes of signal; a reel's caption says "comment CODE for the
links"; a repo has 2,000 files and a `postinstall`. Reading all of it costs time and context, and
what you learn is lost unless it lands where the next session will read it. Harvest reads in
tiers, stops as soon as it has the content, and leaves only text behind.

## Install

In Claude Code:

```
/plugin marketplace add stormcaps/harvest
```

```
/plugin install harvest@harvest
```

Requires **Node.js 22+**. The text tier works with nothing else installed. Video sources need the
tools below — `/harvest:doctor` tells you what is missing on your machine.

| Tool | Unlocks | Windows | macOS | Linux |
| --- | --- | --- | --- | --- |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp#installation) | every video: descriptions, captions, audio, frames | `winget install yt-dlp.yt-dlp` (installs FFmpeg with it) | `brew install yt-dlp` | `pipx install yt-dlp` |
| [FFmpeg](https://ffmpeg.org/download.html) | contact sheets, kept frames, audio for speech-to-text | comes with yt-dlp above | `brew install ffmpeg` | your package manager |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | speech-to-text when a video has no captions (most reels) — runs locally, nothing is uploaded | `whisper-bin-x64.zip` from the [releases](https://github.com/ggml-org/whisper.cpp/releases), folder added to `PATH` | `brew install whisper-cpp` | [build it](https://github.com/ggml-org/whisper.cpp#quick-start) |
| a whisper model | what whisper.cpp runs | [`ggml-base.bin`](https://huggingface.co/ggerganov/whisper.cpp/tree/main) (142 MB, multilingual) in a `models/` folder beside `whisper-cli`, or `HARVEST_WHISPER_MODEL` set to its path | same | same |

YouTube needs a JavaScript runtime since yt-dlp 2025.11; Harvest hands yt-dlp the Node.js that is
already running, so Deno is optional. Set `GITHUB_TOKEN` to lift the anonymous GitHub API limit
(60 requests an hour).

## Commands

| Command | Reads |
| --- | --- |
| `/harvest:harvest <url>` | any link — detects the source. Also triggers on its own when you share a link and ask what is in it |
| `/harvest:instagram` | reels and posts: caption → speech → contact sheet; the picture of an image post |
| `/harvest:youtube` | videos and Shorts: description, chapters → captions → frames |
| `/harvest:tiktok` | caption → captions or speech → frames |
| `/harvest:x` | a post with the author's whole thread, the quoted post, X Articles, screenshots; video tiers |
| `/harvest:threads` | the first post from the public preview; the rest through a browser |
| `/harvest:bluesky` | the author's thread, link cards, image alt text and pictures, top replies |
| `/harvest:reddit` | a post and its top replies, share links included (about one read a minute) |
| `/harvest:hackernews` | the whole discussion tree, then the linked article |
| `/harvest:github` | a repo or gist: inventory, security audit, licence, changes since the last harvest |
| `/harvest:article` | blogs, newsletters, docs pages, dev.to — extracted locally |
| `/harvest:video` | Loom and the ~1,800 other sites yt-dlp supports |
| `/harvest:doctor` | which tools are installed, and what each missing one unlocks |

## How it works

**1 · Read at the lowest tier that captures the content.**

| Tier | What | Measured |
| --- | --- | --- |
| 0 · text | caption, post, thread, description, chapters, README | 0.1–2 s; a 12-post X thread in 1.4 s |
| 1 · captions | the speaker's own language, human captions before automatic ones, compressed into timestamped 30-second paragraphs | an 18-min video in 9 s, 19 KB of text |
| 2 · speech | local speech-to-text when there are no captions | a 46 s reel in 12 s on a laptop CPU |
| 3 · images & screen | the pictures of a post; or **one** contact sheet of a video — shots at scene cuts, evenly spaced for screen recordings | a sheet in about 6 s for a 46 s reel |
| 4 · browser | your agent's browser tool, page text only — for login walls and pages built by script | when the above fail |

Media is downloaded at the lowest usable resolution into the plugin's own `.work/` folder — never
into your project — and **deleted** at the end of the harvest, with the bytes reported. Leftovers
of an interrupted run are swept after 24 h. By default no image is kept; a link and a timestamp
let you go back. One or two frames are kept, as small WebP files, only when a visual cannot be put
into words.

**2 · Triage every item** against the project's stated pains (its README, status files, TODOs) and
what it already has. Overlap is measured, not assumed: "we already have it" names the file; "we
don't" states what was searched. Each item gets one verdict:

- **ADOPTED** — new and useful: written into the project, or proposed for install and waiting for your yes
- **MERGED** — its differences folded into an existing document, never a second file beside it
- **DEFERRED** — useful later, written where that work will find it
- **REJECTED** — need absent, complete duplicate, risk, or pollution — always named
- **UNVERIFIED** — not fully read, a claim that cannot be checked, or a tier not climbed

It looks for a better or smaller alternative too: a built-in feature, a better-maintained tool, or
the ten lines you actually need, rewritten in place instead of a whole dependency. Reading is spent
where the need is: an item with no use for the project is not downloaded to be audited.

**3 · Audit before anything runs.** Plugins, MCP servers, packages, skills, hooks and scripts are
scanned for load-time commands, hooks, install scripts, `curl | sh`, credential reads, unpinned or
remote MCP servers (read as JSON, not grepped), hidden Unicode, prompt injection, prebuilt binaries
and the hosts the code talks to. Findings in tests and build files weigh less; files too big to
scan are listed, never skipped silently. The licence decides what can be copied and what can only
be reused as an idea. Nothing is installed without your yes.

**4 · File it where your agents will look.** Harvest profiles the repository first:

| Level | The repo has | Knowledge goes |
| --- | --- | --- |
| 0 | nothing | a small `docs/knowledge/` with an index, plus one line in `CLAUDE.md` so the agent finds it (asked first) |
| 1 | an instruction file | one-line rules there; the detail in `docs/knowledge/` |
| 2 | structured docs, decision records | into the doc that covers the topic, its index, a decision record |
| 3 | skills, libraries, several repos | merged into the skill or library that owns the topic, upstream when shared |

A project that documents its own intake process is followed instead. Every kept item carries its
source line (URL, author, date, timestamp) — which is also how the next harvest knows it was
already read.

## Privacy

Harvest only contacts the site you give it and the public endpoints that serve it: the site's own
pages, oEmbed and media CDN, [FxTwitter](https://github.com/FxEmbed/FxEmbed) for X, the Bluesky
public API, the Reddit feed, the Algolia Hacker News API, the GitHub API and `codeload.github.com`,
and whatever yt-dlp contacts for a video. Articles are extracted locally; no third-party reader
service is used. Speech-to-text runs on your machine. It never logs in, posts, comments or likes.

## Limits

Measured on 2026-10-13 and 14 — platforms change, and so may these.

- **Reddit** answers about one anonymous read a minute; a burst gets a 429 and the skill waits or
  uses a browser.
- **Threads** previews give the first post only. **LinkedIn** posts and **Vimeo** videos need a
  login.
- **Instagram carousels** preview their first slide only; the others are read through a browser.
- **Automatic text** — captions or speech-to-text — mangles names and jargon ("Versailles" for
  Vercel). The skill corrects from context and flags it; quotes from it deserve a second look.
- If a video source fails, update yt-dlp first.

## Command-line use

The skills drive a dependency-free Node.js script you can also run from a terminal or any agent:

```
node scripts/harvest.mjs read <url>
```

`read` · `transcript` · `frames` · `images` · `keep-frame` · `clean` · `audit` · `profile` ·
`detect` · `guide` · `doctor` — run it without arguments for the full usage. `HARVEST_WORK` moves
the work folder under another parent directory.

## Development

```
npm test
```

```
.claude-plugin/   plugin and marketplace manifests
skills/harvest/   the method: SKILL.md + references (triage, security, integrate, reading)
skills/<source>/  one command per source, with what is specific to it
scripts/          the CLI and its modules — Node.js only, no dependencies
test/             offline tests on synthetic fixtures
```

Tests never touch the network. A new source is welcome as an issue first, with the public
endpoint it would use and a measurement of what it returns.

**Releasing:** bump `version` in `.claude-plugin/plugin.json` and add a `CHANGELOG.md` entry with
every published change. Claude Code updates an installed plugin only when that version changes —
commits alone never reach users.

## License

[MIT](LICENSE)
