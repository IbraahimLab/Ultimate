export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type AgentStatus = "continue" | "done" | "need_user";

interface BaseAction {
  tool: string;
  reason?: string;
}

export interface ListFilesAction extends BaseAction {
  tool: "list_files";
  path?: string;
  recursive?: boolean;
  depth?: number;
  maxEntries?: number;
}

export interface ReadFileAction extends BaseAction {
  tool: "read_file";
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface GrepAction extends BaseAction {
  tool: "grep";
  pattern: string;
  glob?: string;
  maxMatches?: number;
}

export interface RunCommandAction extends BaseAction {
  tool: "run_command";
  command: string;
}

export interface WriteFileAction extends BaseAction {
  tool: "write_file";
  path: string;
  content: string;
}

export interface ScanProjectAction extends BaseAction {
  tool: "scan_project";
  refresh?: boolean;
  maxFiles?: number;
}

export interface SymbolLookupAction extends BaseAction {
  tool: "symbol_lookup";
  query: string;
  language?: string;
  limit?: number;
}

export interface FindReferencesAction extends BaseAction {
  tool: "find_references";
  symbol: string;
  language?: string;
  limit?: number;
}

export interface DependencyMapAction extends BaseAction {
  tool: "dependency_map";
}

export interface MemorySetAction extends BaseAction {
  tool: "memory_set";
  key: string;
  value: string;
}

export interface MemoryGetAction extends BaseAction {
  tool: "memory_get";
  key: string;
}

export type AgentAction =
  | ListFilesAction
  | ReadFileAction
  | GrepAction
  | RunCommandAction
  | WriteFileAction
  | ScanProjectAction
  | SymbolLookupAction
  | FindReferencesAction
  | DependencyMapAction
  | MemorySetAction
  | MemoryGetAction;

export interface VerifyCommand {
  command: string;
}

export interface MemoryUpdates {
  projectRules?: string[];
  architectureNotes?: string[];
  commonCommands?: string[];
  kv?: Record<string, string>;
}

export interface AgentModelResponse {
  status: AgentStatus;
  assistant_message: string;
  plan: string[];
  actions: AgentAction[];
  verify: VerifyCommand[];
  question?: string;
  memory_updates?: MemoryUpdates;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  summary: string;
  data?: unknown;
}

export interface RuntimeConfig {
  workspaceRoot: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxIterations: number;
  toolTimeoutMs: number;
  maxToolOutputChars: number;
  maxProjectScanFiles: number;
  autoRepairMaxRounds: number;
  autoVerify: boolean;
  stateDir: string;
}

export interface CliArgs {
  goal?: string;
  model?: string;
  baseUrl?: string;
  maxIterations?: number;
  help?: boolean;
}
