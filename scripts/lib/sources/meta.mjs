// Instagram and Threads. A normal browser agent gets the login wall; the link-preview agent gets
// the public caption in og:description — the same text a chat app shows when the link is shared.
import { extractLinks, fetchText, PREVIEW_UA } from "../util.mjs";
import { metaTags } from "../html.mjs";
import { info, toMeta, available } from "../ytdlp.mjs";

// "7,667 likes, 4,161 comments - author on September 29, 2026: "caption"."
const IG_DESC = /^([\d.,\s]+[KM]?)\s*likes?,\s*([\d.,\s]+[KM]?)\s*comments?\s*-\s*([\w.]+)\s+(?:on|le)\s+(.+?):\s*"([\s\S]*)"\.?\s*$/i;

/** "Comment X and I'll DM you the link": the useful content is deliberately NOT in the post. */
export const BAIT = /\b(comment|type|reply|drop)\b[^.\n]{0,40}\b(and|&|for|to get)\b[^.\n]{0,50}\b(send|dm|link|links|guide|access)\b/i;

export function parseInstagram(html) {
  const m = metaTags(html);
  const d = m["og:description"] ?? m.description ?? "";
  const t = IG_DESC.exec(d);
  const text = t ? t[5] : d;
  return {
    author: t?.[3] ?? null,
    date: t?.[4]?.trim() ?? null,
    stats: t ? { likes: t[1].trim(), comments: t[2].trim() } : {},
    text,
    title: m["og:title"] ?? null,
    image: m["og:image"] ?? null,
    isVideo: /video/.test(m["og:type"] ?? "") || Boolean(m["og:video"]) || /\/reel/.test(m["og:url"] ?? ""),
  };
}

function common(text) {
  return {
    links: extractLinks(text),
    mentions: [...new Set(text.match(/(?<![\w.])@[\w.]{2,}/g) ?? [])],
    hashtags: [...new Set(text.match(/#[\p{L}\d_]+/gu) ?? [])],
    notes: BAIT.test(text) ? ["engagement bait: the caption asks for a comment to receive the links — the content is in the video, not the caption"] : [],
  };
}

export async function instagram({ url, id }) {
  const base = { source: "instagram", url, id };
  const page = await fetchText(url, { ua: PREVIEW_UA });
  let p = page.ok ? parseInstagram(page.body) : null;
  let cost = { ms: page.ms, bytes: page.bytes };
  let duration = null;
  // The preview can be empty or truncated; yt-dlp reads the same public caption another way.
  if ((!p?.text || p.text.endsWith("...")) && available()) {
    const r = info(url);
    if (r.ok) {
      const y = toMeta(r.json);
      p = { ...p, text: y.text || p?.text || "", author: p?.author ?? y.author, isVideo: true };
      duration = y.duration;
      cost.ms += r.ms;
    }
  }
  if (!p?.text) return { ...base, error: `caption not readable (HTTP ${page.status}) — open the page in a browser`, cost };
  return {
    ...base,
    title: null,
    author: p.author,
    date: p.date,
    text: p.text,
    stats: p.stats,
    media: p.isVideo ? { kind: "video", duration } : { kind: "image", photos: p.image ? [p.image] : [] },
    ...common(p.text),
    cost,
  };
}

export async function threads({ url, id }) {
  const base = { source: "threads", url, id };
  const page = await fetchText(url, { ua: PREVIEW_UA });
  const m = page.ok ? metaTags(page.body) : {};
  const text = m["og:description"] ?? "";
  if (!text) return { ...base, error: `post not readable (HTTP ${page.status}) — open the page in a browser`, cost: { ms: page.ms, bytes: page.bytes } };
  return {
    ...base,
    title: m["og:title"] ?? null,
    author: /\/@([\w.]+)/.exec(url)?.[1] ?? null,
    text,
    media: m["og:video"] ? { kind: "video", duration: null } : m["og:image"] ? { kind: "image", photos: [m["og:image"]] } : null,
    ...common(text),
    notes: [...common(text).notes, "Threads previews show the first post only; replies in the thread need the browser"],
    cost: { ms: page.ms, bytes: page.bytes },
  };
}
