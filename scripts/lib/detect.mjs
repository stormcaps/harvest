// URL → { source, id, url }. One place decides which extractor a link goes to.

const RULES = [
  {
    source: "youtube",
    hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    id: (u) =>
      u.hostname.endsWith("youtu.be")
        ? u.pathname.slice(1).split("/")[0]
        : (u.searchParams.get("v") ?? u.pathname.match(/\/(?:shorts|live|embed|v)\/([\w-]{6,})/)?.[1]),
    canonical: (id) => `https://www.youtube.com/watch?v=${id}`,
  },
  {
    source: "instagram",
    hosts: ["instagram.com"],
    id: (u) => u.pathname.match(/\/(?:reel|reels|p|tv)\/([\w-]+)/)?.[1],
    // A photo or carousel post (/p/) is not a reel: keep the kind, the preview depends on it.
    canonical: (id, u) => `https://www.instagram.com/${/\/p\//.test(u.pathname) ? "p" : "reel"}/${id}/`,
  },
  {
    source: "tiktok",
    hosts: ["tiktok.com"],
    id: (u) => u.pathname.match(/\/video\/(\d+)/)?.[1] ?? (u.hostname.startsWith("vm.") || u.hostname.startsWith("vt.") ? u.pathname.slice(1) : null),
  },
  {
    source: "x",
    hosts: ["x.com", "twitter.com", "fxtwitter.com", "vxtwitter.com", "fixupx.com", "nitter.net"],
    id: (u) => u.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1],
    canonical: (id, u) => `https://x.com/${u.pathname.split("/")[1]}/status/${id}`,
  },
  {
    source: "threads",
    hosts: ["threads.net", "threads.com"],
    id: (u) => u.pathname.match(/\/post\/([\w-]+)/)?.[1],
  },
  {
    source: "bluesky",
    hosts: ["bsky.app"],
    id: (u) => u.pathname.match(/\/profile\/[^/]+\/post\/(\w+)/)?.[1],
  },
  {
    source: "reddit",
    hosts: ["reddit.com", "redd.it"],
    // App share links (/r/<sub>/s/<code>) redirect to the post: resolved by the reader.
    id: (u) => u.pathname.match(/\/comments\/(\w+)/)?.[1] ?? u.pathname.match(/\/r\/\w+\/s\/(\w+)/)?.[0] ?? (u.hostname === "redd.it" ? u.pathname.slice(1) : null),
    // The feed answers on www + /r/<sub>/comments/<id>/ only (old.reddit and the slug form: 404/429, measured).
    canonical: (id, u) => {
      const sub = u.pathname.match(/\/r\/(\w+)/)?.[1];
      return id.startsWith("/r/") ? `https://www.reddit.com${id}` : sub ? `https://www.reddit.com/r/${sub}/comments/${id}/` : `https://www.reddit.com/comments/${id}/`;
    },
  },
  {
    source: "hackernews",
    hosts: ["news.ycombinator.com"],
    id: (u) => u.searchParams.get("id"),
  },
  {
    source: "gist",
    hosts: ["gist.github.com"],
    id: (u) => u.pathname.split("/").filter(Boolean).pop(),
  },
  {
    source: "github",
    hosts: ["github.com"],
    id: (u) => {
      const [owner, repo] = u.pathname.split("/").filter(Boolean);
      return owner && repo ? `${owner}/${repo.replace(/\.git$/, "")}` : null;
    },
    canonical: (id) => `https://github.com/${id}`,
  },
];

/** Sites yt-dlp reads well that carry tips as video. Anything else that is not a page goes to `video` on request. */
const VIDEO_HOSTS = ["vimeo.com", "loom.com", "linkedin.com", "twitch.tv", "dailymotion.com", "bilibili.com", "rumble.com"];

const hostMatches = (host, h) => host === h || host.endsWith("." + h);

export function detect(raw) {
  let u;
  try {
    u = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return { source: null, error: `not a URL: ${raw}` };
  }
  if (!/^https?:$/.test(u.protocol)) return { source: null, error: `unsupported protocol: ${u.protocol}` };
  if (/\s/.test(raw.trim()) || !u.hostname.includes(".")) return { source: null, error: `not a URL: ${raw}` };
  const host = u.hostname.toLowerCase();
  for (const r of RULES) {
    if (!r.hosts.some((h) => hostMatches(host, h))) continue;
    const id = r.id(u);
    if (!id) {
      // A profile or a home page of a known site is still a page worth reading as an article.
      return { source: "article", id: u.href, url: u.href, note: `${r.source} URL without a post id` };
    }
    const out = { source: r.source, id, url: r.canonical ? r.canonical(id, u) : u.href };
    // A link into a repo's folder or file says where to look first.
    if (r.source === "github") {
      const rest = u.pathname.split("/").filter(Boolean).slice(2);
      if (/^(tree|blob)$/.test(rest[0]) && rest.length > 2) out.focus = rest.slice(2).join("/");
    }
    return out;
  }
  if (VIDEO_HOSTS.some((h) => hostMatches(host, h)) && !/\/(pulse|in|company)\//.test(u.pathname)) {
    return { source: "video", id: u.href, url: u.href };
  }
  return { source: "article", id: u.href, url: u.href };
}

export const SOURCES = ["youtube", "instagram", "tiktok", "x", "threads", "bluesky", "reddit", "hackernews", "github", "gist", "article", "video"];
