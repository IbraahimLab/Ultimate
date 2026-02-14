import type { ParsedSourceFile, SymbolEntry, UseEntry } from "../types.js";

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

export function parsePythonFile(filePath: string, content: string): ParsedSourceFile {
  const lines = content.split(/\r?\n/u);
  const symbols: SymbolEntry[] = [];
  const imports: ParsedSourceFile["imports"] = [];
  const uses: UseEntry[] = [];
  const declaredNames = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const functionMatch = trimmed.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u);
    if (functionMatch?.[1]) {
      const name = functionMatch[1];
      declaredNames.add(name);
      symbols.push({
        name,
        kind: "function",
        path: filePath,
        line: lineNumber,
        language: "python",
        exported: !name.startsWith("_"),
      });
    }

    const classMatch = trimmed.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|:)/u);
    if (classMatch?.[1]) {
      const name = classMatch[1];
      declaredNames.add(name);
      symbols.push({
        name,
        kind: "class",
        path: filePath,
        line: lineNumber,
        language: "python",
        exported: !name.startsWith("_"),
      });
    }

    const importMatch = trimmed.match(/^import\s+(.+)$/u);
    if (importMatch?.[1]) {
      const raw = importMatch[1];
      const imported = raw
        .split(",")
        .map((part) => part.trim())
        .map((part) => part.split(/\s+as\s+/u)[0] ?? part)
        .filter((part) => part.length > 0);
      imports.push({
        path: filePath,
        line: lineNumber,
        language: "python",
        source: imported.join(", "),
        imported,
      });
      for (const item of imported) {
        const alias = item.split(".")[0] ?? item;
        declaredNames.add(alias);
      }
    }

    const fromImportMatch = trimmed.match(/^from\s+([A-Za-z0-9_\.]+)\s+import\s+(.+)$/u);
    if (fromImportMatch?.[1] && fromImportMatch?.[2]) {
      const source = fromImportMatch[1];
      const imported = fromImportMatch[2]
        .split(",")
        .map((part) => part.trim())
        .map((part) => part.split(/\s+as\s+/u)[0] ?? part)
        .filter((part) => part.length > 0);
      imports.push({
        path: filePath,
        line: lineNumber,
        language: "python",
        source,
        imported,
      });
      for (const item of imported) {
        declaredNames.add(item);
      }
    }

    for (const token of trimmed.matchAll(/[A-Za-z_][A-Za-z0-9_]*/gu)) {
      const name = token[0];
      if (!name || PYTHON_KEYWORDS.has(name) || declaredNames.has(name)) {
        continue;
      }
      uses.push({
        name,
        path: filePath,
        line: lineNumber,
        language: "python",
      });
    }
  }

  return { symbols, imports, uses };
}
