#!/usr/bin/env node
// harvest — the mechanical half of a harvest. It fetches, compresses, measures and cleans;
// deciding what is worth keeping belongs to the agent running the skill.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { detect, SOURCES } from "./lib/detect.mjs";
import { clean, fmtBytes, sweepStale, workDir, WORK_ROOT } from "./lib/util.mjs";
import { youtube, tiktok, video } from "./lib/sources/video.mjs";
import { instagram, threads } from "./lib/sources/meta.mjs";
import { x } from "./lib/sources/x.mjs";
import { bluesky, reddit, hackernews } from "./lib/sources/forums.mjs";
import { article, gist } from "./lib/sources/article.mjs";
import { github } from "./lib/sources/github.mjs";
import { transcript, frames, keepFrame, images } from "./lib/media.mjs";
import { audit } from "./lib/audit.mjs";
import { profile, findMentions } from "./lib/profile.mjs";
import { doctor, renderDoctor } from "./lib/doctor.mjs";
import { render, renderAudit } from "./lib/render.mjs";

const READERS = { youtube, tiktok, video, instagram, threads, x, bluesky, reddit, hackernews, article, gist, github };

const USAGE = `harvest — turn a link into text an agent can use

  read <url> [--json] [--since <sha>]   tier 0: text, metadata, links (any source)
  transcript <url> [--lang xx] [--no-audio] [--bucket 30]
                                        tier 1-2: captions, else local speech-to-text
  frames <url> [--max 12]               tier 3: one contact sheet (JPEG) of the key instants
  images <post-url>                     the pictures of an X, Bluesky, Threads or Instagram post
  keep-frame <url> <seconds> [dest.webp]  one frame as a WebP (default: in the work folder)
  clean [<url>|--all]                   delete what a harvest downloaded; prints the bytes freed
  audit <path>                          static security audit before importing anything
  profile [<dir>] [--find <url>]        where knowledge belongs in this repo; was it harvested?
  detect <url>                          which source a link is
  guide <name>                          the method and its references: method, triage, security,
                                        integrate, reading, or a source name
  doctor                                installed tools, and what each missing one unlocks`;

function parse(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && !["json", "all", "no-audio"].includes(k)) flags[k] = argv[++i];
      else flags[k] = true;
    } else pos.push(a);
  }
  return { cmd: pos[0], args: pos.slice(1), flags };
}

/** A link the user gave, checked: every command but detect refuses what is not a URL. */
function link(raw) {
  const d = detect(raw ?? "");
  if (!d.source) throw new Error(d.error ?? "missing URL");
  return d;
}

/** A numeric flag, or its default when absent or not a number. */
const num = (v, dflt) => (Number.isFinite(+v) && +v > 0 ? +v : dflt);

const keyOf = (d) => `${d.source}-${String(d.id).replace(/^https?:\/\//, "").slice(0, 80)}`;

async function main(argv) {
  const { cmd, args, flags } = parse(argv);
  const swept = sweepStale();
  const json = (o) => console.log(JSON.stringify(o, null, 2));
  const need = (n) => {
    if (args.length < n) {
      console.error(USAGE);
      process.exit(2);
    }
  };
  switch (cmd) {
    case "detect": {
      need(1);
      return json(detect(args[0]));
    }
    case "read": {
      need(1);
      const d = link(args[0]);
      const r = await READERS[d.source](d, { since: flags.since });
      if (swept) r.notes = [...(r.notes ?? []), `swept ${fmtBytes(swept)} left by an interrupted harvest`];
      if (flags.json) return json(r);
      console.log(render(r));
      if (r.error) process.exitCode = 1;
      return;
    }
    case "transcript": {
      need(1);
      const d = link(args[0]);
      const r = transcript(d.url, keyOf(d), { lang: flags.lang, audio: flags["no-audio"] ? "never" : "auto", bucket: num(flags.bucket, 30) });
      if (flags.json) return json(r);
      if (!r.ok) {
        console.log(`✗ ${r.error}`);
        process.exitCode = 1;
        return;
      }
      console.log(
        `# Transcript — ${r.via}${r.lang ? ` (${r.lang})` : ""}${r.translated ? " — MACHINE-TRANSLATED, quote with care" : ""}${r.model ? ` · model ${r.model}` : ""}`,
        `\n${r.lines} lines · ${r.chars} chars · saved at ${r.path}`,
        r.via !== "captions" ? "\nAutomatic text: names and jargon may be mangled — correct from context, flag it when a mangled word carries the point." : "",
        r.text ? `\n\n${r.text}` : `\n\nToo long to print whole (> 12,000 chars). Read it by line ranges — see the reading guide in the skill.`,
      );
      return;
    }
    case "frames": {
      need(1);
      const d = link(args[0]);
      const r = frames(d.url, keyOf(d), { max: Math.max(4, Math.min(16, num(flags.max, 12))) });
      if (flags.json || !r.ok) return r.ok ? json(r) : (console.log(`✗ ${r.error}`), (process.exitCode = 1));
      console.log(
        `# Contact sheet — ${r.mode === "cuts" ? `${r.instants.length} shots from ${r.cutsDetected} detected cuts` : `${r.instants.length} evenly spaced instants (no clear cuts: screen recording or continuous motion)`}`,
        `\nsheet: ${r.sheet} (${fmtBytes(r.sheetBytes)}) · ${r.grid}`,
        `\ninstants: ${r.instants.join(" · ")}`,
        `\nvideo: ${r.duration} s, ${fmtBytes(r.videoBytes)} in the work folder — run clean when done`,
      );
      return;
    }
    case "images": {
      need(1);
      const d = link(args[0]);
      const post = await READERS[d.source](d, {});
      if (post.error) throw new Error(post.error);
      const photos = post.media?.photos ?? [];
      if (!photos.length) {
        console.log("no images in this post");
        return;
      }
      const r = await images(photos, keyOf(d));
      for (const x of r.images) console.log(x.path ? `${x.path} (${fmtBytes(x.bytes)})` : `✗ ${x.url} — ${x.error}`);
      if (r.skipped) console.log(`${r.skipped} more not downloaded (cap: 8)`);
      console.log("Read each image, then run clean on the post URL.");
      if (!r.ok) process.exitCode = 1;
      return;
    }
    case "keep-frame": {
      need(2);
      const d = link(args[0]);
      const sec = parseFloat(args[1]);
      if (!Number.isFinite(sec) || sec < 0) throw new Error(`not a time in seconds: ${args[1]}`);
      const dest = args[2] ? resolve(args[2]) : join(workDir(keyOf(d)), `frame-${sec}s.webp`);
      const r = keepFrame(d.url, keyOf(d), sec, dest);
      return r.ok ? console.log(`kept ${r.path} (${fmtBytes(r.bytes)})${r.note ? ` — ${r.note}` : ""}`) : (console.log(`✗ ${r.error}`), (process.exitCode = 1));
    }
    case "clean": {
      const d = args[0] && !flags.all ? link(args[0]) : null;
      const r = d ? clean(keyOf(d)) : clean();
      const gh = d?.source === "github" ? cleanGithub(d.id) : 0;
      console.log(`deleted ${fmtBytes(r.bytes + gh)} from the work folder (${r.path})`);
      return;
    }
    case "audit": {
      need(1);
      const a = audit(resolve(args[0]));
      return flags.json ? json(a) : console.log(renderAudit(a));
    }
    case "profile": {
      const root = resolve(args[0] ?? ".");
      if (flags.find) {
        const d = detect(flags.find);
        const needles = [flags.find, d.url, d.id].filter((v, i, s) => v && s.indexOf(v) === i);
        return json({ needles, hits: findMentions(root, needles) });
      }
      return json(profile(root));
    }
    case "guide": {
      need(1);
      const g = guide(args[0]);
      if (!g) {
        console.error(`no guide "${args[0]}" — one of: method, ${GUIDES.join(", ")}, ${SOURCES.filter((s) => s !== "gist").join(", ")}`);
        process.exitCode = 2;
        return;
      }
      return console.log(g);
    }
    case "doctor": {
      const d = doctor();
      return flags.json ? json(d) : console.log(renderDoctor(d));
    }
    default:
      console.log(USAGE);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 2;
  }
}

/**
 * The skill's reference pages, printed. Reading them through this script needs no extra
 * permission: Claude Code asks before reading files outside the project, and a plugin always
 * lives outside it — measured on 2026-10-13, every Read of a plugin file was refused in -p mode.
 */
const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GUIDES = ["triage", "security", "integrate", "reading"];

function guide(name) {
  const file =
    name === "method"
      ? join(PLUGIN_ROOT, "skills", "harvest", "SKILL.md")
      : GUIDES.includes(name)
        ? join(PLUGIN_ROOT, "skills", "harvest", "references", `${name}.md`)
        : SOURCES.includes(name) && name !== "gist"
          ? join(PLUGIN_ROOT, "skills", name, "SKILL.md")
          : null;
  if (!file || !existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", PLUGIN_ROOT.replaceAll("\\", "/"))
    .replaceAll("$ARGUMENTS", "the link(s) you were given");
}

/** GitHub work dirs carry the commit in their name; clean every one for this repo. */
function cleanGithub(id) {
  const prefix = `github-${id}`.replace(/[^\w.-]+/g, "_");
  let n = 0;
  try {
    for (const d of readdirSync(WORK_ROOT).filter((x) => x.startsWith(prefix))) n += clean(d).bytes;
  } catch {
    /* no work root: nothing to clean */
  }
  return n;
}

main(process.argv.slice(2)).catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
