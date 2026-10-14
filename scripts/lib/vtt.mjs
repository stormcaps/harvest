// WebVTT → compact timestamped paragraphs.
//
// Auto-captions are "rolling": each cue repeats the previous line before adding new words, so a
// raw file is ~10x the size of what was said. We parse cues, drop the repeated prefix word-wise,
// then bucket the words into fixed-width paragraphs that each carry their start time — so any
// slice of the output can still be cited as [mm:ss] without the rest of the file.
import { decodeEntities, stamp } from "./util.mjs";

const CUE = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s+-->\s+/;

function seconds(m) {
  return (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}

export function parseCues(vtt) {
  const cues = [];
  let cur = null;
  const all = vtt.replace(/\r/g, "").split("\n");
  for (let i = 0; i < all.length; i++) {
    const line = all[i].trimEnd();
    const m = CUE.exec(line);
    if (m) {
      if (cur?.text.length) cues.push(cur);
      cur = { t: seconds(m), text: [] };
      continue;
    }
    // A bare number is a cue id only when a timing line follows it; otherwise it was said.
    const isId = /^\d+$/.test(line) && CUE.test(all[i + 1] ?? "");
    if (!cur || !line.trim() || isId || /^(WEBVTT|Kind:|Language:|NOTE|STYLE)/.test(line)) continue;
    const txt = decodeEntities(line.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (txt) cur.text.push(txt);
  }
  if (cur?.text.length) cues.push(cur);
  return cues.map((c) => ({ t: c.t, text: c.text.join(" ") }));
}

/** Removes the rolling repetition: the longest prefix of a cue already said at the end of the tail. */
export function dedupe(cues, window = 40) {
  const out = [];
  let tail = [];
  for (const { t, text } of cues) {
    let words = text.split(" ");
    for (let k = Math.min(words.length, tail.length, window); k > 0; k--) {
      if (words.slice(0, k).join(" ") === tail.slice(-k).join(" ")) {
        words = words.slice(k);
        break;
      }
    }
    if (!words.length) continue;
    out.push({ t, text: words.join(" ") });
    tail = [...tail, ...words].slice(-window * 2);
  }
  return out;
}

export function paragraphs(cues, bucket = 30) {
  const lines = [];
  let start = -1;
  let words = [];
  for (const { t, text } of cues) {
    if (start < 0) start = t;
    if (t - start >= bucket && words.length) {
      lines.push(`[${stamp(start)}] ${words.join(" ")}`);
      start = t;
      words = [];
    }
    words.push(text);
  }
  if (words.length) lines.push(`[${stamp(start)}] ${words.join(" ")}`);
  return lines;
}

export function compressVtt(vtt, bucket = 30) {
  return paragraphs(dedupe(parseCues(vtt)), bucket);
}
