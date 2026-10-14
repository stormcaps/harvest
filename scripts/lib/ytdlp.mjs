// yt-dlp wrapper. One binary reads YouTube, TikTok, Instagram, X, Reddit, LinkedIn, Vimeo, Loom
// and ~1,800 other sites, so every video tier goes through here.
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run, tool, which } from "./util.mjs";

/**
 * YouTube needs a JavaScript runtime since yt-dlp 2025.11. yt-dlp only enables Deno by default;
 * Node is already running this script, so we hand it over and Deno becomes optional.
 */
function runtimeArgs() {
  return which("deno") ? [] : ["--js-runtimes", `node:${process.execPath}`];
}

const BASE = ["--no-warnings", "--no-progress", "--no-playlist", "--ignore-config"];

export function available() {
  return Boolean(tool("yt-dlp"));
}

export function ytdlp(args, opts) {
  const bin = tool("yt-dlp");
  if (!bin) return { ok: false, missing: "yt-dlp", stderr: "yt-dlp not found" };
  return run(bin, [...BASE, ...runtimeArgs(), ...args], opts);
}

/**
 * Metadata in memory. With a work dir, it is also cached there so the next tier reuses it with
 * --load-info-json instead of extracting the page again (measured on an 18-min YouTube video: 30 s → 9 s).
 */
export function info(url, dir) {
  const r = ytdlp(["-J", "--skip-download", "--", url], { timeout: 120000 });
  if (!r.ok) return { ok: false, error: lastLine(r.stderr) || r.error || "yt-dlp failed", missing: r.missing };
  try {
    const json = JSON.parse(r.stdout);
    if (dir) writeFileSync(join(dir, "info.json"), r.stdout);
    return { ok: true, json, ms: r.ms };
  } catch {
    return { ok: false, error: "yt-dlp returned no JSON" };
  }
}

/** The cached extraction when an earlier tier made one within the hour (its media URLs are signed and expire). */
function source(url, dir) {
  const f = join(dir, "info.json");
  // "--" ends the options: whatever the URL looks like, yt-dlp cannot read it as a flag.
  return existsSync(f) && Date.now() - statSync(f).mtimeMs < 3600000 ? ["--load-info-json", f] : ["--", url];
}

export function lastLine(s = "") {
  return s.trim().split("\n").filter(Boolean).pop()?.replace(/^ERROR:\s*/, "") ?? "";
}

/** The caption track to read: the speaker's own language first, human captions before automatic ones. */
export function pickCaptions(j, want) {
  const manual = Object.keys(j.subtitles ?? {}).filter((k) => k !== "live_chat");
  const auto = Object.keys(j.automatic_captions ?? {});
  const orig = j.language?.split("-")[0];
  const order = [];
  for (const lang of [want, orig, "en"].filter(Boolean)) {
    order.push(...manual.filter((k) => k === lang || k.startsWith(lang + "-")).map((k) => ({ lang: k, auto: false })));
    order.push(...auto.filter((k) => k === `${lang}-orig`).map((k) => ({ lang: k, auto: true })));
    order.push(...auto.filter((k) => k === lang).map((k) => ({ lang: k, auto: true })));
  }
  if (manual.length) order.push({ lang: manual[0], auto: false });
  // An auto track not tied to a language we asked for is a machine translation: last resort, and said so.
  const origAuto = auto.find((k) => k === "en-orig") ?? auto.find((k) => k.endsWith("-orig"));
  if (origAuto) order.push({ lang: origAuto, auto: true });
  const pick = order[0] ?? null;
  return pick && { ...pick, translated: Boolean(pick.auto && !pick.lang.endsWith("-orig") && orig && !pick.lang.startsWith(orig)) };
}

export function downloadCaptions(url, track, dir) {
  const r = ytdlp(
    [
      "--skip-download",
      track.auto ? "--write-auto-subs" : "--write-subs",
      "--sub-langs",
      track.lang,
      "--sub-format",
      "vtt/best",
      "-o",
      join(dir, "captions.%(ext)s"),
      ...source(url, dir),
    ],
    { timeout: 120000 },
  );
  return r;
}

/** Smallest stream that still carries the content: audio for speech, low-res video for frames. */
export function downloadAudio(url, dir) {
  return ytdlp(["-f", "ba/b", "-S", "+size,+br,+res", "-o", join(dir, "audio.%(ext)s"), ...source(url, dir)], { timeout: 300000 });
}

export function downloadVideo(url, dir) {
  // The smallest stream near 480p: on-screen text stays readable on a 320-px frame. Measured on a
  // 46 s reel: 540×960, 786 KB (the first format choice downloaded 8.2 MB).
  return ytdlp(["-f", "bv*/b", "-S", "+res:480,+size,+br", "-o", join(dir, "video.%(ext)s"), ...source(url, dir)], {
    timeout: 300000,
  });
}

export function toMeta(j) {
  const d = j.upload_date;
  return {
    title: j.title ?? null,
    author: j.channel ?? j.uploader ?? j.creator ?? null,
    date: d ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null,
    text: j.description ?? "",
    duration: j.duration ?? null,
    language: j.language ?? null,
    chapters: (j.chapters ?? []).map((c) => ({ t: c.start_time, title: c.title })),
    stats: { views: j.view_count, likes: j.like_count, comments: j.comment_count },
    captions: {
      manual: Object.keys(j.subtitles ?? {}).filter((k) => k !== "live_chat"),
      auto: Object.keys(j.automatic_captions ?? {}).filter((k) => k.split("-")[0] === j.language?.split("-")[0] && (k.endsWith("-orig") || !k.includes("-"))),
    },
  };
}
