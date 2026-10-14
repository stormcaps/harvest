// X / Twitter through the public FxTwitter API (no account, no key). The v2 thread endpoint
// returns the author's own self-replies, so a "1/12" thread arrives whole in one request.
import { extractLinks, fetchJson } from "../util.mjs";

const API = "https://api.fxtwitter.com";

function flatten(s) {
  if (!s) return null;
  const article = s.article
    ? [s.article.title, s.article.preview_text ?? "", ...(s.article.content?.blocks ?? []).map((b) => b.text ?? "")].filter(Boolean).join("\n\n")
    : "";
  return {
    author: s.author?.screen_name ?? null,
    date: s.created_timestamp ? new Date(s.created_timestamp * 1000).toISOString() : (s.created_at ?? null),
    // X links any "name.md" (.md is Moldova's TLD): "http://CLAUDE.md" is a file name, not a site.
    text: [s.text ?? "", article].filter(Boolean).join("\n\n").replace(/\bhttps?:\/\/([\w-]+\.md)\b(?!\/)/g, "$1"),
    links: (s.raw_text?.facets ?? []).filter((f) => f.type === "url").map((f) => f.replacement ?? f.original).filter((l) => l && !/^https?:\/\/[\w-]+\.md\/?$/.test(l)),
    videos: (s.media?.videos ?? []).map((v) => ({ url: v.url, duration: v.duration ?? null })),
    photos: (s.media?.photos ?? []).map((p) => p.url),
    quote: s.quote ? flatten(s.quote) : null,
    stats: { likes: s.likes, reposts: s.reposts ?? s.retweets, replies: s.replies, views: s.views, bookmarks: s.bookmarks },
  };
}

export async function x({ url, id }) {
  const base = { source: "x", url, id };
  let r = await fetchJson(`${API}/2/thread/${id}`);
  let main = r.json?.status;
  let rest = (r.json?.thread ?? []).filter((t) => t.id !== id && t.author?.id === main?.author?.id);
  if (!main) {
    r = await fetchJson(`${API}/status/${id}`);
    main = r.json?.tweet;
    rest = [];
  }
  if (!main) return { ...base, error: `FxTwitter: ${r.status} — the post may be deleted, private or age-gated; open it in a browser`, cost: { ms: r.ms, bytes: r.bytes } };
  const m = flatten(main);
  const thread = rest.map(flatten);
  const all = [m, ...thread, m.quote].filter(Boolean);
  const videos = all.flatMap((p) => p.videos);
  return {
    ...base,
    title: null,
    author: m.author,
    date: m.date,
    text: m.text,
    thread: thread.map((t) => ({ author: t.author, date: t.date, text: t.text })),
    quote: m.quote && { author: m.quote.author, text: m.quote.text },
    stats: m.stats,
    links: [...new Set([...all.flatMap((p) => p.links), ...all.flatMap((p) => extractLinks(p.text))])].filter((l) => !/^https:\/\/t\.co\//.test(l)),
    media: videos.length
      ? { kind: "video", duration: videos.reduce((n, v) => n + (v.duration ?? 0), 0) || null, count: videos.length }
      : all.some((p) => p.photos.length)
        ? { kind: "image", photos: all.flatMap((p) => p.photos) }
        : null,
    cost: { ms: r.ms, bytes: r.bytes },
  };
}
