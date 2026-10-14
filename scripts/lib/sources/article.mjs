// Articles, blogs, newsletters, docs pages — and gists. Site APIs first when they return the
// author's own Markdown (dev.to, GitHub gists); otherwise the page itself, read locally.
import { extractLinks, fetchJson, fetchText } from "../util.mjs";
import { readable } from "../html.mjs";

const MAX_GIST_FILE = 40000;

export async function gist({ url, id }) {
  const base = { source: "gist", url, id };
  const r = await fetchJson(`https://api.github.com/gists/${id}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!r.json) return { ...base, error: `gist ${id}: ${r.status}`, cost: { ms: r.ms, bytes: r.bytes } };
  const files = Object.values(r.json.files ?? {});
  const text = files
    .map((f) => {
      const body = (f.content ?? "").slice(0, MAX_GIST_FILE);
      const cut = (f.content ?? "").length > MAX_GIST_FILE ? `\n[… truncated, ${f.size} bytes — raw: ${f.raw_url}]` : "";
      return `### ${f.filename} (${f.language ?? "text"})\n\n\`\`\`\n${body}\n\`\`\`${cut}`;
    })
    .join("\n\n");
  return {
    ...base,
    title: r.json.description || files[0]?.filename || null,
    author: r.json.owner?.login ?? null,
    date: r.json.updated_at,
    text,
    links: extractLinks(r.json.description ?? ""),
    notes: ["a gist is code: run the audit before reusing any of it"],
    cost: { ms: r.ms, bytes: r.bytes },
  };
}

async function devto(u) {
  const [, user, slug] = u.pathname.split("/");
  if (!user || !slug) return null;
  const r = await fetchJson(`https://dev.to/api/articles/${user}/${slug}`);
  if (!r.json?.body_markdown) return null;
  const j = r.json;
  return { title: j.title, author: j.user?.username, date: j.published_at, text: j.body_markdown, cost: { ms: r.ms, bytes: r.bytes } };
}

/** Under this many characters, a page that loads scripts was almost certainly built in the browser. */
const EMPTY = 280;

export async function article({ url, id }) {
  const base = { source: "article", url, id };
  const u = new URL(url);
  if (u.hostname === "dev.to") {
    const d = await devto(u);
    if (d) return { ...base, ...d, links: extractLinks(d.text) };
  }
  const page = await fetchText(url, { headers: { Accept: "text/html,application/xhtml+xml,application/pdf;q=0.5,*/*;q=0.1" } });
  const cost = { ms: page.ms, bytes: page.bytes };
  if (!page.ok) return { ...base, error: `HTTP ${page.status} — the site may block scripts; open it in a browser`, cost };
  if (/^%PDF/.test(page.body)) return { ...base, error: "this link is a PDF — read it with a PDF tool, not as a page", cost };
  const a = readable(page.body, page.url);
  const notes = [];
  if (a.body.length < EMPTY && /<script/i.test(page.body))
    notes.push("almost no text without JavaScript: the page is rendered client-side — read it in a browser");
  if (/medium\.com|member-only|paywall|subscribe to (continue|read)/i.test(page.url + page.body.slice(0, 50000)) && a.body.length < 3000)
    notes.push("possibly paywalled: what follows may be a preview only");
  return {
    ...base,
    url: page.url,
    title: a.title,
    author: a.author,
    date: a.date,
    site: a.site,
    text: a.body || a.description || "",
    links: extractLinks(a.body.replace(/\]\(/g, "] (")).filter((l) => !l.startsWith(u.origin + "/#")),
    notes,
    cost,
  };
}
