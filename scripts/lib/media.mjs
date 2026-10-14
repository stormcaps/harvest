// Tiers 1-3 for anything with a video: captions → local speech-to-text → one contact sheet.
// Media lands in the work folder (util.mjs) and is deleted by `clean`; only text leaves this module.
import { existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { availableParallelism } from "node:os";
import { run, tool, workDir, sizeOf, stamp, UA } from "./util.mjs";
import { compressVtt } from "./vtt.mjs";
import { info, pickCaptions, downloadCaptions, downloadAudio, downloadVideo, lastLine } from "./ytdlp.mjs";

/** Above this, the transcript stays on disk and the agent reads it in slices (see reading.md). */
export const INLINE_CHARS = 12000;

/** A finished download only: an interrupted one leaves `.part` / `.ytdl` files behind. */
const find = (dir, re) => readdirSync(dir).find((f) => re.test(f) && !/\.(part|ytdl)$/.test(f));

function finish(dir, lines, extra) {
  const text = lines.join("\n");
  const path = join(dir, "transcript.txt");
  writeFileSync(path, text + "\n");
  return { ok: true, lines: lines.length, chars: text.length, path, text: text.length <= INLINE_CHARS ? text : null, ...extra };
}

export function whisperModel() {
  if (process.env.HARVEST_WHISPER_MODEL) return process.env.HARVEST_WHISPER_MODEL;
  const cli = tool("whisper-cli");
  if (!cli) return null;
  // Convention: a models/ folder next to the binary, or one level up (the release zip layout).
  for (const d of [join(cli, "..", "models"), join(cli, "..", "..", "models")]) {
    if (!existsSync(d)) continue;
    const m = readdirSync(d)
      .filter((f) => /^ggml-.+\.bin$/.test(f) && !/silero|vad/.test(f))
      .sort((a, b) => rank(a) - rank(b))[0];
    if (m) return join(d, m);
  }
  return null;
}
const rank = (f) => ["small", "base", "medium", "turbo", "large", "tiny"].findIndex((k) => f.includes(k)) >>> 0;

/** Tier 1 (captions) and, when allowed, tier 2 (local speech-to-text). */
export function transcript(url, key, { lang, audio = "auto", bucket = 30 } = {}) {
  const dir = workDir(key);
  const meta = info(url, dir);
  if (!meta.ok) return { ok: false, error: meta.error, missing: meta.missing };
  const track = pickCaptions(meta.json, lang);
  if (track) {
    const r = downloadCaptions(url, track, dir);
    const f = find(dir, /^captions\..+\.vtt$/);
    if (f) {
      const lines = compressVtt(readFileSync(join(dir, f), "utf8"), bucket);
      rmSync(join(dir, f));
      if (lines.length) return finish(dir, lines, { via: track.auto ? "auto-captions" : "captions", lang: track.lang, translated: track.translated, workdir: dir });
    } else if (audio === "never") return { ok: false, error: `caption download failed: ${lastLine(r.stderr)}` };
  }
  if (audio === "never") return { ok: false, error: "no captions for this video", captions: false };
  return speechToText(url, dir, { lang, bucket });
}

export function speechToText(url, dir, { lang, bucket = 30 } = {}) {
  const cli = tool("whisper-cli");
  const model = whisperModel();
  const ffmpeg = tool("ffmpeg");
  const missing = [!cli && "whisper-cli", !model && "a whisper model (ggml-*.bin)", !ffmpeg && "ffmpeg"].filter(Boolean);
  if (missing.length) return { ok: false, captions: false, error: `no captions, and local speech-to-text needs: ${missing.join(", ")} (run doctor)` };
  const dl = downloadAudio(url, dir);
  const a = find(dir, /^audio\./);
  if (!a) return { ok: false, error: `audio download failed: ${lastLine(dl.stderr)}` };
  const wav = join(dir, "audio.wav");
  const audioBytes = sizeOf(join(dir, a));
  const c = run(ffmpeg, ["-v", "error", "-y", "-i", join(dir, a), "-ar", "16000", "-ac", "1", wav]);
  rmSync(join(dir, a), { force: true });
  if (!c.ok) return { ok: false, error: `ffmpeg: ${c.stderr.trim()}` };
  const threads = String(Math.max(2, Math.min(8, availableParallelism() - 1)));
  const w = run(cli, ["-m", model, "-f", wav, "-l", lang ?? "auto", "-t", threads, "-ovtt", "-of", join(dir, "speech"), "-np"], { timeout: 900000 });
  rmSync(wav, { force: true });
  const vtt = join(dir, "speech.vtt");
  if (!w.ok || !existsSync(vtt)) return { ok: false, error: `whisper-cli: ${lastLine(w.stderr) || w.error}` };
  const lines = compressVtt(readFileSync(vtt, "utf8"), bucket);
  rmSync(vtt);
  return finish(dir, lines, { via: "speech-to-text", model: model.split(/[\\/]/).pop(), audioBytes, ms: w.ms, workdir: dir });
}

/* ── Images of a post: downloaded only to be read, then cleaned with the rest. ── */

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function images(photos, key) {
  const dir = workDir(key);
  const out = [];
  for (const [i, u] of photos.slice(0, MAX_IMAGES).entries()) {
    try {
      const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      const type = r.headers.get("content-type") ?? "";
      if (!r.ok || !type.startsWith("image/")) {
        out.push({ url: u, error: `HTTP ${r.status} ${type}` });
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) {
        out.push({ url: u, error: `${buf.length} bytes, over the 5 MB cap` });
        continue;
      }
      const ext = (type.split("/")[1] ?? "img").replace("jpeg", "jpg").replace(/[^\w]/g, "");
      const path = join(dir, `image-${String(i + 1).padStart(2, "0")}.${ext}`);
      writeFileSync(path, buf);
      out.push({ url: u, path, bytes: buf.length });
    } catch (e) {
      out.push({ url: u, error: e.message });
    }
  }
  return { ok: out.some((x) => x.path), images: out, skipped: Math.max(0, photos.length - MAX_IMAGES) };
}

/* ── Tier 3: one contact sheet instead of N screenshots. ── */

const SHEET_COLS = 4;
const FRAME_W = 320;

function ensureVideo(url, dir) {
  let v = find(dir, /^video\./);
  if (v) return { path: join(dir, v) };
  const r = downloadVideo(url, dir);
  v = find(dir, /^video\./);
  return v ? { path: join(dir, v), bytes: sizeOf(join(dir, v)) } : { error: `video download failed: ${lastLine(r.stderr)}` };
}

function duration(file) {
  const r = run(tool("ffprobe") ?? tool("ffmpeg"), tool("ffprobe") ? ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file] : ["-i", file]);
  const d = parseFloat(r.stdout) || parseFloat(/Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr)?.slice(1).reduce((s, x, i) => s + x * [3600, 60, 1][i], 0));
  return d || null;
}

/**
 * Picks the instants worth seeing. Hard cuts first (scene score), spaced at least 1/40 of the
 * video apart; a screen recording or an animated UI has no hard cut, so under 4 cuts we fall
 * back to evenly spaced instants and say so — a sheet of one frame would hide that silently.
 */
export function chooseInstants(cuts, dur, max) {
  const gap = Math.max(1, dur / 40);
  const picked = [];
  for (const c of [...cuts].sort((a, b) => b.score - a.score)) {
    if (picked.length >= max - 1) break;
    if (picked.every((t) => Math.abs(t - c.t) >= gap)) picked.push(c.t);
  }
  if (picked.length < 3) return { mode: "even", at: Array.from({ length: max }, (_, i) => +(((i + 0.5) * dur) / max).toFixed(2)) };
  // Show each shot slightly after its cut, plus the opening frame.
  const at = [Math.min(0.5, dur / 2), ...picked.map((t) => Math.min(t + 0.4, dur - 0.1))].sort((a, b) => a - b);
  return { mode: "cuts", at: at.map((t) => +t.toFixed(2)) };
}

export function frames(url, key, { max = 12 } = {}) {
  const ffmpeg = tool("ffmpeg");
  if (!ffmpeg) return { ok: false, error: "ffmpeg not found (run doctor)" };
  const dir = workDir(key);
  const v = ensureVideo(url, dir);
  if (v.error) return { ok: false, error: v.error };
  const dur = duration(v.path);
  if (!dur) return { ok: false, error: "cannot read the video duration" };
  const s = run(ffmpeg, ["-hide_banner", "-i", v.path, "-vf", "scale=160:-2,select='gt(scene,0.08)',metadata=print:file=-", "-an", "-f", "null", "-"]);
  const cuts = [...s.stdout.matchAll(/pts_time:([\d.]+)[\s\S]*?scene_score=([\d.]+)/g)].map((m) => ({ t: +m[1], score: +m[2] }));
  const plan = chooseInstants(cuts, dur, max);
  for (const f of readdirSync(dir).filter((n) => /^f\d+\.jpg$/.test(n))) rmSync(join(dir, f));
  plan.at.forEach((t, i) => {
    run(ffmpeg, ["-v", "error", "-y", "-ss", String(t), "-i", v.path, "-frames:v", "1", "-vf", `scale=${FRAME_W}:-2`, "-q:v", "4", join(dir, `f${String(i).padStart(2, "0")}.jpg`)]);
  });
  const n = readdirSync(dir).filter((f) => /^f\d+\.jpg$/.test(f)).length;
  const rows = Math.ceil(n / SHEET_COLS);
  const sheet = join(dir, "sheet.jpg");
  const t = run(ffmpeg, ["-v", "error", "-y", "-framerate", "1", "-i", join(dir, "f%02d.jpg"), "-vf", `tile=${SHEET_COLS}x${rows}:padding=4:color=black`, "-frames:v", "1", "-q:v", "5", sheet]);
  for (const f of readdirSync(dir).filter((x) => /^f\d+\.jpg$/.test(x))) rmSync(join(dir, f));
  if (!t.ok) return { ok: false, error: `ffmpeg tile: ${t.stderr.trim()}` };
  return {
    ok: true,
    sheet,
    sheetBytes: sizeOf(sheet),
    mode: plan.mode,
    cutsDetected: cuts.length,
    duration: +dur.toFixed(1),
    grid: `${SHEET_COLS} columns × ${rows} rows, read left→right, top→bottom`,
    instants: plan.at.map((x) => stamp(x)),
    videoBytes: v.bytes ?? sizeOf(v.path),
    workdir: dir,
  };
}

const KEEP_MAX = 120 * 1024;

/**
 * Keeps ONE frame as a small WebP, for the rare image that text cannot replace. An FFmpeg built
 * without libwebp gets a JPEG beside the requested name instead — said in the result.
 */
export function keepFrame(url, key, seconds, dest) {
  const ffmpeg = tool("ffmpeg");
  if (!ffmpeg) return { ok: false, error: "ffmpeg not found (run doctor)" };
  const dir = workDir(key);
  const v = ensureVideo(url, dir);
  if (v.error) return { ok: false, error: v.error };
  const grab = (out, codec) => ["-v", "error", "-y", "-ss", String(seconds), "-i", v.path, "-frames:v", "1", "-vf", "scale='min(960,iw)':-2", ...codec, out];
  for (const q of [70, 50, 35]) {
    const r = run(ffmpeg, grab(dest, ["-c:v", "libwebp", "-quality", String(q)]));
    if (!r.ok) {
      if (!/libwebp|Unknown encoder/i.test(r.stderr)) return { ok: false, error: `ffmpeg: ${r.stderr.trim()}` };
      const jpg = dest.replace(/\.webp$/i, "") + ".jpg";
      for (const jq of [4, 8, 14]) {
        const j = run(ffmpeg, grab(jpg, ["-q:v", String(jq)]));
        if (!j.ok) return { ok: false, error: `ffmpeg: ${j.stderr.trim()}` };
        if (sizeOf(jpg) <= KEEP_MAX) break;
      }
      return { ok: true, path: jpg, bytes: sizeOf(jpg), note: "this FFmpeg has no WebP encoder: kept as JPEG" };
    }
    if (sizeOf(dest) <= KEEP_MAX) break;
  }
  return { ok: true, path: dest, bytes: sizeOf(dest) };
}
