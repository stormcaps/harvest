// Static audit of anything about to be imported: a repo, a skill, an MCP config, a snippet.
// It does not decide — it lists what a human (or the agent) must look at, ranked by severity.
// A clean audit is "nothing known-bad found", never "safe".
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { extname, join, relative, basename } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "dist", "build", ".next", "__pycache__", ".venv", "venv"]);
const BINARY_EXT = new Set([".exe", ".dll", ".so", ".dylib", ".bin", ".msi", ".app", ".jar", ".node", ".wasm", ".pyc", ".class", ".scr", ".com"]);
/** Media and fonts are not code: skipped, not flagged (an audit that flags every logo is not read). */
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|mp[34]|m4a|mov|webm|wav|ogg|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|7z)$/i;
const MAX_FILE = 512 * 1024;
const WALK_MAX = 20000;

export function walk(root, max = 20000) {
  const out = [];
  const go = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (out.length >= max) return;
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) go(p);
      } else if (e.isFile()) out.push(p);
    }
  };
  go(root);
  return out;
}

/** Each rule: where it applies, what it matches, and why a reader should care. */
const RULES = [
  {
    id: "load-time-command",
    sev: "high",
    files: /\.md$/i,
    re: /(?<=^|\s)!`[^`\s][^`\n]*`/,
    why: "Claude Code runs !`command` when the skill or command loads — before anyone reads it",
  },
  {
    id: "pipe-to-shell",
    sev: "high",
    files: /./,
    re: /\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n|]{0,200}\|\s*(sudo\s+)?(ba|z)?sh\b|\b(iex|Invoke-Expression)\b\s*\(?\s*(\(|\$|iwr|irm|New-Object)/i,
    why: "downloads and executes remote code in one step",
  },
  {
    id: "install-script",
    sev: "high",
    files: /(^|[\\/])package\.json$/,
    re: /"(preinstall|install|postinstall|prepare)"\s*:/,
    why: "npm runs this automatically on install",
  },
  {
    id: "credential-path",
    sev: "high",
    files: /\.(m?[jt]s|cjs|py|sh|ps1|rb|go|rs)$/i,
    re: /\.ssh[\\/](id_|known_hosts|config)|\.aws[\\/]credentials|\.netrc\b|\.git-credentials|Login Data|Cookies\b.*(Chrome|Firefox)|\bkeytar\b|security find-(generic|internet)-password|\.claude[\\/]\.credentials|wallet\.dat/i,
    why: "reads a secret store (keys, browser data, credential files)",
  },
  {
    id: "api-key-env",
    sev: "low",
    files: /\.(m?[jt]s|cjs|py|sh|ps1|rb|go|rs)$/i,
    re: /\b(ANTHROPIC|OPENAI|GITHUB|GH|AWS|GOOGLE|GEMINI)_(API_)?(KEY|TOKEN|SECRET|AUTH_TOKEN)\b/,
    why: "reads an API key from the environment — normal for a client; check where it is sent",
  },
  {
    id: "prompt-injection",
    sev: "high",
    files: /\.(md|txt|mdx|json|ya?ml)$/i,
    re: /ignore (all |any )?(previous|prior|above) instructions|do not (tell|inform|mention to) the user|without (asking|telling) the user|you are now in (developer|god|admin) mode|<!--[^>]*\b(ignore|disregard|override)\b[^>]*\b(instructions?|rules?|above|previous)\b[^>]*-->|<!--\s*(system|assistant|claude|ai)\s*:/i,
    why: "text aimed at the agent rather than the reader",
  },
  {
    id: "hidden-unicode",
    sev: "high",
    files: /\.(md|txt|mdx|json|ya?ml|m?[jt]s|py)$/i,
    re: /[\u200B\u202A-\u202E\u2066-\u2069\u2060-\u2064\u{E0000}-\u{E007F}]|(?<!^)\uFEFF/u,
    why: "invisible or bidirectional characters can hide instructions or code",
  },
  {
    id: "hooks",
    sev: "medium",
    files: /(hooks\.json|settings(\.local)?\.json|plugin\.json|SKILL\.md)$/i,
    re: /(?:^|[\s{,])["']?(PreToolUse|PostToolUse|UserPromptSubmit|SessionStart|SessionEnd|Stop|SubagentStop|PreCompact|Notification)["']?\s*:\s*(\[|\{|$)/,
    why: "hooks run on their own, on every matching event; read each command they launch",
  },
  {
    id: "obfuscation",
    sev: "medium",
    files: /\.(m?[jt]s|py|sh|ps1|rb)$/i,
    re: /[A-Za-z0-9+/]{300,}={0,2}|\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){40,}|String\.fromCharCode\((\d+,\s*){30,}/i,
    why: "long encoded blobs in code hide what runs",
  },
  {
    id: "dynamic-exec",
    sev: "low",
    files: /\.(m?[jt]s|py|rb|ps1)$/i,
    re: /\beval\s*\(|new Function\s*\(|\bexec(Sync)?\s*\(|child_process|subprocess\.|os\.system\(|Start-Process/,
    why: "executes code or commands; check what feeds it",
  },
];

/** Launchers that fetch a package at start-up, and how each spells an exact version. */
const LAUNCHERS = { npx: /@\d/, bunx: /@\d/, pnpx: /@\d/, uvx: /==\d|@\d/, pipx: /==\d|@\d/ };

/**
 * MCP server declarations, read as JSON rather than matched as text: a regex cannot tell
 * the package argument from a flag. Any JSON file with an mcpServers map is read.
 */
export function mcpFindings(rel, text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return [];
  }
  const servers = j?.mcpServers ?? j?.mcp?.servers ?? null;
  if (!servers || typeof servers !== "object") return [];
  const out = [];
  const lineOf = (name) => Math.max(1, text.split("\n").findIndex((l) => l.includes(`"${name}"`)) + 1);
  for (const [name, cfg] of Object.entries(servers)) {
    if (!cfg || typeof cfg !== "object") continue;
    const url = cfg.url ?? cfg.serverUrl;
    if (typeof url === "string" && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(url))
      out.push({ sev: "medium", rule: "remote-mcp", file: rel, line: lineOf(name), excerpt: `${name}: ${url}`, why: "a remote MCP server receives what the agent sends it" });
    const cmd = String(cfg.command ?? "").split(/[\\/]/).pop().replace(/\.(cmd|exe)$/i, "");
    const pinned = LAUNCHERS[cmd];
    if (pinned) {
      const args = (cfg.args ?? []).map(String);
      const pkg = args.find((a, i) => !a.startsWith("-") && args[i - 1] !== "--from") ?? "";
      const from = args.includes("--from") ? args[args.indexOf("--from") + 1] : undefined;
      if (!pinned.test(from ?? pkg) || /@latest$/.test(pkg))
        out.push({ sev: "medium", rule: "unpinned-mcp", file: rel, line: lineOf(name), excerpt: `${name}: ${cmd} ${args.join(" ")}`, why: "an MCP server fetched at launch without an exact version runs whatever is published that day" });
    }
  }
  return out;
}

/** CI and container builds run in throwaway environments: the same pattern weighs less there. */
const BUILD_FILE = /(^|\/)(Dockerfile[^/]*|\.github\/workflows\/.+|\.gitlab-ci\.yml|Makefile)$/i;
const TEST_FILE = /(^|\/)(__tests__|tests?|spec|fixtures?|__mocks__)\/|\.(test|spec)\.[cm]?[jt]sx?$/i;
const LOWER = { high: "medium", medium: "low", low: "low" };
function demote(r, rel) {
  if (r.id === "pipe-to-shell" && BUILD_FILE.test(rel)) return LOWER[r.sev];
  if (TEST_FILE.test(rel) && r.id !== "install-script") return LOWER[r.sev];
  return r.sev;
}

export function audit(root) {
  const findings = [];
  const hosts = new Map();
  const files = existsSync(root) && statSync(root).isDirectory() ? walk(root, WALK_MAX) : [root];
  const tooBig = [];
  const base = files.length === 1 && files[0] === root ? join(root, "..") : root;
  for (const f of files) {
    const rel = relative(base, f).replaceAll("\\", "/");
    const st = statSync(f);
    if (MEDIA_EXT.test(f)) continue;
    if (BINARY_EXT.has(extname(f).toLowerCase())) {
      findings.push({ sev: "high", rule: "binary", file: rel, line: 0, excerpt: `${st.size} bytes`, why: "a prebuilt binary cannot be reviewed" });
      continue;
    }
    if (st.size > MAX_FILE) {
      tooBig.push(rel);
      continue;
    }
    const text = readFileSync(f, "utf8");
    if (/^(MZ|\x7fELF|\xcf\xfa\xed\xfe)/.test(text.slice(0, 4))) {
      findings.push({ sev: "high", rule: "binary", file: rel, line: 0, excerpt: `${st.size} bytes`, why: "a prebuilt executable cannot be reviewed" });
      continue;
    }
    if (text.includes("\u0000")) continue; // other binary data: not code, not readable
    const lines = text.split("\n");
    for (const r of RULES) {
      if (!r.files.test(rel)) continue;
      lines.forEach((l, i) => {
        const m = r.re.exec(l);
        if (m) findings.push({ sev: demote(r, rel), rule: r.id, file: rel, line: i + 1, excerpt: l.trim().slice(0, 160), why: r.why });
      });
      // Multi-line JSON configs: match on the whole file once if no line matched.
      if (/json$/i.test(rel) && !findings.some((x) => x.rule === r.id && x.file === rel)) {
        const m = r.re.exec(text);
        if (m) findings.push({ sev: demote(r, rel), rule: r.id, file: rel, line: text.slice(0, m.index).split("\n").length, excerpt: m[0].replace(/\s+/g, " ").slice(0, 160), why: r.why });
      }
    }
    if (/\.json$/i.test(rel)) findings.push(...mcpFindings(rel, text));
    if (/\.(m?[jt]s|py|sh|ps1|rb|go)$/i.test(rel))
      for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
        const h = m[1].toLowerCase();
        if (!/(^|\.)(github\.com|githubusercontent\.com|npmjs\.(com|org)|example\.(com|org)|w3\.org|schema\.org|localhost)$/.test(h)) hosts.set(h, (hosts.get(h) ?? 0) + 1);
      }
  }
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line);
  // What was NOT read is part of the result: a silent skip would read as a clean bill.
  return { files: files.length, truncated: files.length >= WALK_MAX, tooBig, findings, hosts: [...hosts].sort((a, b) => b[1] - a[1]).map(([h, n]) => ({ host: h, refs: n })), license: license(root) };
}

const LICENSES = [
  ["MIT", /\bMIT License\b|Permission is hereby granted, free of charge/i],
  ["Apache-2.0", /Apache License,?\s+Version 2\.0/i],
  ["BSD", /Redistribution and use in source and binary forms/i],
  ["MPL-2.0", /Mozilla Public License,? v(ersion)? ?2\.0/i],
  ["AGPL-3.0", /GNU AFFERO GENERAL PUBLIC LICENSE/i],
  ["LGPL", /GNU LESSER GENERAL PUBLIC LICENSE/i],
  ["GPL", /GNU GENERAL PUBLIC LICENSE/i],
  ["Unlicense", /This is free and unencumbered software released into the public domain/i],
  ["CC-BY-NC/ND", /Creative Commons Attribution[\s\S]{0,40}(NonCommercial|NoDerivatives)/i],
  ["CC-BY", /Creative Commons Attribution/i],
];

/** The licence decides whether we may copy text or only reuse the idea, rewritten. */
export function license(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) return null;
  const f = readdirSync(root).find((n) => /^(licen[cs]e|copying)([-._][\w.-]+)?$/i.test(n));
  if (!f) return { spdx: null, file: null, permissive: false };
  const text = readFileSync(join(root, f), "utf8");
  const spdx = LICENSES.find(([, re]) => re.test(text))?.[0] ?? "unknown";
  return { spdx, file: basename(f), permissive: ["MIT", "Apache-2.0", "BSD", "Unlicense", "MPL-2.0", "CC-BY"].includes(spdx) };
}
