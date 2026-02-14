import { createPatch } from "diff";

export interface DiffStats {
  added: number;
  removed: number;
}

export function createUnifiedDiff(
  filePath: string,
  before: string,
  after: string,
): string {
  return createPatch(filePath, before, after, "before", "after", {
    context: 3,
  });
}

export function computeDiffStats(unifiedDiff: string): DiffStats {
  const lines = unifiedDiff.split("\n");
  let added = 0;
  let removed = 0;

  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) {
      continue;
    }
    if (line.startsWith("+")) {
      added += 1;
    } else if (line.startsWith("-")) {
      removed += 1;
    }
  }

  return { added, removed };
}
