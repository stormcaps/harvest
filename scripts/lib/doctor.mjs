// What is installed, what each missing tool unlocks, and the official line to install it.
import { run, tool, which } from "./util.mjs";
import { whisperModel } from "./media.mjs";

const OS = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";

const TOOLS = [
  {
    name: "yt-dlp",
    unlocks: "video sources (YouTube, TikTok, Instagram/X/Reddit videos, Vimeo, Loom…): description, captions, audio, frames",
    version: ["--version"],
    install: {
      windows: "winget install yt-dlp.yt-dlp",
      macos: "brew install yt-dlp",
      linux: "pipx install yt-dlp   (or your package manager)",
    },
    docs: "https://github.com/yt-dlp/yt-dlp#installation",
  },
  {
    name: "ffmpeg",
    unlocks: "contact sheets (tier 3), kept frames, audio conversion for speech-to-text",
    version: ["-version"],
    install: { windows: "winget install Gyan.FFmpeg", macos: "brew install ffmpeg", linux: "sudo apt install ffmpeg   (or your package manager)" },
    docs: "https://ffmpeg.org/download.html",
  },
  {
    name: "whisper-cli",
    unlocks: "speech-to-text when a video has no captions (tier 2) — runs locally, nothing is uploaded",
    version: ["--help"],
    install: {
      windows: "download whisper-bin-x64.zip from https://github.com/ggml-org/whisper.cpp/releases , unzip, add the folder holding whisper-cli.exe to PATH",
      macos: "brew install whisper-cpp",
      linux: "build from https://github.com/ggml-org/whisper.cpp (cmake -B build && cmake --build build -j)",
    },
    docs: "https://github.com/ggml-org/whisper.cpp#quick-start",
  },
];

export function doctor() {
  const rows = TOOLS.map((t) => {
    const path = tool(t.name);
    let version = null;
    if (path) {
      const r = run(path, t.version, { timeout: 15000 });
      version = (r.stdout || r.stderr).split("\n").find((l) => l.trim())?.trim().slice(0, 80) ?? "present";
    }
    return { ...t, path, version, installLine: t.install[OS] };
  });
  const model = whisperModel();
  return {
    os: OS,
    node: process.version,
    nodeOk: +process.versions.node.split(".")[0] >= 22,
    tools: rows,
    whisperModel: model,
    deno: Boolean(which("deno")),
    gh: Boolean(which("gh")),
  };
}

export function renderDoctor(d) {
  const out = [`# harvest doctor — ${d.os}, Node ${d.node}${d.nodeOk ? "" : "  ✗ Node ≥ 22 required"}`, ""];
  out.push("Always available (no install): Instagram, Threads, X, Bluesky, Reddit, Hacker News, GitHub, gists, articles — text tier.", "");
  for (const t of d.tools) {
    out.push(`${t.path ? "✓" : "✗"} ${t.name}${t.path ? `  ${t.version}` : ""}`);
    out.push(`    unlocks: ${t.unlocks}`);
    if (!t.path) out.push(`    install: ${t.installLine}`, `    docs:    ${t.docs}`);
  }
  const w = d.tools.find((t) => t.name === "whisper-cli");
  if (w.path)
    out.push(
      d.whisperModel
        ? `✓ whisper model  ${d.whisperModel}`
        : "✗ whisper model  none found next to whisper-cli. Download ggml-base.bin (142 MB, multilingual) or ggml-small.bin (466 MB, more accurate) from https://huggingface.co/ggerganov/whisper.cpp/tree/main into a models/ folder beside the binary, or set HARVEST_WHISPER_MODEL to its path.",
    );
  out.push(
    "",
    `JavaScript runtime for YouTube: ${d.deno ? "Deno" : "Node (passed to yt-dlp automatically — Deno is not needed)"}`,
    "GitHub API: anonymous, 60 requests an hour (two per repository read)",
  );
  return out.join("\n");
}
