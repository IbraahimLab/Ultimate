import path from "node:path";
import type { SupportedLanguage } from "./types.js";

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const JS_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
const PY_EXTENSIONS = new Set([".py"]);

export function detectLanguage(filePath: string): SupportedLanguage {
  const ext = path.extname(filePath).toLowerCase();
  if (TS_EXTENSIONS.has(ext)) {
    return "typescript";
  }
  if (JS_EXTENSIONS.has(ext)) {
    return "javascript";
  }
  if (PY_EXTENSIONS.has(ext)) {
    return "python";
  }
  return "unknown";
}

export function isLanguageIndexed(language: SupportedLanguage): boolean {
  return language === "typescript" || language === "javascript" || language === "python";
}
