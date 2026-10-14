// Markdown rendering of harvest results — what the agent reads.
import { fmtBytes, stamp } from "./util.mjs";

const VIDEO_SOURCES = new Set(["youtube", "tiktok", "video", "instagram", "x", "reddit", "bluesky", "threads"]);

function section(title, body) {
  return body ? `\n## ${title}\n\n${body}\n` : "";
}

export function render(r) {
  if (r.error) return `✗ ${r.source}: ${r.error}${r.missing ? `\n  missing tool: ${r.missing} — run doctor` : ""}`;
  const head = [
    `# ${r.title ?? r.text?.split("\n")[0]?.slice(0, 90) ?? r.url}`,
    "",
    `- source: ${r.source} · ${r.url}`,
    r.author && `- author: ${r.author}`,
    r.date && `- date: ${r.date}`,
    r.media && `- media: ${r.media.kind}${r.media.duration ? ` · ${stamp(r.media.duration)}` : ""}${r.media.count > 1 ? ` · ${r.media.count} videos` : ""}`,
    r.stats && Object.values(r.stats).some((v) => v != null) && `- stats: ${Object.entries(r.stats).filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}`).join(" · ")}`,
    r.language && `- language: ${r.language}`,
    r.captions && `- captions: ${r.captions.manual.length ? `human [${r.captions.manual.slice(0, 6).join(", ")}]` : "no human captions"}${r.captions.auto.length ? ` · auto [${r.captions.auto.join(", ")}]` : ""}`,
  ].filter(Boolean);
  let out = head.join("\n") + "\n";
  for (const n of r.notes ?? []) out += `\n> ⚠ ${n}`;
  if (r.notes?.length) out += "\n";
  if (r.repo) {
    const p = r.repo;
    out += section(
      "Repository",
      [
        `${p.description ?? ""}`,
        `- commit read: ${p.sha} · ${p.files} files · ${fmtBytes(p.bytes)} archive · ★ ${p.stars} · licence ${p.license ?? "NONE"}${p.licensePermissive ? "" : " → reuse ideas, rewritten; never copy text"}${p.archived ? " · ARCHIVED" : ""}`,
        `- languages: ${p.langs.map(([e, n]) => `${e} ${n}`).join(", ")}`,
        `- extracted at: ${r.workdir}`,
        r.focus && `- the link points into: ${r.focus} — read that first`,
      ].filter(Boolean).join("\n"),
    );
    out += section(
      "Inventory",
      Object.entries(r.inventory)
        .map(([k, items]) => `**${k}** (${items.length})\n` + items.slice(0, 40).map((i) => `- ${i.path}${i.description ? ` — ${i.description.slice(0, 160)}` : ""}`).join("\n") + (items.length > 40 ? `\n- … ${items.length - 40} more` : ""))
        .join("\n\n"),
    );
    if (r.changed) out += section(`Changed since the last harvest (${r.changed.length})`, r.changed.slice(0, 80).map((c) => `- ${c}`).join("\n"));
    out += section("Audit", renderAudit(r.audit));
  }
  if (r.chapters?.length) out += section("Chapters", r.chapters.map((c) => `- [${stamp(c.t)}] ${c.title}`).join("\n"));
  out += section(r.source === "github" ? "README" : "Text", r.text?.trim());
  if (r.quote) out += section(`Quoted post (@${r.quote.author})`, r.quote.text);
  if (r.thread?.length) out += section(`Thread (${r.thread.length} more posts by the author)`, r.thread.map((t, i) => `**${i + 2}.** ${t.text}`).join("\n\n"));
  if (r.comments?.length) out += section(`Replies (top ${r.comments.length})`, r.comments.map((c) => `- ${"  ".repeat(c.depth ?? 0)}**${c.author}**${c.score ? ` (${c.score})` : ""}: ${c.text.replace(/\n+/g, " ")}`).join("\n"));
  const photos = r.media?.photos ?? [];
  if (photos.length) out += section(`Images (${photos.length})`, "Screenshots often carry the content (code, a UI, a list) — read them with `images <url>`.\n\n" + photos.slice(0, 8).map((u) => `- ${u}`).join("\n"));
  if (r.links?.length) out += section("Links", r.links.slice(0, 60).map((l) => `- ${l}`).join("\n"));
  if (r.mentions?.length) out += `\nMentions: ${r.mentions.join(" ")}\n`;
  const next = [];
  if (r.media?.kind === "video" && VIDEO_SOURCES.has(r.source)) next.push("transcript (what is said)", "frames (what is shown) — only if the text is not enough");
  if (r.source === "github") next.push(`clean ${r.url} when done`);
  if (next.length) out += `\nNext tiers: ${next.join(" · ")}\n`;
  if (r.cost) out += `\nCost: ${r.cost.ms} ms · ${fmtBytes(r.cost.bytes ?? 0)} fetched${r.cost.onDisk ? ` · ${fmtBytes(r.cost.onDisk)} in the work folder` : " · nothing written"}\n`;
  return out;
}

export function renderAudit(a) {
  const by = (s) => a.findings.filter((f) => f.sev === s);
  const lines = [`${a.files} files scanned · ${by("high").length} high · ${by("medium").length} medium · ${by("low").length} low · licence ${a.license?.spdx ?? "none found"}`];
  const shown = a.findings.filter((f) => f.sev !== "low");
  for (const f of shown.slice(0, 40)) lines.push(`- **${f.sev}** ${f.rule} — ${f.file}:${f.line} — ${f.why}\n  \`${f.excerpt.replace(/`/g, "'")}\``);
  if (shown.length > 40) lines.push(`- … ${shown.length - 40} more high/medium findings: run the audit with --json to see them all`);
  const low = by("low");
  for (const rule of [...new Set(low.map((f) => f.rule))]) {
    const files = [...new Set(low.filter((f) => f.rule === rule).map((f) => f.file))];
    lines.push(`- low · ${rule}: ${low.filter((f) => f.rule === rule).length} in ${files.slice(0, 6).join(", ")}${files.length > 6 ? ", …" : ""}`);
  }
  if (a.tooBig?.length) lines.push(`- NOT scanned (over 512 KB): ${a.tooBig.slice(0, 8).join(", ")}${a.tooBig.length > 8 ? ", …" : ""} — open them if they are code`);
  if (a.truncated) lines.push("- NOT complete: stopped at 20,000 files");
  if (a.hosts.length) lines.push(`- network hosts in code: ${a.hosts.slice(0, 15).map((h) => h.host).join(", ")}`);
  lines.push("A clean audit means nothing known-bad was found — not that it is safe. Read every hook, MCP command and install script it lists.");
  return lines.join("\n");
}
