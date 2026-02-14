import type {
  AgentAction,
  AgentModelResponse,
  AgentStatus,
  MemoryUpdates,
  VerifyCommand,
} from "../types.js";

function extractJson(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

function normalizeStatus(value: unknown): AgentStatus {
  if (value === "done" || value === "need_user" || value === "continue") {
    return value;
  }
  return "continue";
}

function normalizePlan(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item))
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

function normalizeVerify(value: unknown): VerifyCommand[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const commands: VerifyCommand[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0) {
      commands.push({ command: item.trim() });
      continue;
    }
    if (item && typeof item === "object" && "command" in item) {
      const commandValue = (item as { command?: unknown }).command;
      if (typeof commandValue === "string" && commandValue.trim().length > 0) {
        commands.push({ command: commandValue.trim() });
      }
    }
  }

  return commands.slice(0, 8);
}

function normalizeActions(value: unknown): AgentAction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const actions: AgentAction[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const toolName = String((item as { tool?: unknown }).tool ?? "").trim();
    switch (toolName) {
      case "list_files": {
        const action: AgentAction = {
          tool: "list_files",
          path: typeof (item as { path?: unknown }).path === "string"
            ? String((item as { path?: unknown }).path)
            : undefined,
          recursive: typeof (item as { recursive?: unknown }).recursive === "boolean"
            ? Boolean((item as { recursive?: unknown }).recursive)
            : undefined,
          depth: Number.isFinite((item as { depth?: unknown }).depth)
            ? Number((item as { depth?: unknown }).depth)
            : undefined,
          maxEntries: Number.isFinite((item as { maxEntries?: unknown }).maxEntries)
            ? Number((item as { maxEntries?: unknown }).maxEntries)
            : undefined,
        };
        actions.push(action);
        break;
      }
      case "read_file": {
        const path = (item as { path?: unknown }).path;
        if (typeof path !== "string" || path.trim().length === 0) {
          break;
        }

        const action: AgentAction = {
          tool: "read_file",
          path,
          startLine: Number.isFinite((item as { startLine?: unknown }).startLine)
            ? Number((item as { startLine?: unknown }).startLine)
            : undefined,
          endLine: Number.isFinite((item as { endLine?: unknown }).endLine)
            ? Number((item as { endLine?: unknown }).endLine)
            : undefined,
        };
        actions.push(action);
        break;
      }
      case "grep": {
        const pattern = (item as { pattern?: unknown }).pattern;
        if (typeof pattern !== "string" || pattern.trim().length === 0) {
          break;
        }

        const action: AgentAction = {
          tool: "grep",
          pattern,
          glob: typeof (item as { glob?: unknown }).glob === "string"
            ? String((item as { glob?: unknown }).glob)
            : undefined,
          maxMatches: Number.isFinite((item as { maxMatches?: unknown }).maxMatches)
            ? Number((item as { maxMatches?: unknown }).maxMatches)
            : undefined,
        };
        actions.push(action);
        break;
      }
      case "run_command": {
        const command = (item as { command?: unknown }).command;
        if (typeof command !== "string" || command.trim().length === 0) {
          break;
        }
        actions.push({
          tool: "run_command",
          command,
        });
        break;
      }
      case "write_file": {
        const filePath = (item as { path?: unknown }).path;
        const content = (item as { content?: unknown }).content;
        if (typeof filePath !== "string" || filePath.trim().length === 0) {
          break;
        }
        if (typeof content !== "string") {
          break;
        }
        actions.push({
          tool: "write_file",
          path: filePath,
          content,
        });
        break;
      }
      case "scan_project": {
        const action: AgentAction = {
          tool: "scan_project",
          refresh: typeof (item as { refresh?: unknown }).refresh === "boolean"
            ? Boolean((item as { refresh?: unknown }).refresh)
            : undefined,
          maxFiles: Number.isFinite((item as { maxFiles?: unknown }).maxFiles)
            ? Number((item as { maxFiles?: unknown }).maxFiles)
            : undefined,
        };
        actions.push(action);
        break;
      }
      case "symbol_lookup": {
        const query = (item as { query?: unknown }).query;
        if (typeof query !== "string" || query.trim().length === 0) {
          break;
        }
        actions.push({
          tool: "symbol_lookup",
          query,
          language: typeof (item as { language?: unknown }).language === "string"
            ? String((item as { language?: unknown }).language)
            : undefined,
          limit: Number.isFinite((item as { limit?: unknown }).limit)
            ? Number((item as { limit?: unknown }).limit)
            : undefined,
        });
        break;
      }
      case "find_references": {
        const symbol = (item as { symbol?: unknown }).symbol;
        if (typeof symbol !== "string" || symbol.trim().length === 0) {
          break;
        }
        actions.push({
          tool: "find_references",
          symbol,
          language: typeof (item as { language?: unknown }).language === "string"
            ? String((item as { language?: unknown }).language)
            : undefined,
          limit: Number.isFinite((item as { limit?: unknown }).limit)
            ? Number((item as { limit?: unknown }).limit)
            : undefined,
        });
        break;
      }
      case "dependency_map": {
        actions.push({
          tool: "dependency_map",
        });
        break;
      }
      case "memory_set": {
        const key = (item as { key?: unknown }).key;
        const value = (item as { value?: unknown }).value;
        if (typeof key !== "string" || key.trim().length === 0) {
          break;
        }
        if (typeof value !== "string") {
          break;
        }
        actions.push({
          tool: "memory_set",
          key,
          value,
        });
        break;
      }
      case "memory_get": {
        const key = (item as { key?: unknown }).key;
        if (typeof key !== "string" || key.trim().length === 0) {
          break;
        }
        actions.push({
          tool: "memory_get",
          key,
        });
        break;
      }
      default:
        break;
    }
  }

  return actions.slice(0, 6);
}

function normalizeMemoryUpdates(value: unknown): MemoryUpdates | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  const updates: MemoryUpdates = {};

  if (Array.isArray(obj.projectRules)) {
    updates.projectRules = obj.projectRules
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 30);
  }

  if (Array.isArray(obj.architectureNotes)) {
    updates.architectureNotes = obj.architectureNotes
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 30);
  }

  if (Array.isArray(obj.commonCommands)) {
    updates.commonCommands = obj.commonCommands
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 30);
  }

  if (obj.kv && typeof obj.kv === "object") {
    updates.kv = Object.fromEntries(
      Object.entries(obj.kv as Record<string, unknown>)
        .filter(([key, value]) => key.trim().length > 0 && typeof value === "string")
        .slice(0, 50)
        .map(([key, value]) => [key, String(value)]),
    );
  }

  const hasAny =
    (updates.projectRules?.length ?? 0) > 0
    || (updates.architectureNotes?.length ?? 0) > 0
    || (updates.commonCommands?.length ?? 0) > 0
    || (updates.kv && Object.keys(updates.kv).length > 0);
  return hasAny ? updates : undefined;
}

export function parseAgentModelResponse(rawText: string): AgentModelResponse {
  const jsonCandidate = extractJson(rawText);
  let parsed: unknown = {};

  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    return {
      status: "need_user",
      assistant_message: "I returned an invalid JSON response and need a retry.",
      plan: [],
      actions: [],
      verify: [],
      question: "Please ask me to retry. I will respond with strict JSON.",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      status: "need_user",
      assistant_message: "I returned an invalid response shape and need a retry.",
      plan: [],
      actions: [],
      verify: [],
      question: "Please ask me to retry with strict JSON only.",
    };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    status: normalizeStatus(obj.status),
    assistant_message: typeof obj.assistant_message === "string"
      ? obj.assistant_message
      : "",
    plan: normalizePlan(obj.plan),
    actions: normalizeActions(obj.actions),
    verify: normalizeVerify(obj.verify),
    question: typeof obj.question === "string" ? obj.question : undefined,
    memory_updates: normalizeMemoryUpdates(obj.memory_updates),
  };
}
