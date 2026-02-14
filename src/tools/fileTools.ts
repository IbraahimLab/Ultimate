import fs from "node:fs/promises";
import path from "node:path";
import { resolveWorkspacePath, toWorkspaceRelativePath } from "../utils/path.js";
import { clipText } from "../utils/strings.js";

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  ".idea",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
]);

export interface ListFilesInput {
  workspaceRoot: string;
  path?: string;
  recursive?: boolean;
  depth?: number;
  maxEntries?: number;
}

export interface ReadFileInput {
  workspaceRoot: string;
  path: string;
  startLine?: number;
  endLine?: number;
  maxChars?: number;
}

export async function listFiles(input: ListFilesInput): Promise<string[]> {
  const basePath = resolveWorkspacePath(input.workspaceRoot, input.path ?? ".");
  const recursive = input.recursive ?? true;
  const maxDepth = input.depth ?? 4;
  const maxEntries = input.maxEntries ?? 200;
  const results: string[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (results.length >= maxEntries) {
      return;
    }

    let entries = await fs.readdir(currentPath, { withFileTypes: true });
    entries = entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (results.length >= maxEntries) {
        return;
      }

      const absolute = path.join(currentPath, entry.name);
      const relative = toWorkspaceRelativePath(input.workspaceRoot, absolute);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        results.push(`${relative}/`);
        if (recursive && depth < maxDepth) {
          await walk(absolute, depth + 1);
        }
        continue;
      }

      results.push(relative);
    }
  }

  const stats = await fs.stat(basePath);
  if (stats.isFile()) {
    return [toWorkspaceRelativePath(input.workspaceRoot, basePath)];
  }

  await walk(basePath, 0);
  return results;
}

export interface ReadFileResult {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
}

export async function readFileSegment(input: ReadFileInput): Promise<ReadFileResult> {
  const absolutePath = resolveWorkspacePath(input.workspaceRoot, input.path);
  const maxChars = input.maxChars ?? 14_000;
  const raw = await fs.readFile(absolutePath, "utf8");
  const lines = raw.split(/\r?\n/u);
  const startLine = Math.max(1, input.startLine ?? 1);
  const endLine = Math.min(lines.length, input.endLine ?? lines.length);
  const sliced = lines.slice(startLine - 1, endLine).join("\n");

  return {
    path: toWorkspaceRelativePath(input.workspaceRoot, absolutePath),
    startLine,
    endLine,
    content: clipText(sliced, maxChars),
  };
}

export async function writeFile(
  workspaceRoot: string,
  filePath: string,
  content: string,
): Promise<void> {
  const absolutePath = resolveWorkspacePath(workspaceRoot, filePath);
  const dirPath = path.dirname(absolutePath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

export async function readFileIfExists(
  workspaceRoot: string,
  filePath: string,
): Promise<string> {
  const absolutePath = resolveWorkspacePath(workspaceRoot, filePath);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function fileExists(
  workspaceRoot: string,
  filePath: string,
): Promise<boolean> {
  const absolutePath = resolveWorkspacePath(workspaceRoot, filePath);
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFileIfExists(
  workspaceRoot: string,
  filePath: string,
): Promise<void> {
  const absolutePath = resolveWorkspacePath(workspaceRoot, filePath);
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return;
    }
    throw error;
  }
}
