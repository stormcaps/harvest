// HTML → metadata and readable Markdown, with no dependency.
// Good enough for blogs, docs and newsletters; a page built entirely by script is reported as
// empty so the caller moves up the ladder (browser) instead of trusting a blank result.
import { decodeEntities } from "./util.mjs";

export function metaTags(html) {
  const meta = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const val = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
    if (key && val && !(key in meta)) meta[key] = decodeEntities(val[1] ?? val[2] ?? "");
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (title) meta["html:title"] = decodeEntities(title.trim());
  return meta;
}

/** JSON-LD often carries the full article body, author and dates — cheaper and cleaner than the DOM. */
export function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x?.["@graph"] ? flat(x["@graph"]) : [x]);
      out.push(...flat(j).filter(Boolean));
    } catch {
      /* malformed JSON-LD is common; the DOM path still runs */
    }
  }
  return out;
}

const DROP = /<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template|button|select)\b[\s\S]*?<\/\1>/gi;
const NOISE = /\b(nav|menu|footer|header|sidebar|share|social|related|comment|cookie|banner|newsletter|subscribe|promo|advert|breadcrumb)\b/i;

function stripNoise(html) {
  let h = html.replace(/<!--[\s\S]*?-->/g, "").replace(DROP, "");
  // Remove blocks whose class/id says they are chrome, one nesting level at a time.
  for (let i = 0; i < 3; i++) {
    h = h.replace(/<(div|section|ul)\b([^>]*)>(?:(?!<\1\b)[\s\S])*?<\/\1>/gi, (m, _t, attrs) =>
      /(?:class|id)\s*=\s*["'][^"']*["']/i.test(attrs) && NOISE.test(attrs) ? "" : m,
    );
  }
  return h;
}

function pickMain(html) {
  for (const re of [/<article\b[^>]*>([\s\S]*?)<\/article>/gi, /<main\b[^>]*>([\s\S]*?)<\/main>/gi]) {
    const all = [...html.matchAll(re)].map((m) => m[1]);
    if (all.length) return all.sort((a, b) => textLength(b) - textLength(a))[0];
  }
  return /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
}

const textLength = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").length;

export function toMarkdown(html, base) {
  const abs = (href) => {
    try {
      return new URL(decodeEntities(href), base).href;
    } catch {
      return href;
    }
  };
  let h = html;
  h = h.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${decodeEntities(c.replace(/<[^>]+>/g, "")).trim()}\n\`\`\`\n\n`);
  h = h.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => "`" + c.replace(/<[^>]+>/g, "") + "`");
  h = h.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, c) => `\n\n${"#".repeat(+n)} ${c.replace(/<[^>]+>/g, "").trim()}\n\n`);
  h = h.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, c) => {
    const text = c.replace(/<[^>]+>/g, "").trim();
    return text ? `[${text}](${abs(href)})` : "";
  });
  h = h.replace(/<img\b[^>]*alt\s*=\s*["']([^"']+)["'][^>]*>/gi, (_, alt) => `[image: ${alt}]`);
  h = h.replace(/<li\b[^>]*>/gi, "\n- ");
  h = h.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
  h = h.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "_$2_");
  h = h.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => "\n\n> " + c.replace(/<[^>]+>/g, "").trim() + "\n\n");
  h = h.replace(/<(p|div|section|tr|br|table|ul|ol)\b[^>]*\/?>/gi, "\n\n");
  h = h.replace(/<[^>]+>/g, "");
  return decodeEntities(h)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function readable(html, base) {
  const meta = metaTags(html);
  const ld = jsonLd(html);
  const article = ld.find((x) => /Article|BlogPosting|NewsArticle|TechArticle|SocialMediaPosting/i.test([x["@type"]].flat().join(" ")));
  let body = toMarkdown(pickMain(stripNoise(html)), base);
  if (article?.articleBody && article.articleBody.length > body.length * 0.8) body = article.articleBody.trim();
  const title = meta["og:title"] ?? article?.headline ?? meta["html:title"] ?? null;
  // Pages without <article>/<main> keep the site header above the title: start at the title.
  if (title) {
    const head = title.slice(0, 40).toLowerCase();
    const lines = body.split("\n");
    const at = lines.findIndex((l) => /^#{1,3} /.test(l) && l.replace(/^#+ /, "").toLowerCase().startsWith(head));
    if (at > 0 && lines.slice(0, at).join("\n").length < body.length / 3) body = lines.slice(at).join("\n");
  }
  const author = [article?.author].flat().map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean).join(", ");
  return {
    title,
    author: author || meta.author || meta["article:author"] || null,
    date: article?.datePublished ?? meta["article:published_time"] ?? meta["date"] ?? meta["dc.date"] ?? (/<time[^>]+datetime="([^"]+)"/i.exec(html)?.[1] ?? null),
    description: meta["og:description"] ?? meta.description ?? null,
    site: meta["og:site_name"] ?? null,
    body,
    meta,
  };
}
