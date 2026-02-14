import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { listFiles } from "./fileTools.js";
import { resolveWorkspacePath, toWorkspaceRelativePath } from "../utils/path.js";

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export interface GrepResult {
  backend: "rg" | "js";
  matches: GrepMatch[];
  totalScannedFiles: number;
}

let rgAvailableCache: boolean | null = null;

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function hasRipgrep(workspaceRoot: string): Promise<boolean> {
  if (rgAvailableCache !== null) {
    return rgAvailableCache;
  }

  try {
    const result = await runProcess("rg", ["--version"], workspaceRoot, 5_000);
    rgAvailableCache = result.exitCode === 0;
  } catch {
    rgAvailableCache = false;
  }

  return rgAvailableCache;
}

function compileLineMatcher(pattern: string): (line: string) => boolean {
  try {
    const regex = new RegExp(pattern);
    return (line) => regex.test(line);
  } catch {
    const lowered = pattern.toLowerCase();
    return (line) => line.toLowerCase().includes(lowered);
  }
}

function canReadAsText(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const binaryLikeExt = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".tar",
    ".7z",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".class",
    ".jar",
    ".mp3",
    ".mp4",
    ".mov",
    ".avi",
  ]);

  return !binaryLikeExt.has(ext);
}

async function grepWithJs(
  workspaceRoot: string,
  pattern: string,
  maxMatches: number,
): Promise<GrepResult> {
  const matcher = compileLineMatcher(pattern);
  const files = await listFiles({
    workspaceRoot,
    recursive: true,
    depth: 8,
    maxEntries: 2_500,
  });

  const filePaths = files.filter((file) => !file.endsWith("/") && canReadAsText(file));
  const matches: GrepMatch[] = [];
  let scannedFiles = 0;

  for (const file of filePaths) {
    if (matches.length >= maxMatches) {
      break;
    }

    const absolute = resolveWorkspacePath(workspaceRoot, file);
    let raw = "";
    try {
      raw = await fs.readFile(absolute, "utf8");
    } catch {
      continue;
    }

    scannedFiles += 1;
    const lines = raw.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      if (matches.length >= maxMatches) {
        break;
      }
      const line = lines[index] ?? "";
      if (matcher(line)) {
        matches.push({
          path: file,
          line: index + 1,
          text: line,
        });
      }
    }
  }

  return {
    backend: "js",
    matches,
    totalScannedFiles: scannedFiles,
  };
}

async function grepWithRipgrep(
  workspaceRoot: string,
  pattern: string,
  glob: string | undefined,
  maxMatches: number,
  timeoutMs: number,
): Promise<GrepResult> {
  const args = ["--json", "--line-number", "--color", "never"];
  if (glob && glob.trim().length > 0) {
    args.push("-g", glob);
  }
  args.push(pattern, ".");

  const run = await runProcess("rg", args, workspaceRoot, timeoutMs);
  if (run.exitCode !== 0 && run.exitCode !== 1) {
    throw new Error(`ripgrep failed: ${run.stderr || run.stdout}`);
  }

  const matches: GrepMatch[] = [];
  const lines = run.stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);

  for (const line of lines) {
    if (matches.length >= maxMatches) {
      break;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed?.type !== "match") {
      continue;
    }

    const filePath = parsed?.data?.path?.text;
    const lineNumber = parsed?.data?.line_number;
    const lineText = parsed?.data?.lines?.text;
    if (typeof filePath !== "string" || typeof lineNumber !== "number" || typeof lineText !== "string") {
      continue;
    }

    matches.push({
      path: toWorkspaceRelativePath(workspaceRoot, resolveWorkspacePath(workspaceRoot, filePath)),
      line: lineNumber,
      text: lineText.trimEnd(),
    });
  }

  return {
    backend: "rg",
    matches,
    totalScannedFiles: 0,
  };
}

export async function grepWorkspace(
  workspaceRoot: string,
  pattern: string,
  glob: string | undefined,
  maxMatches: number,
  timeoutMs: number,
): Promise<GrepResult> {
  if (await hasRipgrep(workspaceRoot)) {
    try {
      return await grepWithRipgrep(workspaceRoot, pattern, glob, maxMatches, timeoutMs);
    } catch {
      return grepWithJs(workspaceRoot, pattern, maxMatches);
    }
  }

  return grepWithJs(workspaceRoot, pattern, maxMatches);
}
