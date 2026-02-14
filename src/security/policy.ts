import fs from "node:fs/promises";
import path from "node:path";

export interface AgentPolicy {
  allowRunCommand: boolean;
  allowWrite: boolean;
  allowedCommandPrefixes: string[];
  blockedCommandPatterns: string[];
  blockedWriteGlobs: string[];
  allowPotentialSecrets: boolean;
}

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
}

export const DEFAULT_POLICY: AgentPolicy = {
  allowRunCommand: true,
  allowWrite: true,
  allowedCommandPrefixes: [],
  blockedCommandPatterns: [
    "rm\\s+-rf\\s+/",
    "del\\s+/s\\s+/q\\s+c:\\\\",
    "shutdown\\b",
    "reboot\\b",
    "mkfs\\b",
    "format\\s+[a-z]:",
    "curl\\s+.+\\|\\s*sh\\b",
    "wget\\s+.+\\|\\s*sh\\b",
    "powershell\\s+-enc\\b",
  ],
  blockedWriteGlobs: [
    ".env",
    ".env.*",
    "**/.env",
    "**/.env.*",
    "**/*.pem",
    "**/*.key",
    "**/id_rsa",
    ".git/**",
  ],
  allowPotentialSecrets: false,
};

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
    .replace(/\*\*/gu, "%%DOUBLE_STAR%%")
    .replace(/\*/gu, "[^/]*")
    .replace(/%%DOUBLE_STAR%%/gu, ".*");
  return new RegExp(`^${escaped}$`, "u");
}

function normalizePathForPolicy(inputPath: string): string {
  return inputPath.replace(/\\/gu, "/");
}

export async function loadPolicy(stateDir: string): Promise<AgentPolicy> {
  const policyPath = path.resolve(stateDir, "policy.json");
  try {
    const raw = await fs.readFile(policyPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentPolicy>;
    const merged: AgentPolicy = {
      ...DEFAULT_POLICY,
      ...parsed,
      allowedCommandPrefixes: Array.isArray(parsed.allowedCommandPrefixes)
        ? parsed.allowedCommandPrefixes.map((value) => String(value)).filter(Boolean)
        : DEFAULT_POLICY.allowedCommandPrefixes,
      blockedCommandPatterns: Array.isArray(parsed.blockedCommandPatterns)
        ? parsed.blockedCommandPatterns.map((value) => String(value)).filter(Boolean)
        : DEFAULT_POLICY.blockedCommandPatterns,
      blockedWriteGlobs: Array.isArray(parsed.blockedWriteGlobs)
        ? parsed.blockedWriteGlobs.map((value) => String(value)).filter(Boolean)
        : DEFAULT_POLICY.blockedWriteGlobs,
    };
    return merged;
  } catch {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(policyPath, JSON.stringify(DEFAULT_POLICY, null, 2), "utf8");
    return { ...DEFAULT_POLICY };
  }
}

export function isCommandAllowed(
  policy: AgentPolicy,
  command: string,
): PolicyCheckResult {
  if (!policy.allowRunCommand) {
    return {
      allowed: false,
      reason: "Policy blocks run_command actions.",
    };
  }

  const normalized = command.trim();
  if (!normalized) {
    return {
      allowed: false,
      reason: "Empty command is not allowed.",
    };
  }

  for (const pattern of policy.blockedCommandPatterns) {
    try {
      const regex = new RegExp(pattern, "iu");
      if (regex.test(normalized)) {
        return {
          allowed: false,
          reason: `Command blocked by policy pattern: ${pattern}`,
        };
      }
    } catch {
      if (normalized.toLowerCase().includes(pattern.toLowerCase())) {
        return {
          allowed: false,
          reason: `Command blocked by policy text match: ${pattern}`,
        };
      }
    }
  }

  if (policy.allowedCommandPrefixes.length > 0) {
    const allowed = policy.allowedCommandPrefixes.some((prefix) =>
      normalized.startsWith(prefix)
    );
    if (!allowed) {
      return {
        allowed: false,
        reason: `Command must start with one of: ${policy.allowedCommandPrefixes.join(", ")}`,
      };
    }
  }

  return { allowed: true };
}

export function isWritePathAllowed(
  policy: AgentPolicy,
  relativePath: string,
): PolicyCheckResult {
  if (!policy.allowWrite) {
    return {
      allowed: false,
      reason: "Policy blocks write_file actions.",
    };
  }

  const normalizedPath = normalizePathForPolicy(relativePath);
  for (const glob of policy.blockedWriteGlobs) {
    const matcher = globToRegExp(glob);
    if (matcher.test(normalizedPath)) {
      return {
        allowed: false,
        reason: `Write path blocked by policy glob: ${glob}`,
      };
    }
  }

  return { allowed: true };
}
