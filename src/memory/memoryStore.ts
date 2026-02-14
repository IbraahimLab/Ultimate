import fs from "node:fs/promises";
import path from "node:path";
import type { MemoryUpdates } from "../types.js";

export interface ProjectMemory {
  projectRules: string[];
  architectureNotes: string[];
  commonCommands: string[];
  kv: Record<string, string>;
  updatedAt: string;
}

function uniqNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}

const DEFAULT_MEMORY: ProjectMemory = {
  projectRules: [],
  architectureNotes: [],
  commonCommands: [],
  kv: {},
  updatedAt: new Date(0).toISOString(),
};

export class MemoryStore {
  private readonly memoryPath: string;
  private loaded = false;
  private memory: ProjectMemory = { ...DEFAULT_MEMORY };

  public constructor(stateDir: string) {
    this.memoryPath = path.resolve(stateDir, "memory.json");
  }

  public async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.memory = await this.readFromDisk();
    this.loaded = true;
  }

  public async getSnapshot(): Promise<ProjectMemory> {
    await this.ensureLoaded();
    return {
      projectRules: [...this.memory.projectRules],
      architectureNotes: [...this.memory.architectureNotes],
      commonCommands: [...this.memory.commonCommands],
      kv: { ...this.memory.kv },
      updatedAt: this.memory.updatedAt,
    };
  }

  public async get(key: string): Promise<string | undefined> {
    await this.ensureLoaded();
    return this.memory.kv[key];
  }

  public async set(key: string, value: string): Promise<void> {
    await this.ensureLoaded();
    this.memory.kv[key] = value;
    this.memory.updatedAt = new Date().toISOString();
    await this.writeToDisk();
  }

  public async applyUpdates(updates: MemoryUpdates | undefined): Promise<string[]> {
    await this.ensureLoaded();
    if (!updates) {
      return [];
    }

    const changed: string[] = [];

    if (Array.isArray(updates.projectRules) && updates.projectRules.length > 0) {
      const next = uniqNonEmpty([...this.memory.projectRules, ...updates.projectRules]);
      if (next.join("\n") !== this.memory.projectRules.join("\n")) {
        this.memory.projectRules = next.slice(0, 200);
        changed.push(`projectRules(+${updates.projectRules.length})`);
      }
    }

    if (Array.isArray(updates.architectureNotes) && updates.architectureNotes.length > 0) {
      const next = uniqNonEmpty([...this.memory.architectureNotes, ...updates.architectureNotes]);
      if (next.join("\n") !== this.memory.architectureNotes.join("\n")) {
        this.memory.architectureNotes = next.slice(0, 200);
        changed.push(`architectureNotes(+${updates.architectureNotes.length})`);
      }
    }

    if (Array.isArray(updates.commonCommands) && updates.commonCommands.length > 0) {
      const next = uniqNonEmpty([...this.memory.commonCommands, ...updates.commonCommands]);
      if (next.join("\n") !== this.memory.commonCommands.join("\n")) {
        this.memory.commonCommands = next.slice(0, 200);
        changed.push(`commonCommands(+${updates.commonCommands.length})`);
      }
    }

    if (updates.kv && typeof updates.kv === "object") {
      for (const [key, value] of Object.entries(updates.kv)) {
        if (typeof value !== "string") {
          continue;
        }
        if (this.memory.kv[key] !== value) {
          this.memory.kv[key] = value;
          changed.push(`kv.${key}`);
        }
      }
    }

    if (changed.length > 0) {
      this.memory.updatedAt = new Date().toISOString();
      await this.writeToDisk();
    }

    return changed;
  }

  private async readFromDisk(): Promise<ProjectMemory> {
    try {
      const raw = await fs.readFile(this.memoryPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ProjectMemory>;
      return {
        projectRules: Array.isArray(parsed.projectRules)
          ? uniqNonEmpty(parsed.projectRules.map((item) => String(item)))
          : [],
        architectureNotes: Array.isArray(parsed.architectureNotes)
          ? uniqNonEmpty(parsed.architectureNotes.map((item) => String(item)))
          : [],
        commonCommands: Array.isArray(parsed.commonCommands)
          ? uniqNonEmpty(parsed.commonCommands.map((item) => String(item)))
          : [],
        kv: parsed.kv && typeof parsed.kv === "object"
          ? Object.fromEntries(
            Object.entries(parsed.kv).map(([key, value]) => [key, String(value)]),
          )
          : {},
        updatedAt: typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
      };
    } catch {
      return {
        ...DEFAULT_MEMORY,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  private async writeToDisk(): Promise<void> {
    await fs.mkdir(path.dirname(this.memoryPath), { recursive: true });
    await fs.writeFile(this.memoryPath, JSON.stringify(this.memory, null, 2), "utf8");
  }
}
