import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detect } from "../scripts/lib/detect.mjs";
import { compressVtt, parseCues, dedupe } from "../scripts/lib/vtt.mjs";
import { readable, metaTags, toMarkdown } from "../scripts/lib/html.mjs";
import { parseInstagram, BAIT } from "../scripts/lib/sources/meta.mjs";
import { pickCaptions, toMeta } from "../scripts/lib/ytdlp.mjs";
import { bskyEmbed } from "../scripts/lib/sources/forums.mjs";
import { chooseInstants } from "../scripts/lib/media.mjs";
import { decodeEntities, extractLinks, stamp } from "../scripts/lib/util.mjs";

const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("detect routes each link to its source", () => {
  const cases = {
    "https://www.youtube.com/watch?v=abcdefghijk": ["youtube", "abcdefghijk"],
    "https://youtu.be/abcdefghijk?t=42": ["youtube", "abcdefghijk"],
    "https://www.youtube.com/shorts/abcdefghijk": ["youtube", "abcdefghijk"],
    "https://www.instagram.com/reel/Dd4LrTSsx0i/?igsh=x": ["instagram", "Dd4LrTSsx0i"],
    "https://www.instagram.com/p/ABC123/": ["instagram", "ABC123"],
    "https://www.tiktok.com/@user/video/7300000000000000000": ["tiktok", "7300000000000000000"],
    "https://x.com/someone/status/123456789": ["x", "123456789"],
    "https://twitter.com/someone/status/123456789?s=20": ["x", "123456789"],
    "https://www.threads.com/@someone/post/C1a2b3": ["threads", "C1a2b3"],
    "https://bsky.app/profile/someone.bsky.social/post/3abc": ["bluesky", "3abc"],
    "https://www.reddit.com/r/ClaudeCode/comments/1abcde/title/": ["reddit", "1abcde"],
    "https://www.reddit.com/r/ClaudeAI/s/mbe5IY2LF9": ["reddit", "/r/ClaudeAI/s/mbe5IY2LF9"],
    "https://news.ycombinator.com/item?id=4242": ["hackernews", "4242"],
    "https://github.com/owner/repo/tree/main/skills": ["github", "owner/repo"],
    "https://gist.github.com/owner/0123456789abcdef": ["gist", "0123456789abcdef"],
    "https://vimeo.com/123456": ["video", "https://vimeo.com/123456"],
    "https://example.com/blog/post": ["article", "https://example.com/blog/post"],
  };
  for (const [url, [source, id]] of Object.entries(cases)) {
    const d = detect(url);
    assert.equal(d.source, source, url);
    assert.equal(d.id, id, url);
  }
});

test("reddit links are normalised to the only feed URL that answers", () => {
  assert.equal(detect("https://old.reddit.com/r/ClaudeCode/comments/1v6y5q2/some_title/").url, "https://www.reddit.com/r/ClaudeCode/comments/1v6y5q2/");
  assert.equal(detect("https://www.reddit.com/r/ClaudeAI/s/mbe5IY2LF9").url, "https://www.reddit.com/r/ClaudeAI/s/mbe5IY2LF9");
});

test("a link into a repo folder keeps where to look first", () => {
  const d = detect("https://github.com/owner/repo/tree/main/skills/foo");
  assert.equal(d.url, "https://github.com/owner/repo");
  assert.equal(d.focus, "skills/foo");
  assert.equal(detect("https://github.com/owner/repo").focus, undefined);
  assert.equal(detect("https://www.instagram.com/p/ABC123/").url, "https://www.instagram.com/p/ABC123/");
});

test("detect sends a profile page of a known site to the article reader, and refuses non-URLs", () => {
  assert.equal(detect("https://x.com/someone").source, "article");
  assert.equal(detect("not a url at all").source, null);
  assert.equal(detect("ftp://example.com/file").source, null);
});

test("rolling auto-captions collapse to what was said, once", () => {
  const lines = compressVtt(fixture("rolling.vtt"));
  const text = lines.join(" ");
  assert.equal((text.match(/install the plugin/g) ?? []).length, 1);
  assert.match(lines[0], /^\[00:00\] /);
  assert.ok(lines.some((l) => l.startsWith("[00:3")), "a second 30 s paragraph starts after the bucket");
  assert.ok(!/<c>|<\d\d:/.test(text), "inline timing tags are stripped");
});

test("vtt parsing keeps cue times and decodes entities", () => {
  const cues = parseCues("WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nTom &amp; Jerry\n\n01:02:03.000 --> 01:02:04.000\nlate\n");
  assert.deepEqual(cues.map((c) => c.t), [1.5, 3723]);
  assert.equal(cues[0].text, "Tom & Jerry");
  const ids = parseCues(["WEBVTT", "", "1", "00:00:01.000 --> 00:00:02.000", "the year was", "", "2", "00:00:02.000 --> 00:00:03.000", "2026", ""].join("\n"));
  assert.deepEqual(ids.map((c) => c.text), ["the year was", "2026"], "cue ids dropped, a spoken number kept");
  assert.deepEqual(dedupe([{ t: 0, text: "a b c" }, { t: 1, text: "b c d e" }]).map((c) => c.text), ["a b c", "d e"]);
});

test("articles: title, author, date and body come out; site chrome does not", () => {
  const a = readable(fixture("article.html"), "https://blog.example.com/posts/tips");
  assert.equal(a.title, "Five ways to keep CLAUDE.md short");
  assert.equal(a.author, "Ada Example");
  assert.equal(a.date, "2026-09-01");
  assert.match(a.body, /^## Five ways to keep CLAUDE\.md short/);
  assert.match(a.body, /```\nnpx example --flag\n```/);
  assert.match(a.body, /\[the docs\]\(https:\/\/blog\.example\.com\/docs\)/);
  assert.doesNotMatch(a.body, /Subscribe to the newsletter|cookie/i);
});

test("meta tags and markdown conversion", () => {
  const m = metaTags(`<meta property="og:title" content="A &amp; B"><meta content='x' name='description'>`);
  assert.equal(m["og:title"], "A & B");
  assert.equal(m.description, "x");
  assert.equal(toMarkdown("<ul><li>one</li><li><b>two</b></li></ul>", "https://e.com").trim(), "- one\n- **two**");
});

test("instagram preview caption is parsed, and bait is recognised", () => {
  const p = parseInstagram(fixture("instagram.html"));
  assert.equal(p.author, "some.creator");
  assert.equal(p.stats.likes, "1,234");
  assert.match(p.text, /^Three MCP servers/);
  assert.ok(p.isVideo);
  assert.ok(BAIT.test(p.text));
  assert.ok(!BAIT.test("Here are the links: example.com"));
});

test("captions: the speaker's own language first, human before automatic, translation flagged", () => {
  const j = { language: "fr", subtitles: {}, automatic_captions: { "fr-orig": [], fr: [], en: [], de: [] } };
  assert.deepEqual(pickCaptions(j), { lang: "fr-orig", auto: true, translated: false });
  assert.equal(pickCaptions({ ...j, subtitles: { fr: [] } }).auto, false);
  const forced = pickCaptions(j, "en");
  assert.equal(forced.lang, "en");
  assert.equal(forced.translated, true);
  assert.equal(pickCaptions({ language: null, subtitles: {}, automatic_captions: {} }), null);
  const m = toMeta({ ...j, upload_date: "20261005", title: "t", duration: 61 });
  assert.equal(m.date, "2026-10-05");
  assert.deepEqual(m.captions.auto, ["fr-orig", "fr"]);
});

test("contact sheet: hard cuts when there are some, evenly spaced instants when there are none", () => {
  const cuts = [3, 3.2, 9, 15, 22, 30].map((t, i) => ({ t, score: 0.5 - i * 0.01 }));
  const p = chooseInstants(cuts, 40, 12);
  assert.equal(p.mode, "cuts");
  assert.ok(p.at.every((t, i, a) => i === 0 || t > a[i - 1]), "sorted");
  assert.ok(!p.at.includes(3.6) || !p.at.includes(3.4), "cuts closer than the gap are merged");
  const even = chooseInstants([{ t: 5, score: 0.3 }], 60, 12);
  assert.equal(even.mode, "even");
  assert.equal(even.at.length, 12);
  assert.equal(even.at[0], 2.5);
});

test("small utilities", () => {
  assert.equal(decodeEntities("&#x1F50C; &#39; &quot;"), "🔌 ' \"");
  assert.deepEqual(extractLinks("see https://a.com/x. and (https://b.com/y)"), ["https://a.com/x", "https://b.com/y"]);
  assert.equal(stamp(65), "01:05");
  assert.equal(stamp(3725), "1:02:05");
});

test("a Bluesky post without an embed has the full embed shape (it used to crash)", () => {
  assert.deepEqual(bskyEmbed(undefined), { links: [], card: null, alts: [], photos: [], video: false });
  const e = bskyEmbed({ $type: "app.bsky.embed.images#view", images: [{ alt: "a chart", fullsize: "https://cdn/x.jpg" }] });
  assert.deepEqual([e.alts, e.photos], [["a chart"], ["https://cdn/x.jpg"]]);
});
