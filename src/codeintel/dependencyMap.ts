import fs from "node:fs/promises";
import { resolveWorkspacePath } from "../utils/path.js";
import type { DependencyMap } from "./types.js";

async function readFileOrEmpty(workspaceRoot: string, relativePath: string): Promise<string> {
  try {
    const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return "";
  }
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/gu, "");
}

function parseRequirements(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const noInlineComment = trimmed.split("#")[0]?.trim() ?? trimmed;
    const match = noInlineComment.match(/^([A-Za-z0-9._-]+)\s*([<>=!~]{1,2}\s*.+)?$/u);
    if (!match?.[1]) {
      continue;
    }
    const name = match[1].toLowerCase();
    const version = (match[2] ?? "").replace(/\s+/gu, "");
    result[name] = version || "unspecified";
  }
  return result;
}

function parseTomlProjectDependencies(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  const projectArrayMatch = content.match(
    /\[project\][\s\S]*?\bdependencies\s*=\s*\[([\s\S]*?)\]/u,
  );
  if (projectArrayMatch?.[1]) {
    const parts = projectArrayMatch[1]
      .split(",")
      .map((entry) => stripQuotes(entry))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    for (const part of parts) {
      const m = part.match(/^([A-Za-z0-9._-]+)(.*)$/u);
      if (m?.[1]) {
        result[m[1].toLowerCase()] = m[2]?.trim() || "unspecified";
      }
    }
  }

  const poetrySectionMatch = content.match(
    /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[[^\]]+\]|$)/u,
  );
  if (poetrySectionMatch?.[1]) {
    const lines = poetrySectionMatch[1].split(/\r?\n/u);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
      if (key === "python") {
        continue;
      }
      const value = stripQuotes(trimmed.slice(eqIndex + 1));
      result[key] = value || "unspecified";
    }
  }

  return result;
}

export async function buildDependencyMap(workspaceRoot: string): Promise<DependencyMap> {
  const dependencyMap: DependencyMap = {
    node: {},
    nodeDev: {},
    python: {},
    pythonDev: {},
  };

  const packageJsonRaw = await readFileOrEmpty(workspaceRoot, "package.json");
  if (packageJsonRaw) {
    try {
      const packageJson = JSON.parse(packageJsonRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      dependencyMap.node = packageJson.dependencies ?? {};
      dependencyMap.nodeDev = packageJson.devDependencies ?? {};
    } catch {
      // Ignore malformed package.json and continue.
    }
  }

  const requirementsRaw = await readFileOrEmpty(workspaceRoot, "requirements.txt");
  if (requirementsRaw) {
    dependencyMap.python = {
      ...dependencyMap.python,
      ...parseRequirements(requirementsRaw),
    };
  }

  const requirementsDevRaw = await readFileOrEmpty(workspaceRoot, "requirements-dev.txt");
  if (requirementsDevRaw) {
    dependencyMap.pythonDev = {
      ...dependencyMap.pythonDev,
      ...parseRequirements(requirementsDevRaw),
    };
  }

  const pyprojectRaw = await readFileOrEmpty(workspaceRoot, "pyproject.toml");
  if (pyprojectRaw) {
    dependencyMap.python = {
      ...dependencyMap.python,
      ...parseTomlProjectDependencies(pyprojectRaw),
    };
  }

  return dependencyMap;
}
