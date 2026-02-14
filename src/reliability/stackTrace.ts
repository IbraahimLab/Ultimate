export interface ParsedStackFrame {
  path: string;
  line: number;
  column?: number;
  functionName?: string;
  language: "javascript" | "typescript" | "python" | "unknown";
}

export interface ParsedFailureReport {
  summary: string;
  frames: ParsedStackFrame[];
  exceptionLine?: string;
}

function detectLanguageFromPath(filePath: string): ParsedStackFrame["language"] {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".mts") || lower.endsWith(".cts")) {
    return "typescript";
  }
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "javascript";
  }
  if (lower.endsWith(".py")) {
    return "python";
  }
  return "unknown";
}

export function parseStackTrace(outputText: string): ParsedFailureReport {
  const frames: ParsedStackFrame[] = [];
  const lines = outputText.split(/\r?\n/u);
  let exceptionLine: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const nodeMatch = trimmed.match(
      /(?:at\s+([A-Za-z0-9_$<>\.\[\]]+)\s+\()?([A-Za-z0-9_./\\:-]+\.(?:ts|tsx|js|jsx|mjs|cjs)):(\d+):(\d+)\)?/u,
    );
    if (nodeMatch?.[2] && nodeMatch?.[3]) {
      const filePath = nodeMatch[2];
      frames.push({
        path: filePath,
        line: Number.parseInt(nodeMatch[3], 10),
        column: Number.parseInt(nodeMatch[4] ?? "0", 10) || undefined,
        functionName: nodeMatch[1],
        language: detectLanguageFromPath(filePath),
      });
      continue;
    }

    const pyMatch = trimmed.match(/^File\s+"(.+?)",\s+line\s+(\d+),\s+in\s+(.+)$/u);
    if (pyMatch?.[1] && pyMatch?.[2]) {
      const filePath = pyMatch[1];
      frames.push({
        path: filePath,
        line: Number.parseInt(pyMatch[2], 10),
        functionName: pyMatch[3]?.trim(),
        language: detectLanguageFromPath(filePath),
      });
      continue;
    }

    if (!exceptionLine && (/^Error:/u.test(trimmed) || /^Traceback/u.test(trimmed) || /Exception/u.test(trimmed))) {
      exceptionLine = trimmed;
    }
  }

  const summary = exceptionLine
    ?? (frames.length > 0
      ? `Failure at ${frames[0]?.path}:${frames[0]?.line}`
      : "Command failed with no stack trace.");

  return {
    summary,
    frames: frames.slice(0, 20),
    exceptionLine,
  };
}
