import fs from "node:fs/promises";
import { resolveWorkspacePath } from "../utils/path.js";
import type { ProjectMemory } from "../memory/memoryStore.js";

async function readFileOrEmpty(workspaceRoot: string, relativePath: string): Promise<string> {
  try {
    const absolutePath = resolveWorkspacePath(workspaceRoot, relativePath);
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return "";
  }
}

function addUnique(
  target: string[],
  value: string,
): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function detectNodeVerifyCommands(packageJsonRaw: string): string[] {
  if (!packageJsonRaw.trim()) {
    return [];
  }

  const commands: string[] = [];
  try {
    const parsed = JSON.parse(packageJsonRaw) as {
      scripts?: Record<string, string>;
    };
    const scripts = parsed.scripts ?? {};

    if (scripts.test) {
      addUnique(commands, "npm run -s test --if-present");
    }
    if (scripts.lint) {
      addUnique(commands, "npm run -s lint --if-present");
    }
    if (scripts["format:check"]) {
      addUnique(commands, "npm run -s format:check --if-present");
    } else if (scripts.format) {
      addUnique(commands, "npm run -s format --if-present");
    }
    if (scripts.typecheck) {
      addUnique(commands, "npm run -s typecheck --if-present");
    }
    if (scripts.check) {
      addUnique(commands, "npm run -s check --if-present");
    }
  } catch {
    return commands;
  }

  return commands;
}

function detectPythonVerifyCommands(files: {
  pyproject: string;
  requirements: string;
  requirementsDev: string;
  setupCfg: string;
}): string[] {
  const combined = [
    files.pyproject,
    files.requirements,
    files.requirementsDev,
    files.setupCfg,
  ].join("\n").toLowerCase();

  const commands: string[] = [];
  if (combined.includes("pytest")) {
    addUnique(commands, "pytest -q");
  }
  if (combined.includes("ruff")) {
    addUnique(commands, "ruff check .");
  }
  if (combined.includes("black")) {
    addUnique(commands, "black --check .");
  }
  if (combined.includes("mypy")) {
    addUnique(commands, "mypy .");
  }
  return commands;
}

function extractMemoryVerifyCommands(memory: ProjectMemory): string[] {
  const commands: string[] = [];
  for (const raw of memory.commonCommands) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.toLowerCase().startsWith("verify:")) {
      addUnique(commands, trimmed.slice("verify:".length).trim());
    }
  }
  return commands;
}

export async function discoverAutoVerifyCommands(
  workspaceRoot: string,
  memory: ProjectMemory,
  maxCommands: number,
): Promise<string[]> {
  const packageJsonRaw = await readFileOrEmpty(workspaceRoot, "package.json");
  const pyproject = await readFileOrEmpty(workspaceRoot, "pyproject.toml");
  const requirements = await readFileOrEmpty(workspaceRoot, "requirements.txt");
  const requirementsDev = await readFileOrEmpty(workspaceRoot, "requirements-dev.txt");
  const setupCfg = await readFileOrEmpty(workspaceRoot, "setup.cfg");

  const commands: string[] = [];
  for (const command of extractMemoryVerifyCommands(memory)) {
    addUnique(commands, command);
  }
  for (const command of detectNodeVerifyCommands(packageJsonRaw)) {
    addUnique(commands, command);
  }
  for (const command of detectPythonVerifyCommands({
    pyproject,
    requirements,
    requirementsDev,
    setupCfg,
  })) {
    addUnique(commands, command);
  }

  return commands.slice(0, Math.max(1, maxCommands));
}
