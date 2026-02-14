import path from "node:path";

function normalizeForComparison(value: string): string {
  const normalized = path.resolve(value);
  if (process.platform === "win32") {
    return normalized.toLowerCase();
  }
  return normalized;
}

export function resolveWorkspacePath(
  workspaceRoot: string,
  userPath: string,
): string {
  const rootResolved = path.resolve(workspaceRoot);
  const candidate = path.resolve(rootResolved, userPath);

  const rootCmp = normalizeForComparison(rootResolved);
  const candidateCmp = normalizeForComparison(candidate);
  const rootPrefix = rootCmp.endsWith(path.sep) ? rootCmp : `${rootCmp}${path.sep}`;

  if (candidateCmp !== rootCmp && !candidateCmp.startsWith(rootPrefix)) {
    throw new Error(`Path "${userPath}" is outside workspace root.`);
  }

  return candidate;
}

export function toWorkspaceRelativePath(
  workspaceRoot: string,
  absolutePath: string,
): string {
  const relativePath = path.relative(path.resolve(workspaceRoot), path.resolve(absolutePath));
  return relativePath.split(path.sep).join("/");
}
