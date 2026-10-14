// YouTube, TikTok, and any other site yt-dlp reads. Tier 0 = description + chapters + caption list.
import { fetchJson, fetchText, decodeEntities } from "../util.mjs";
import { info, toMeta, available } from "../ytdlp.mjs";

async function viaYtdlp(url, base) {
  const r = info(url);
  if (!r.ok) return { ...base, error: r.error, missing: r.missing };
  return { ...base, ...toMeta(r.json), media: { kind: "video", duration: r.json.duration ?? null }, cost: { ms: r.ms, bytes: 0 } };
}

export async function youtube({ url, id }) {
  const base = { source: "youtube", url, id };
  if (available()) {
    const r = await viaYtdlp(url, base);
    if (!r.error) return r;
  }
  // Without yt-dlp: the watch page still carries the full description; captions need yt-dlp.
  const page = await fetchText(url, { headers: { "Accept-Language": "en" } });
  const o = await fetchJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
  const desc = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(page.body)?.[1];
  const dur = /"lengthSeconds":"(\d+)"/.exec(page.body)?.[1];
  let text = "";
  try {
    text = desc ? JSON.parse(`"${desc}"`) : "";
  } catch {
    text = desc.replace(/\\n/g, "\n");
  }
  if (!text && !o.json) return { ...base, error: `YouTube page ${page.status}, oEmbed ${o.status} — the video may be private, removed or age-gated` };
  return {
    ...base,
    title: o.json?.title ?? null,
    author: o.json?.author_name ?? null,
    text,
    media: { kind: "video", duration: dur ? +dur : null },
    notes: available() ? ["yt-dlp failed; fell back to the watch page"] : ["yt-dlp is not installed: captions, audio and frames are unavailable (run doctor)"],
    cost: { ms: page.ms + o.ms, bytes: page.bytes + o.bytes },
  };
}

export async function tiktok({ url, id }) {
  const base = { source: "tiktok", url, id };
  if (available()) {
    const r = await viaYtdlp(url, base);
    if (!r.error) return r;
  }
  // oEmbed works without auth but was measured at 32 s once: short deadline, then give up loudly.
  const o = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { timeout: 20000 });
  if (!o.json) return { ...base, error: `TikTok oEmbed: ${o.status}` };
  return {
    ...base,
    title: null,
    author: o.json.author_name ?? null,
    text: decodeEntities(o.json.title ?? ""),
    media: { kind: "video", duration: null },
    cost: { ms: o.ms, bytes: o.bytes },
  };
}

export async function video({ url, id }) {
  const base = { source: "video", url, id };
  if (!available()) return { ...base, error: "yt-dlp is not installed (run doctor)", missing: "yt-dlp" };
  return viaYtdlp(url, base);
}
