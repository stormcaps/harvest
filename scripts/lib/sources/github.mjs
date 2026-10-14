// GitHub repos: read the tarball of one commit (no clone, no git history), inventory what an
// agent toolkit can carry, and audit it before anything is reused.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";
import { fetchJson, workDir, run, tool, sizeOf } from "../util.mjs";
import { audit, walk } from "../audit.mjs";

/**
 * Anonymous on purpose: the plugin never reads a credential from the user's environment to send
 * it to a server. 60 requests an hour, two per repository read.
 */
const headers = () => ({ Accept: "application/vnd.github+json" });

const KINDS = [
  ["skill", /(^|\/)SKILL\.md$/i],
  ["command", /(^|\/)(\.claude\/)?commands\/.+\.md$/i],
  ["agent", /(^|\/)(\.claude\/)?agents\/.+\.md$/i],
  ["hooks", /(^|\/)hooks\/hooks\.json$|(^|\/)\.claude\/settings(\.local)?\.json$/i],
  ["mcp", /(^|\/)\.mcp\.json$|(^|\/)mcp(-config)?\.json$/i],
  ["plugin", /(^|\/)\.claude-plugin\/(plugin|marketplace)\.json$/i],
  ["instructions", /(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$|(^|\/)\.cursorrules$|(^|\/)\.cursor\/rules\/|(^|\/)\.github\/copilot-instructions\.md$|(^|\/)\.windsurfrules$/i],
  ["script", /\.(sh|ps1|py|mjs|cjs|js|ts)$/i],
  ["manifest", /(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|requirements\.txt)$/i],
];

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const get = (k) => new RegExp(`^${k}:\\s*(.+)$`, "m").exec(m[1])?.[1]?.replace(/^["']|["']$/g, "").trim();
  return { name: get("name"), description: get("description") };
}

/** Archives above this are refused: a harvest reads a toolkit, not a monorepo. */
const MAX_REPO_KB = 250 * 1024;

export async function github({ url, id, focus }, { since } = {}) {
  const base = { source: "github", url, id, focus: focus ?? null };
  const t0 = Date.now();
  const repo = await fetchJson(`https://api.github.com/repos/${id}`, { headers: headers() });
  if (!repo.json) return { ...base, error: `GitHub API ${repo.status}${repo.status === 403 || repo.status === 429 ? " — anonymous rate limit (60 requests an hour) reached; try again later" : ""}` };
  const r = repo.json;
  if (r.size > MAX_REPO_KB)
    return { ...base, error: `the repository is ${Math.round(r.size / 1024)} MB; harvest downloads up to ${MAX_REPO_KB / 1024} MB — read the files you need from their raw links` };
  const sha = (await fetchJson(`https://api.github.com/repos/${id}/commits/${r.default_branch}`, { headers: headers() })).json?.sha;
  if (!sha) return { ...base, error: "cannot resolve the head commit" };

  let changed = null;
  if (since && since !== sha) {
    const c = await fetchJson(`https://api.github.com/repos/${id}/compare/${since}...${sha}`, { headers: headers() });
    changed = c.json?.files?.map((f) => `${f.status} ${f.filename}`) ?? null;
  }

  const dir = workDir(`github-${id}-${sha.slice(0, 12)}`);
  const tgz = join(dir, "repo.tar.gz");
  const tar = tool("tar");
  if (!tar) return { ...base, error: "tar not found on PATH" };
  const dl = await fetch(`https://codeload.github.com/${id}/tar.gz/${sha}`, { signal: AbortSignal.timeout(120000) });
  if (!dl.ok) return { ...base, error: `archive download: HTTP ${dl.status}` };
  const buf = Buffer.from(await dl.arrayBuffer());
  writeFileSync(tgz, buf);
  // Relative paths only: Windows tar reads "C:\…" as a remote host.
  const x = run(tar, ["-xzf", "repo.tar.gz"], { cwd: dir });
  if (!x.ok) return { ...base, error: `tar: ${x.stderr.trim()}` };
  const root = join(dir, readdirSync(dir).find((n) => n !== "repo.tar.gz"));

  const files = walk(root).map((f) => relative(root, f).replaceAll("\\", "/"));
  const inventory = {};
  for (const f of files) {
    const kind = KINDS.find(([, re]) => re.test(f))?.[0];
    if (!kind) continue;
    const item = { path: f };
    if (["skill", "command", "agent"].includes(kind)) Object.assign(item, frontmatter(readFileSync(join(root, f), "utf8")));
    (inventory[kind] ??= []).push(item);
  }
  const langs = {};
  for (const f of files) {
    const e = extname(f).toLowerCase() || basename(f);
    langs[e] = (langs[e] ?? 0) + 1;
  }
  const readmeName = readdirSync(root).find((n) => /^readme(\.md|\.mdx|\.txt)?$/i.test(n));
  const readme = readmeName ? readFileSync(join(root, readmeName), "utf8") : "";
  const a = audit(root);

  return {
    ...base,
    title: r.full_name,
    author: r.owner?.login,
    date: r.pushed_at,
    text: readme.length > 15000 ? readme.slice(0, 15000) + "\n\n[… README truncated — full file in the work dir]" : readme,
    repo: {
      description: r.description,
      stars: r.stargazers_count,
      forks: r.forks_count,
      archived: r.archived,
      // The file decides; when it is missing or unrecognised, GitHub's own detection is the fallback.
      license: (a.license?.spdx && a.license.spdx !== "unknown" ? a.license.spdx : r.license?.spdx_id) ?? a.license?.spdx ?? null,
      licensePermissive: a.license?.permissive || /^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0|Unlicense|0BSD|CC0-1\.0)$/.test(r.license?.spdx_id ?? ""),
      topics: r.topics ?? [],
      sha,
      files: files.length,
      bytes: buf.length,
      langs: Object.entries(langs).sort((p, q) => q[1] - p[1]).slice(0, 8),
    },
    inventory,
    changed,
    audit: a,
    workdir: root,
    cost: { ms: Date.now() - t0, bytes: buf.length, onDisk: sizeOf(dir) },
  };
}
