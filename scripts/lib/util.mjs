// Shared plumbing: network with timeouts, temp work dirs, external tools, output.
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

export const UA = "Mozilla/5.0 (compatible; harvest/1.0; +https://github.com/stormcaps/harvest)";
/** Link-preview agent: several sites serve the full public caption to it, and nothing else. */
export const PREVIEW_UA = "facebookexternalhit/1.1";

/** Every network call has a deadline: a source that hangs must fail loudly, not stall the run. */
export async function fetchText(url, { ua = UA, timeout = 15000, headers = {} } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": ua, "Accept-Language": "en", ...headers },
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body, url: r.url, ms: Date.now() - t0, bytes: body.length };
  } catch (e) {
    const status = e.name === "TimeoutError" ? "timeout" : "network";
    return { ok: false, status, body: "", url, ms: Date.now() - t0, bytes: 0, error: e.message };
  }
}

export async function fetchJson(url, opts) {
  const r = await fetchText(url, opts);
  if (!r.ok) return { ...r, json: null };
  try {
    return { ...r, json: JSON.parse(r.body) };
  } catch {
    return { ...r, ok: false, status: "not-json", json: null };
  }
}

/* ── Work dirs ── everything heavy lives outside the user's project, and is deleted by clean. */

/**
 * `<plugin>/.work/`: a path the skills can name in their permission rules (`${CLAUDE_PLUGIN_ROOT}`),
 * so the agent may read a contact sheet or an extracted repo without a prompt — the OS temp dir
 * differs on every machine and cannot be written into a rule. Never inside the user's project.
 * Falls back to the OS temp dir when the plugin folder is read-only. HARVEST_WORK names a PARENT
 * folder: the work goes into its own `harvest/` child, because `clean --all` empties the work root
 * and must never empty a folder the user chose for something else.
 */
const PLUGIN_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function pickWorkRoot() {
  if (process.env.HARVEST_WORK) return join(process.env.HARVEST_WORK, "harvest");
  const inPlugin = join(PLUGIN_ROOT, ".work");
  try {
    mkdirSync(inPlugin, { recursive: true });
    accessSync(inPlugin, constants.W_OK);
    return inPlugin;
  } catch {
    return join(tmpdir(), "harvest");
  }
}

export const WORK_ROOT = pickWorkRoot();
const STALE_MS = 24 * 3600 * 1000;

export function workDir(key) {
  const d = join(WORK_ROOT, key.replace(/[^\w.-]+/g, "_"));
  mkdirSync(d, { recursive: true });
  return d;
}

export function sizeOf(p) {
  if (!existsSync(p)) return 0;
  const s = statSync(p);
  if (!s.isDirectory()) return s.size;
  return readdirSync(p).reduce((n, f) => n + sizeOf(join(p, f)), 0);
}

/** Deletes one work dir (or all of them) and returns the bytes freed. */
export function clean(key) {
  const target = key ? join(WORK_ROOT, key.replace(/[^\w.-]+/g, "_")) : WORK_ROOT;
  const bytes = sizeOf(target);
  rmSync(target, { recursive: true, force: true });
  return { path: target, bytes };
}

/** Work dirs left by an interrupted run are swept after 24 h, so a crash never leaks media. */
export function sweepStale(now = Date.now()) {
  if (!existsSync(WORK_ROOT)) return 0;
  let freed = 0;
  for (const d of readdirSync(WORK_ROOT)) {
    const p = join(WORK_ROOT, d);
    if (now - statSync(p).mtimeMs > STALE_MS) {
      freed += sizeOf(p);
      rmSync(p, { recursive: true, force: true });
    }
  }
  return freed;
}

/* ── External tools ── found on PATH, or through an explicit env override. */

const EXE = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

export function which(name) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    for (const ext of EXE) {
      const p = join(dir, name + ext);
      if (dir && existsSync(p) && statSync(p).isFile()) return p;
    }
  }
  return null;
}

export const TOOLS = {
  "yt-dlp": () => process.env.HARVEST_YTDLP || which("yt-dlp"),
  ffmpeg: () => process.env.HARVEST_FFMPEG || which("ffmpeg"),
  ffprobe: () => process.env.HARVEST_FFPROBE || which("ffprobe"),
  "whisper-cli": () => process.env.HARVEST_WHISPER || which("whisper-cli"),
  tar: () => which("tar"),
};

export function tool(name) {
  return TOOLS[name]();
}

/** Runs a tool without a shell: arguments are never re-parsed, so a URL cannot inject a command. */
export function run(bin, args, { cwd, timeout = 300000 } = {}) {
  const t0 = Date.now();
  const r = spawnSync(bin, args, { cwd, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return {
    ok: r.status === 0,
    code: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    ms: Date.now() - t0,
    error: r.error?.message,
  };
}

/* ── Text ── */

export const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  laquo: "«", raquo: "»", copy: "©", middot: "·", bull: "•",
};

/** A code point from a numeric entity; an out-of-range one (malformed HTML) stays as written. */
const codePoint = (n, raw) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw);

export function decodeEntities(s = "") {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePoint(+d, m))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function extractLinks(text = "") {
  return [...new Set(text.match(/https?:\/\/[^\s<>"'`)\]]+/g) ?? [])].map((u) => u.replace(/[.,;:!?]+$/, ""));
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function stamp(sec) {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${String(m).padStart(2, "0")}:${s}`;
}
