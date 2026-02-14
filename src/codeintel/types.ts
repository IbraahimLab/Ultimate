export type SupportedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "unknown";

export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable";

export interface SourceFileSummary {
  path: string;
  language: SupportedLanguage;
  sizeBytes: number;
  lineCount: number;
}

export interface SymbolEntry {
  name: string;
  kind: SymbolKind;
  path: string;
  line: number;
  language: SupportedLanguage;
  exported: boolean;
}

export interface ImportEntry {
  path: string;
  line: number;
  language: SupportedLanguage;
  source: string;
  imported: string[];
}

export interface UseEntry {
  name: string;
  path: string;
  line: number;
  language: SupportedLanguage;
}

export interface DependencyMap {
  node: Record<string, string>;
  nodeDev: Record<string, string>;
  python: Record<string, string>;
  pythonDev: Record<string, string>;
}

export interface ProjectIndex {
  generatedAt: string;
  workspaceRoot: string;
  totalFilesScanned: number;
  languages: Record<string, number>;
  files: SourceFileSummary[];
  symbols: SymbolEntry[];
  imports: ImportEntry[];
  uses: UseEntry[];
  dependencies: DependencyMap;
}

export interface ParsedSourceFile {
  symbols: SymbolEntry[];
  imports: ImportEntry[];
  uses: UseEntry[];
}
