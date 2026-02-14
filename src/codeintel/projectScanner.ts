import fs from "node:fs/promises";
import path from "node:path";
import { listFiles } from "../tools/fileTools.js";
import { resolveWorkspacePath } from "../utils/path.js";
import { parseTsOrJsFile } from "./adapters/tsJsAdapter.js";
import { parsePythonFile } from "./adapters/pythonAdapter.js";
import { buildDependencyMap } from "./dependencyMap.js";
import { detectLanguage, isLanguageIndexed } from "./language.js";
import type {
  DependencyMap,
  ProjectIndex,
  SymbolEntry,
  SupportedLanguage,
  UseEntry,
} from "./types.js";

interface ScanOptions {
  refresh?: boolean;
  maxFiles?: number;
}

interface LookupOptions {
  language?: string;
  limit?: number;
}

function normalizeLanguage(value: string | undefined): SupportedLanguage | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (normalized === "ts" || normalized === "typescript") {
    return "typescript";
  }
  if (normalized === "js" || normalized === "javascript") {
    return "javascript";
  }
  if (normalized === "py" || normalized === "python") {
    return "python";
  }
  return undefined;
}

function limitValue(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), 2_000);
}

function toSummary(index: ProjectIndex): Record<string, unknown> {
  return {
    generatedAt: index.generatedAt,
    totalFilesScanned: index.totalFilesScanned,
    languages: index.languages,
    symbolCount: index.symbols.length,
    importCount: index.imports.length,
    usageCount: index.uses.length,
    dependencyCounts: {
      node: Object.keys(index.dependencies.node).length,
      nodeDev: Object.keys(index.dependencies.nodeDev).length,
      python: Object.keys(index.dependencies.python).length,
      pythonDev: Object.keys(index.dependencies.pythonDev).length,
    },
  };
}

export class ProjectScanner {
  private readonly workspaceRoot: string;
  private readonly stateDir: string;
  private readonly maxFilesDefault: number;
  private cachedIndex: ProjectIndex | null = null;
  private inFlightScan: Promise<ProjectIndex> | null = null;

  public constructor(workspaceRoot: string, stateDir: string, maxFilesDefault: number) {
    this.workspaceRoot = workspaceRoot;
    this.stateDir = stateDir;
    this.maxFilesDefault = maxFilesDefault;
  }

  public async scan(options: ScanOptions = {}): Promise<ProjectIndex> {
    if (!options.refresh && this.cachedIndex) {
      return this.cachedIndex;
    }

    if (this.inFlightScan) {
      return this.inFlightScan;
    }

    this.inFlightScan = this.buildIndex(options.maxFiles);
    try {
      const index = await this.inFlightScan;
      this.cachedIndex = index;
      await this.persistIndex(index);
      return index;
    } finally {
      this.inFlightScan = null;
    }
  }

  public async getSummary(refresh = false): Promise<Record<string, unknown>> {
    const index = await this.scan({ refresh });
    return toSummary(index);
  }

  public async lookupSymbols(
    query: string,
    options: LookupOptions = {},
  ): Promise<SymbolEntry[]> {
    const index = await this.scan();
    const languageFilter = normalizeLanguage(options.language);
    const limit = limitValue(options.limit, 80);
    const needle = query.trim().toLowerCase();

    let symbols = index.symbols;
    if (languageFilter) {
      symbols = symbols.filter((symbol) => symbol.language === languageFilter);
    }

    const exactMatches = symbols.filter((symbol) => symbol.name.toLowerCase() === needle);
    const containsMatches = symbols.filter((symbol) => {
      const name = symbol.name.toLowerCase();
      return name.includes(needle) && name !== needle;
    });
    const merged = [...exactMatches, ...containsMatches];
    return merged.slice(0, limit);
  }

  public async findReferences(
    symbol: string,
    options: LookupOptions = {},
  ): Promise<UseEntry[]> {
    const index = await this.scan();
    const languageFilter = normalizeLanguage(options.language);
    const limit = limitValue(options.limit, 120);
    const needle = symbol.trim();

    let uses = index.uses.filter((entry) => entry.name === needle);
    if (languageFilter) {
      uses = uses.filter((entry) => entry.language === languageFilter);
    }
    return uses.slice(0, limit);
  }

  public async getDependencyMap(refresh = false): Promise<DependencyMap> {
    const index = await this.scan({ refresh });
    return index.dependencies;
  }

  private async buildIndex(maxFilesOverride: number | undefined): Promise<ProjectIndex> {
    const maxFiles = limitValue(maxFilesOverride, this.maxFilesDefault);
    const entries = await listFiles({
      workspaceRoot: this.workspaceRoot,
      path: ".",
      recursive: true,
      depth: 16,
      maxEntries: maxFiles * 2,
    });

    const filePaths = entries
      .filter((entry) => !entry.endsWith("/"))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, maxFiles);

    const files: ProjectIndex["files"] = [];
    const symbols: ProjectIndex["symbols"] = [];
    const imports: ProjectIndex["imports"] = [];
    const uses: ProjectIndex["uses"] = [];
    const languages: Record<string, number> = {};

    for (const filePath of filePaths) {
      const absolutePath = resolveWorkspacePath(this.workspaceRoot, filePath);

      let stat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        stat = await fs.stat(absolutePath);
      } catch {
        continue;
      }

      if (!stat.isFile()) {
        continue;
      }

      const language = detectLanguage(filePath);
      languages[language] = (languages[language] ?? 0) + 1;

      let content = "";
      try {
        content = await fs.readFile(absolutePath, "utf8");
      } catch {
        content = "";
      }

      const lineCount = content ? content.split(/\r?\n/u).length : 0;
      files.push({
        path: filePath,
        language,
        sizeBytes: stat.size,
        lineCount,
      });

      if (!isLanguageIndexed(language)) {
        continue;
      }
      if (stat.size > 1_000_000) {
        continue;
      }

      if (language === "typescript" || language === "javascript") {
        const parsed = parseTsOrJsFile(filePath, content, language);
        symbols.push(...parsed.symbols);
        imports.push(...parsed.imports);
        uses.push(...parsed.uses);
      } else if (language === "python") {
        const parsed = parsePythonFile(filePath, content);
        symbols.push(...parsed.symbols);
        imports.push(...parsed.imports);
        uses.push(...parsed.uses);
      }
    }

    const dependencies = await buildDependencyMap(this.workspaceRoot);

    return {
      generatedAt: new Date().toISOString(),
      workspaceRoot: this.workspaceRoot,
      totalFilesScanned: files.length,
      languages,
      files,
      symbols,
      imports,
      uses,
      dependencies,
    };
  }

  private async persistIndex(index: ProjectIndex): Promise<void> {
    const indexDir = path.resolve(this.stateDir, "index");
    const outputPath = path.resolve(indexDir, "project-index.json");
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(index, null, 2), "utf8");
  }
}
