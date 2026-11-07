# Changelog

## 1.0.3 — 2026-11-07

- The `hidden-unicode` audit rule now sees the invisible characters it used to miss: zero-width
  joiners and non-joiners (U+200C, U+200D), the Mongolian vowel separator (U+180E), variation
  selectors (U+FE00–U+FE0F) and ideographic variation selectors (U+E0100–U+E01EF). A run of
  variation selectors is the usual way to smuggle bytes into text that renders as nothing.
- These characters are also needed by real text, so each is flagged only outside the context that
  needs it: emoji sequences, keycaps, Persian, Arabic, Devanagari, Han and Mongolian stay quiet. A
  run of joiners is always flagged.
- Measured before release on about 9,000 text files of real multilingual projects (French,
  Arabic, emoji-heavy docs): no new flag on prose. The only new flags were variation selectors
  pasted as literal characters inside regular expressions in code, which a reader cannot see.
  The soft hyphen (U+00AD) was left out: it shows up in published translations.
- Two new tests, built from code points so the test file itself carries no invisible character.

## 1.0.2 — 2026-11-06

- Several links in one request: each link now gets the full harvest it would get alone, with
  no lighter pass for the later ones and no stop to ask how to split the work. The skill says
  when to run them one after another (the default, or when they may land in the same files) and
  when to hand them to parallel workers (independent links, a heavy session), and what is never
  acceptable: one combined skim, a shared triage table, "the rest later".

## 1.0.1 — 2026-10-14

- GitHub is read anonymously: the plugin no longer reads a GitHub token from the
  environment. A plugin should not take a credential it was not given and send it to a server;
  60 API requests an hour is two per repository read.
- README: one-command install, the sources table, a real run as the demo image, a comparison,
  the complete list of what the plugin contacts and starts, and an FAQ.

## 1.0.0 — 2026-10-14

First release.

- One method skill (`/harvest:harvest`) and one command per source: Instagram, YouTube, TikTok, X,
  Threads, Bluesky, Reddit, Hacker News, GitHub (repos and gists), articles, any yt-dlp video.
- Tiered reading: text → captions → local speech-to-text → post images or one contact sheet →
  browser. Method guides are printed by the CLI (`guide`), so no extra file permission is needed.
  Media stays in the plugin's work folder, outside the project, and is deleted with the bytes reported.
- Triage with five verdicts, a security audit before any import, and integration that adapts to
  the repository's level of structure.
- Dependency-free Node.js CLI (`scripts/harvest.mjs`), offline test suite, CI on Linux, macOS and
  Windows.
