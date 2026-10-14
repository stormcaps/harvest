// Bluesky, Reddit, Hacker News: posts whose value is often in the replies.
import { decodeEntities, extractLinks, fetchJson, fetchText, UA } from "../util.mjs";
import { toMarkdown } from "../html.mjs";

const MAX_REPLIES = 15;
const clip = (s, n = 1200) => (s.length > n ? s.slice(0, n) + " […]" : s);

/* ── Bluesky ── public AppView, no auth. */

const BSKY = "https://public.api.bsky.app/xrpc";

/** Always the full shape: a post without an embed is the common case, not an error. */
export function bskyEmbed(e) {
  const ext = e?.external ?? e?.media?.external;
  const imgs = e?.images ?? e?.media?.images ?? [];
  return {
    links: ext ? [ext.uri] : [],
    card: ext ? `${ext.title} — ${ext.description}` : null,
    alts: imgs.map((i) => i.alt).filter(Boolean),
    photos: imgs.map((i) => i.fullsize ?? i.thumb).filter(Boolean),
    video: Boolean(e?.$type?.includes("video") || e?.media?.$type?.includes("video")),
  };
}

export async function bluesky({ url, id }) {
  const base = { source: "bluesky", url, id };
  const handle = /\/profile\/([^/]+)\//.exec(url)[1];
  let did = handle;
  let cost = { ms: 0, bytes: 0 };
  if (!handle.startsWith("did:")) {
    const h = await fetchJson(`${BSKY}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
    cost.ms += h.ms;
    if (!h.json?.did) return { ...base, error: `cannot resolve handle ${handle}: ${h.status}`, cost };
    did = h.json.did;
  }
  const uri = `at://${did}/app.bsky.feed.post/${id}`;
  const r = await fetchJson(`${BSKY}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=6&parentHeight=0`);
  cost = { ms: cost.ms + r.ms, bytes: r.bytes };
  const root = r.json?.thread?.post;
  if (!root) return { ...base, error: `post not found: ${r.status}`, cost };
  // The author's own chain of replies is the thread; other people's replies are comments.
  const chain = [];
  const comments = [];
  let node = r.json.thread;
  while (node) {
    const own = (node.replies ?? []).find((x) => x.post?.author?.did === did);
    for (const x of node.replies ?? []) if (x !== own && x.post) comments.push(x.post);
    if (own) chain.push(own.post);
    node = own;
  }
  const emb = [root, ...chain].map((p) => bskyEmbed(p.embed));
  const text = (p) => p.record?.text ?? "";
  return {
    ...base,
    author: root.author?.handle ?? handle,
    date: root.record?.createdAt ?? null,
    text: [text(root), ...emb[0].alts.map((a) => `[image: ${a}]`), emb[0].card && `[link card: ${emb[0].card}]`].filter(Boolean).join("\n"),
    thread: chain.map((p) => ({ author: p.author.handle, date: p.record.createdAt, text: text(p) })),
    comments: comments
      .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      .slice(0, MAX_REPLIES)
      .map((p) => ({ author: p.author.handle, score: p.likeCount ?? 0, text: clip(text(p)) })),
    links: [...new Set([...emb.flatMap((e) => e.links), ...[root, ...chain].flatMap((p) => extractLinks(text(p)))])],
    stats: { likes: root.likeCount, reposts: root.repostCount, replies: root.replyCount },
    media: emb.some((e) => e.video)
      ? { kind: "video", duration: null }
      : emb.some((e) => e.photos.length)
        ? { kind: "image", photos: emb.flatMap((e) => e.photos) }
        : null,
    cost,
  };
}

/* ── Reddit ── the JSON API answers 403 without OAuth (measured 2026-10-13); the post's Atom feed
   carries the post and its replies, about one read a minute (429 on a burst, measured 2026-10-14). */

async function resolveShare(url) {
  try {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    const loc = r.headers.get("location");
    const m = loc && /\/r\/(\w+)\/comments\/(\w+)/.exec(loc);
    return m ? { url: `https://www.reddit.com/r/${m[1]}/comments/${m[2]}/`, id: m[2] } : null;
  } catch {
    return null;
  }
}

export async function reddit({ url, id }) {
  if (id.includes("/s/")) {
    const s = await resolveShare(url);
    if (!s) return { source: "reddit", url, id, error: "share link did not redirect to a post — open it in a browser" };
    ({ url, id } = s);
  }
  const base = { source: "reddit", url, id };
  const feed = `${url.replace(/\/?$/, "/")}.rss?limit=${MAX_REPLIES + 1}`;
  const get = () => fetchText(feed, { headers: { Accept: "application/atom+xml" } });
  let r = await get();
  // One polite retry: Reddit answers 429 to bursts, not to a single reader.
  if (r.status === 429) {
    await new Promise((ok) => setTimeout(ok, 2000));
    r = await get();
  }
  const entries = r.ok ? [...r.body.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]) : [];
  if (!entries.length)
    return {
      ...base,
      error: `Reddit refused the feed (${r.status}) — it allows about one read a minute: wait, or read ${url} in a browser`,
      cost: { ms: r.ms, bytes: r.bytes },
    };
  const field = (e, tag) => decodeEntities(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(e)?.[1] ?? "");
  const body = (e) => toMarkdown(field(e, "content"), "https://www.reddit.com").replace(/submitted by[\s\S]*$/i, "").trim();
  const [post, ...rest] = entries;
  const text = body(post);
  return {
    ...base,
    title: field(post, "title"),
    author: field(post, "name").replace(/^\/u\//, ""),
    date: field(post, "updated") || null,
    text,
    comments: rest.map((e) => ({ author: field(e, "name").replace(/^\/u\//, ""), text: clip(body(e)) })),
    links: extractLinks(text).filter((l) => !/reddit\.com\/(user|r\/\w+\/?$)/.test(l)),
    media: /v\.redd\.it|\.mp4/.test(post) ? { kind: "video", duration: null } : null,
    cost: { ms: r.ms, bytes: r.bytes },
  };
}

/* ── Hacker News ── Algolia mirror: the whole comment tree in one request. */

export async function hackernews({ url, id }) {
  const base = { source: "hackernews", url, id };
  const r = await fetchJson(`https://hn.algolia.com/api/v1/items/${id}`);
  if (!r.json) return { ...base, error: `HN item ${id}: ${r.status}`, cost: { ms: r.ms, bytes: r.bytes } };
  const j = r.json;
  const comments = [];
  const walk = (n, depth) => {
    for (const c of n.children ?? []) {
      if (comments.length >= MAX_REPLIES * 2) return;
      if (c.text) comments.push({ author: c.author, depth, text: clip(toMarkdown(c.text, "https://news.ycombinator.com")) });
      if (depth < 2) walk(c, depth + 1);
    }
  };
  walk(j, 0);
  const text = j.text ? toMarkdown(j.text, "https://news.ycombinator.com") : "";
  return {
    ...base,
    title: j.title ?? null,
    author: j.author,
    date: j.created_at,
    text,
    comments,
    links: [...new Set([j.url, ...extractLinks(text)].filter(Boolean))],
    stats: { points: j.points, "top-level replies": (j.children ?? []).length },
    notes: j.url ? [`the story links to ${j.url} — harvest it as an article if the discussion is not enough`] : [],
    cost: { ms: r.ms, bytes: r.bytes },
  };
}
