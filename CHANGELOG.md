# Changelog

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
