// Reads the target repository to find where harvested knowledge belongs. It measures; it does not
// write. The level decides how much structure the integration step may lean on — or must create.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { walk } from "./audit.mjs";
import { run, which } from "./util.mjs";

const INSTRUCTION_FILES = /(^|\/)(CLAUDE(\.local)?|AGENTS|GEMINI)\.md$|(^|\/)\.cursorrules$|(^|\/)\.cursor\/rules\/.+|(^|\/)\.github\/copilot-instructions\.md$|(^|\/)\.windsurfrules$|(^|\/)\.clinerules/;
const DOC_ROOTS = ["docs", "doc", "documentation", "wiki", "handbook"];
const KNOWLEDGE = /(^|\/)(knowledge|learnings?|notes|references?|playbooks?|guides?|patterns|library|bibliotheque|assets|snippets|recipes|cookbook|decisions|adr)(\/|$)/i;
const TEXT = /\.(md|mdx|txt|json|ya?ml|toml|m?[jt]sx?|py|rs|go|sh|ps1|css|html)$/i;

const lines = (p) => readFileSync(p, "utf8").split("\n").length;

function guessLanguage(texts) {
  const s = texts.join(" ").toLowerCase().slice(0, 200000);
  const count = (re) => (s.match(re) ?? []).length;
  const scores = {
    en: count(/\b(the|and|with|this|that|which|should)\b/g),
    fr: count(/\b(le|la|les|des|une|est|pour|avec|qui|dans)\b/g),
    es: count(/\b(el|los|las|una|para|con|que|del)\b/g),
    de: count(/\b(der|die|das|und|nicht|mit|ist|ein)\b/g),
  };
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

export function profile(root) {
  const files = walk(root, 30000).map((f) => relative(root, f).replaceAll("\\", "/"));
  const instructions = files.filter((f) => INSTRUCTION_FILES.test(f)).map((f) => ({ path: f, lines: lines(join(root, f)) }));
  const skills = files.filter((f) => /(^|\/)\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f)).map((f) => f.split("/").at(-2));
  const commands = files.filter((f) => /(^|\/)\.claude\/commands\/.+\.md$/.test(f)).map((f) => basename(f, ".md"));
  const agents = files.filter((f) => /(^|\/)\.claude\/agents\/.+\.md$/.test(f)).map((f) => basename(f, ".md"));
  const mcp = files.filter((f) => /(^|\/)\.mcp\.json$/.test(f));
  const docRoot = DOC_ROOTS.find((d) => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory()) ?? null;
  const docs = docRoot ? files.filter((f) => f.startsWith(docRoot + "/") && /\.mdx?$/.test(f)) : [];
  const adr = [...new Set(files.filter((f) => /(^|\/)(adr|decisions?)\/[^/]+\.md$/i.test(f)).map((f) => f.split("/").slice(0, -1).join("/")))];
  const knowledge = [...new Set(files.filter((f) => KNOWLEDGE.test(f) && /\.mdx?$/.test(f)).map((f) => f.split("/").slice(0, -1).join("/")))].slice(0, 15);
  const docIndex = docRoot ? ["README.md", "index.md", "INDEX.md", "SUMMARY.md", "_index.md"].map((n) => `${docRoot}/${n}`).find((p) => files.includes(p)) ?? null : null;
  const workspaces = files.filter((f) => /(^|\/)package\.json$/.test(f)).length;
  const intake = files.filter((f) => /(^|\/)(CONTRIBUTING|INBOX|intake|propos(al|e)s?)(\.md)?$/i.test(f) || /(^|\/)(inbox|intake|proposals)\//i.test(f)).slice(0, 5);

  let deps = [];
  if (existsSync(join(root, "package.json")))
    try {
      const p = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      deps = Object.keys({ ...p.dependencies, ...p.devDependencies });
    } catch {
      /* unreadable package.json: no stack hint, said by the empty list */
    }

  const level =
    skills.length >= 3 || agents.length >= 2 || knowledge.length >= 3 || (instructions.length >= 2 && docs.length >= 10)
      ? 3
      : docs.length >= 3 || adr.length
        ? 2
        : instructions.length
          ? 1
          : 0;
  const readme = files.find((f) => /^readme(\.md|\.mdx|\.txt)?$/i.test(f));
  const status = files.filter((f) => /(^|\/)(TODO|ROADMAP|STATUS|ETAT|BACKLOG|KNOWN[-_]ISSUES|ISSUES)(\.md|\.txt)?$/i.test(f)).slice(0, 5);
  const proseFiles = [...new Set([...(readme ? [readme] : []), ...instructions.map((i) => i.path), ...status, ...docs.slice(0, 20)])];
  const prose = proseFiles.map((f) => readFileSync(join(root, f), "utf8"));
  const signals = painSignals(proseFiles, prose);
  const todo = countTodo(root, files);
  let git = null;
  if (which("git")) {
    const r = run("git", ["-C", root, "remote", "get-url", "origin"]);
    git = { remote: r.ok ? r.stdout.trim() : null, dirty: run("git", ["-C", root, "status", "--porcelain"]).stdout.trim().split("\n").filter(Boolean).length };
  }
  return {
    root,
    level,
    levelName: ["bare", "instructions-only", "documented", "ecosystem"][level],
    language: prose.length ? guessLanguage(prose) : null,
    readme: readme ?? null,
    pain: { signals, todo, status },
    instructions,
    claude: { skills, commands, agents, mcp },
    docs: { root: docRoot, index: docIndex, count: docs.length, adr, knowledge },
    intake,
    stack: deps.slice(0, 40),
    workspaces,
    git,
    files: files.length,
  };
}

/**
 * What the project says hurts. Triage starts here: an item that answers a stated pain is a
 * candidate, one that answers nothing the project needs is not. English and French phrasings.
 */
const PAIN = /\b(known (issue|problem|bug|limitation)s?|pain|struggl\w*|hard to|difficult|slow|flaky|broken|fails?|failing|bug(gy|s)?|can'?t|cannot|no way to|missing|we (only|still|never)|workaround|problème|difficile|lent|cassé|bloqu\w*|manque|on n'arrive pas|impossible)\b/i;

export function painSignals(files, texts, max = 12) {
  const out = [];
  texts.forEach((t, i) => {
    t.split("\n").forEach((l, n) => {
      const line = l.replace(/^[\s#>*-]+/, "").trim();
      if (out.length < max && line.length >= 12 && line.length <= 300 && PAIN.test(line) && !/^(```|\|)/.test(line))
        out.push({ file: files[i], line: n + 1, text: line });
    });
  });
  return out;
}

function countTodo(root, files) {
  let n = 0;
  for (const f of files) {
    if (!/\.(m?[jt]sx?|py|rs|go|rb|java|kt|swift|vue|svelte|css|html)$/i.test(f)) continue;
    const p = join(root, f);
    if (statSync(p).size > 512 * 1024) continue;
    n += (readFileSync(p, "utf8").match(/\b(TODO|FIXME|HACK|XXX)\b/g) ?? []).length;
  }
  return n;
}

/** "Was this already harvested?" — the source URL or id written anywhere in the repo's text files. */
export function findMentions(root, needles) {
  const hits = [];
  const wanted = needles.filter((n) => n && n.length >= 6);
  for (const f of walk(root, 30000)) {
    if (!TEXT.test(f) || statSync(f).size > 1024 * 1024) continue;
    const text = readFileSync(f, "utf8");
    for (const n of wanted) {
      const i = text.indexOf(n);
      if (i >= 0) hits.push({ file: relative(root, f).replaceAll("\\", "/"), line: text.slice(0, i).split("\n").length, needle: n });
    }
  }
  return hits;
}
