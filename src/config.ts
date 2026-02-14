import path from "node:path";
import type { CliArgs, RuntimeConfig } from "./types.js";

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

export function loadRuntimeConfig(
  workspaceRoot: string,
  cliArgs: CliArgs,
): RuntimeConfig {
  const baseUrlFromEnv =
    process.env.VIBE_BASE_URL ??
    process.env.GROQ_BASE_URL ??
    "https://api.groq.com/openai/v1";
  const modelFromEnv =
    process.env.VIBE_MODEL ??
    process.env.GROQ_MODEL ??
    "moonshotai/kimi-k2-instruct-0905";

  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const stateDir = path.resolve(
    resolvedWorkspaceRoot,
    process.env.VIBE_STATE_DIR ?? ".vibe-agent",
  );

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    apiKey:
      process.env.VIBE_API_KEY ??
      process.env.GROQ_API_KEY ??
      process.env.OPENAI_API_KEY ??
      "",
    model: cliArgs.model ?? modelFromEnv,
    baseUrl: normalizeBaseUrl(cliArgs.baseUrl ?? baseUrlFromEnv),
    maxIterations: cliArgs.maxIterations ?? parsePositiveInt(process.env.VIBE_MAX_ITERATIONS, 6),
    toolTimeoutMs: parsePositiveInt(process.env.VIBE_TOOL_TIMEOUT_MS, 120_000),
    maxToolOutputChars: parsePositiveInt(process.env.VIBE_MAX_TOOL_OUTPUT_CHARS, 18_000),
    maxProjectScanFiles: parsePositiveInt(process.env.VIBE_MAX_SCAN_FILES, 6_000),
    autoRepairMaxRounds: parsePositiveInt(process.env.VIBE_AUTO_REPAIR_ROUNDS, 3),
    autoVerify: parseBoolean(process.env.VIBE_AUTO_VERIFY, true),
    stateDir,
  };
}
