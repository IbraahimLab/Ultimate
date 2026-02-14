import fs from "node:fs/promises";
import path from "node:path";
import type {
  AgentAction,
  ChatMessage,
  MemoryUpdates,
  RuntimeConfig,
  ToolResult,
} from "../types.js";
import { OpenAICompatibleClient } from "../llm/openaiCompatibleClient.js";
import { buildSystemPrompt } from "../llm/systemPrompt.js";
import { parseAgentModelResponse } from "./responseParser.js";
import {
  fileExists,
  listFiles,
  readFileIfExists,
  readFileSegment,
  writeFile,
} from "../tools/fileTools.js";
import { grepWorkspace } from "../tools/searchTools.js";
import { runShellCommand } from "../tools/terminalTools.js";
import { clipText, withLineNumbers } from "../utils/strings.js";
import { computeDiffStats, createUnifiedDiff } from "../utils/diff.js";
import { ProjectScanner } from "../codeintel/projectScanner.js";
import { MemoryStore } from "../memory/memoryStore.js";
import { discoverAutoVerifyCommands } from "../reliability/autoVerify.js";
import { parseStackTrace } from "../reliability/stackTrace.js";
import { ChangeTracker } from "../reliability/changeTracker.js";
import { detectSecrets } from "../security/secrets.js";
import {
  isCommandAllowed,
  isWritePathAllowed,
  loadPolicy,
  type AgentPolicy,
} from "../security/policy.js";
import { AuditLogger } from "../audit/auditLogger.js";

export interface AgentUI {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  ask(question: string): Promise<string>;
  confirm(question: string): Promise<boolean>;
}

function formatToolResultForModel(result: ToolResult, maxChars: number): string {
  const payload = JSON.stringify(result, null, 2);
  return clipText(payload, maxChars);
}

export class CodingAgent {
  private readonly client: OpenAICompatibleClient;
  private readonly config: RuntimeConfig;
  private readonly scanner: ProjectScanner;
  private readonly memoryStore: MemoryStore;

  public constructor(config: RuntimeConfig) {
    this.config = config;
    this.client = new OpenAICompatibleClient(config);
    this.scanner = new ProjectScanner(
      config.workspaceRoot,
      config.stateDir,
      config.maxProjectScanFiles,
    );
    this.memoryStore = new MemoryStore(config.stateDir);
  }

  public async runTask(goal: string, ui: AgentUI): Promise<void> {
    if (!this.config.apiKey) {
      ui.error("Missing API key. Set VIBE_API_KEY or GROQ_API_KEY in your environment/.env.");
      return;
    }

    await this.memoryStore.ensureLoaded();
    const memorySnapshot = await this.memoryStore.getSnapshot();
    const policy = await loadPolicy(this.config.stateDir);

    const sessionId = new Date().toISOString().replace(/[:.]/gu, "-");
    const audit = new AuditLogger(this.config.stateDir, sessionId);
    await this.safeAuditLog(audit, "task_start", {
      goal,
      model: this.config.model,
      workspaceRoot: this.config.workspaceRoot,
      sessionId,
    });

    const changeTracker = new ChangeTracker();
    let hadVerifyFailures = false;
    let completed = false;
    let maxIterationReached = false;
    let consecutiveVerifyFailures = 0;
    let abortedByError = false;
    let stoppedEarly = false;

    const workspaceSummary = await this.getWorkspaceSummary();
    const scannerSummary = await this.scanner.getSummary().catch(() => ({
      error: "Failed to build project index.",
    }));
    const conversation: ChatMessage[] = [
      {
        role: "system",
        content: buildSystemPrompt(this.config),
      },
      {
        role: "user",
        content: [
          `Workspace root: ${this.config.workspaceRoot}`,
          "Workspace summary:",
          workspaceSummary,
          "",
          "Project scanner summary:",
          JSON.stringify(scannerSummary, null, 2),
          "",
          "Persistent project memory:",
          JSON.stringify(memorySnapshot, null, 2),
          "",
          "Safety policy:",
          JSON.stringify(policy, null, 2),
        ].join("\n"),
      },
      {
        role: "user",
        content: `User task:\n${goal}`,
      },
    ];

    for (let loop = 1; loop <= this.config.maxIterations; loop += 1) {
      ui.info(`\n[Loop ${loop}/${this.config.maxIterations}] plan -> act -> verify`);
      await this.safeAuditLog(audit, "loop_start", { loop });

      let rawResponse = "";
      try {
        rawResponse = await this.client.complete(
          conversation,
          this.config.toolTimeoutMs,
        );
      } catch (error) {
        ui.error(`Model call failed: ${(error as Error).message}`);
        abortedByError = true;
        break;
      }

      const modelResponse = parseAgentModelResponse(rawResponse);
      if (modelResponse.assistant_message.trim().length > 0) {
        ui.info(`Agent: ${modelResponse.assistant_message.trim()}`);
      }
      if (modelResponse.plan.length > 0) {
        ui.info(
          `Plan:\n${modelResponse.plan.map((step, i) => `${i + 1}. ${step}`).join("\n")}`,
        );
      }
      await this.safeAuditLog(audit, "model_response", {
        loop,
        status: modelResponse.status,
        plan: modelResponse.plan,
        actionCount: modelResponse.actions.length,
        verifyCount: modelResponse.verify.length,
      });

      const memoryChanges = await this.applyMemoryUpdates(
        modelResponse.memory_updates,
        audit,
      );
      if (memoryChanges.length > 0) {
        ui.info(`Memory updated: ${memoryChanges.join(", ")}`);
      }

      const toolResults: ToolResult[] = [];
      let loopHadWrites = false;

      for (const action of modelResponse.actions) {
        const result = await this.executeAction(action, ui, {
          audit,
          changeTracker,
          policy,
        });
        toolResults.push(result);
        ui.info(`[${action.tool}] ${result.summary}`);
        await this.safeAuditLog(audit, "action_result", {
          loop,
          tool: action.tool,
          ok: result.ok,
          summary: result.summary,
        });
        if (action.tool === "write_file" && result.ok) {
          loopHadWrites = true;
        }
      }

      const verifyCommands = modelResponse.verify.map((verify) => verify.command);
      if (this.config.autoVerify && loopHadWrites) {
        const latestMemory = await this.memoryStore.getSnapshot();
        const autoVerifyCommands = await discoverAutoVerifyCommands(
          this.config.workspaceRoot,
          latestMemory,
          8,
        );
        for (const command of autoVerifyCommands) {
          if (!verifyCommands.includes(command)) {
            verifyCommands.push(command);
          }
        }
        if (autoVerifyCommands.length > 0) {
          ui.info(`Auto verify added: ${autoVerifyCommands.join(" | ")}`);
        }
      }

      let loopVerifyFailed = false;
      for (const command of verifyCommands) {
        const result = await this.runVerifyCommand(command, policy);
        toolResults.push(result);
        ui.info(`[verify] ${result.summary}`);
        await this.safeAuditLog(audit, "verify_result", {
          loop,
          command,
          ok: result.ok,
          summary: result.summary,
        });
        if (!result.ok) {
          hadVerifyFailures = true;
          loopVerifyFailed = true;
        }
      }

      if (verifyCommands.length > 0) {
        if (loopVerifyFailed) {
          consecutiveVerifyFailures += 1;
        } else {
          consecutiveVerifyFailures = 0;
        }
      }

      if (
        consecutiveVerifyFailures >= this.config.autoRepairMaxRounds
        && changeTracker.hasChanges()
      ) {
        ui.warn(
          `Auto-repair retries reached limit (${this.config.autoRepairMaxRounds}) with failing verification.`,
        );
        const keepTrying = await ui.confirm("Continue trying more repair loops anyway? [y/N] ");
        await this.safeAuditLog(audit, "auto_repair_limit_reached", {
          consecutiveVerifyFailures,
          keepTrying,
        });
        if (!keepTrying) {
          stoppedEarly = true;
          break;
        }
        consecutiveVerifyFailures = 0;
      }

      conversation.push({
        role: "assistant",
        content: rawResponse,
      });
      conversation.push({
        role: "user",
        content: [
          "Tool results:",
          ...toolResults.map((result) =>
            formatToolResultForModel(result, this.config.maxToolOutputChars)
          ),
        ].join("\n\n"),
      });

      if (modelResponse.status === "need_user") {
        const question = modelResponse.question ?? "Please clarify what I should do next.";
        let answer = "";
        try {
          answer = await ui.ask(`Agent question: ${question}\n> `);
        } catch {
          ui.warn("Agent needs clarification, but input is not available in this mode.");
          abortedByError = true;
          break;
        }
        conversation.push({
          role: "user",
          content: `User clarification:\n${answer}`,
        });
        continue;
      }

      if (modelResponse.status === "done") {
        if (loopVerifyFailed) {
          ui.warn("Agent marked done, but verification failed. Continuing loop for auto-repair.");
          conversation.push({
            role: "user",
            content: "Verification failed. Continue and fix errors before marking done.",
          });
          continue;
        }
        ui.info("Task marked complete by the agent.");
        completed = true;
        break;
      }
    }

    if (!completed && !abortedByError && !stoppedEarly) {
      maxIterationReached = true;
      ui.warn(
        `Reached max iterations (${this.config.maxIterations}) before finishing. Ask the agent to continue.`,
      );
    } else if (stoppedEarly) {
      ui.warn("Stopped early because auto-repair retry limit was reached.");
    }

    if (changeTracker.hasChanges()) {
      this.printChangeSummary(ui, changeTracker);
      await this.safeAuditLog(audit, "change_summary", {
        changedFiles: changeTracker.getChangedFiles().map((change) => change.path),
      });
    }

    if (!completed && hadVerifyFailures && changeTracker.hasChanges()) {
      const shouldRollback = await ui.confirm(
        "Verification failed and unresolved changes exist. Roll back this session's edits? [y/N] ",
      );
      if (shouldRollback) {
        const restoredFiles = await changeTracker.rollback(this.config.workspaceRoot);
        ui.info(`Rollback restored ${restoredFiles.length} file(s): ${restoredFiles.join(", ")}`);
        await this.safeAuditLog(audit, "rollback", {
          restoredFiles,
        });
      }
    }

    await this.safeAuditLog(audit, "task_end", {
      completed,
      maxIterationReached,
      abortedByError,
      stoppedEarly,
      hadVerifyFailures,
      hasChanges: changeTracker.hasChanges(),
      auditPath: audit.getAuditPath(),
    });
    ui.info(`Audit log: ${audit.getAuditPath()}`);
  }

  private async getWorkspaceSummary(): Promise<string> {
    const topEntries = await fs.readdir(this.config.workspaceRoot, { withFileTypes: true });
    const visibleTop = topEntries
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 30)
      .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`);

    let sampleFiles: string[] = [];
    try {
      sampleFiles = await listFiles({
        workspaceRoot: this.config.workspaceRoot,
        path: ".",
        recursive: true,
        depth: 2,
        maxEntries: 80,
      });
    } catch {
      sampleFiles = [];
    }

    const packageJsonPath = path.join(this.config.workspaceRoot, "package.json");
    let packageSnippet = "";
    try {
      const packageRaw = await fs.readFile(packageJsonPath, "utf8");
      packageSnippet = clipText(packageRaw, 600);
    } catch {
      packageSnippet = "No package.json detected.";
    }

    return [
      "Top-level entries:",
      ...(visibleTop.length > 0 ? visibleTop : ["(empty)"]),
      "",
      "Sample files:",
      ...(sampleFiles.slice(0, 40).length > 0 ? sampleFiles.slice(0, 40) : ["(none)"]),
      "",
      "package.json snippet:",
      packageSnippet,
    ].join("\n");
  }

  private async executeAction(
    action: AgentAction,
    ui: AgentUI,
    context: {
      policy: AgentPolicy;
      changeTracker: ChangeTracker;
      audit: AuditLogger;
    },
  ): Promise<ToolResult> {
    try {
      switch (action.tool) {
        case "list_files": {
          const files = await listFiles({
            workspaceRoot: this.config.workspaceRoot,
            path: action.path ?? ".",
            recursive: action.recursive ?? true,
            depth: action.depth ?? 4,
            maxEntries: action.maxEntries ?? 200,
          });
          return {
            tool: "list_files",
            ok: true,
            summary: `Listed ${files.length} entries.`,
            data: {
              entries: files,
            },
          };
        }

        case "read_file": {
          const file = await readFileSegment({
            workspaceRoot: this.config.workspaceRoot,
            path: action.path,
            startLine: action.startLine,
            endLine: action.endLine,
            maxChars: this.config.maxToolOutputChars,
          });
          const withNumbers = withLineNumbers(file.content, file.startLine);
          return {
            tool: "read_file",
            ok: true,
            summary: `Read ${file.path}:${file.startLine}-${file.endLine}`,
            data: {
              path: file.path,
              content: withNumbers,
            },
          };
        }

        case "grep": {
          const grep = await grepWorkspace(
            this.config.workspaceRoot,
            action.pattern,
            action.glob,
            action.maxMatches ?? 120,
            this.config.toolTimeoutMs,
          );

          return {
            tool: "grep",
            ok: true,
            summary: `Found ${grep.matches.length} matches using ${grep.backend}.`,
            data: {
              backend: grep.backend,
              matches: grep.matches,
              totalScannedFiles: grep.totalScannedFiles,
            },
          };
        }

        case "run_command": {
          const commandCheck = isCommandAllowed(context.policy, action.command);
          if (!commandCheck.allowed) {
            return {
              tool: "run_command",
              ok: false,
              summary: `Blocked by policy: ${commandCheck.reason}`,
            };
          }

          const run = await runShellCommand(
            action.command,
            this.config.workspaceRoot,
            this.config.toolTimeoutMs,
            this.config.maxToolOutputChars,
          );
          const success = run.exitCode === 0 && !run.timedOut;
          const parsedFailure = !success
            ? parseStackTrace(`${run.stderr}\n${run.stdout}`)
            : undefined;
          return {
            tool: "run_command",
            ok: success,
            summary: success
              ? `Command passed: ${action.command}`
              : `Command failed (exit=${String(run.exitCode)}, timeout=${String(run.timedOut)}): ${action.command}`,
            data: {
              ...run,
              parsedFailure,
            },
          };
        }

        case "write_file": {
          const writePathCheck = isWritePathAllowed(context.policy, action.path);
          if (!writePathCheck.allowed) {
            return {
              tool: "write_file",
              ok: false,
              summary: `Blocked by policy: ${writePathCheck.reason}`,
              data: {
                path: action.path,
                changed: false,
              },
            };
          }

          const secretFindings = detectSecrets(action.content);
          if (secretFindings.length > 0 && !context.policy.allowPotentialSecrets) {
            return {
              tool: "write_file",
              ok: false,
              summary: `Potential secrets detected. Write blocked by policy.`,
              data: {
                path: action.path,
                findings: secretFindings,
                changed: false,
              },
            };
          }

          const existed = await fileExists(this.config.workspaceRoot, action.path);
          const before = await readFileIfExists(this.config.workspaceRoot, action.path);
          const after = action.content;

          if (before === after) {
            return {
              tool: "write_file",
              ok: true,
              summary: `Skipped ${action.path}; no content changes.`,
              data: {
                path: action.path,
                changed: false,
              },
            };
          }

          const diff = createUnifiedDiff(action.path, before, after);
          const stats = computeDiffStats(diff);
          ui.info(`Proposed diff for ${action.path}:\n${clipText(diff, 30_000)}`);
          await this.safeAuditLog(context.audit, "write_proposed", {
            path: action.path,
            stats,
          });

          const approved = await ui.confirm(`Apply this change to ${action.path}? [y/N] `);
          if (!approved) {
            await this.safeAuditLog(context.audit, "write_rejected", { path: action.path });
            return {
              tool: "write_file",
              ok: false,
              summary: `User rejected write to ${action.path}.`,
              data: {
                path: action.path,
                changed: false,
              },
            };
          }

          context.changeTracker.recordBefore(action.path, existed, before);
          await writeFile(this.config.workspaceRoot, action.path, after);
          context.changeTracker.recordAfter(action.path, after);
          await this.safeAuditLog(context.audit, "write_applied", {
            path: action.path,
            stats,
          });

          return {
            tool: "write_file",
            ok: true,
            summary: `Wrote ${action.path} (+${stats.added}/-${stats.removed}).`,
            data: {
              path: action.path,
              changed: true,
              stats,
            },
          };
        }

        case "scan_project": {
          const index = await this.scanner.scan({
            refresh: action.refresh ?? false,
            maxFiles: action.maxFiles,
          });
          return {
            tool: "scan_project",
            ok: true,
            summary: `Indexed ${index.totalFilesScanned} files and ${index.symbols.length} symbols.`,
            data: {
              generatedAt: index.generatedAt,
              totalFilesScanned: index.totalFilesScanned,
              languages: index.languages,
              symbolCount: index.symbols.length,
              importCount: index.imports.length,
              usageCount: index.uses.length,
            },
          };
        }

        case "symbol_lookup": {
          const symbols = await this.scanner.lookupSymbols(action.query, {
            language: action.language,
            limit: action.limit,
          });
          return {
            tool: "symbol_lookup",
            ok: true,
            summary: `Found ${symbols.length} symbols for "${action.query}".`,
            data: {
              query: action.query,
              symbols,
            },
          };
        }

        case "find_references": {
          const uses = await this.scanner.findReferences(action.symbol, {
            language: action.language,
            limit: action.limit,
          });
          return {
            tool: "find_references",
            ok: true,
            summary: `Found ${uses.length} references for "${action.symbol}".`,
            data: {
              symbol: action.symbol,
              references: uses,
            },
          };
        }

        case "dependency_map": {
          const dependencies = await this.scanner.getDependencyMap();
          return {
            tool: "dependency_map",
            ok: true,
            summary: "Collected dependency map for Node and Python.",
            data: dependencies,
          };
        }

        case "memory_set": {
          await this.memoryStore.set(action.key, action.value);
          await this.safeAuditLog(context.audit, "memory_set", {
            key: action.key,
          });
          return {
            tool: "memory_set",
            ok: true,
            summary: `Saved memory key "${action.key}".`,
          };
        }

        case "memory_get": {
          const value = await this.memoryStore.get(action.key);
          return {
            tool: "memory_get",
            ok: true,
            summary: value === undefined
              ? `No memory value for key "${action.key}".`
              : `Loaded memory key "${action.key}".`,
            data: {
              key: action.key,
              value,
            },
          };
        }

        default:
          // This path should not happen with current action unions.
          const unexpectedTool = (action as { tool?: string }).tool ?? "unknown";
          return {
            tool: unexpectedTool,
            ok: false,
            summary: `Unsupported tool: ${unexpectedTool}`,
          };
      }
    } catch (error) {
      return {
        tool: action.tool,
        ok: false,
        summary: `Tool failed: ${(error as Error).message}`,
      };
    }
  }

  private async runVerifyCommand(
    command: string,
    policy: AgentPolicy,
  ): Promise<ToolResult> {
    const commandCheck = isCommandAllowed(policy, command);
    if (!commandCheck.allowed) {
      return {
        tool: "verify",
        ok: false,
        summary: `Blocked by policy: ${commandCheck.reason}`,
      };
    }

    try {
      const run = await runShellCommand(
        command,
        this.config.workspaceRoot,
        this.config.toolTimeoutMs,
        this.config.maxToolOutputChars,
      );
      const ok = run.exitCode === 0 && !run.timedOut;
      const parsedFailure = !ok
        ? parseStackTrace(`${run.stderr}\n${run.stdout}`)
        : undefined;
      return {
        tool: "verify",
        ok,
        summary: ok
          ? `Verify passed: ${command}`
          : `Verify failed (exit=${String(run.exitCode)}, timeout=${String(run.timedOut)}): ${command}`,
        data: {
          ...run,
          parsedFailure,
        },
      };
    } catch (error) {
      return {
        tool: "verify",
        ok: false,
        summary: `Verify command error for "${command}": ${(error as Error).message}`,
      };
    }
  }

  private async applyMemoryUpdates(
    updates: MemoryUpdates | undefined,
    audit: AuditLogger,
  ): Promise<string[]> {
    const changed = await this.memoryStore.applyUpdates(updates);
    if (changed.length > 0) {
      await this.safeAuditLog(audit, "memory_updates", {
        changed,
      });
    }
    return changed;
  }

  private printChangeSummary(ui: AgentUI, tracker: ChangeTracker): void {
    const changedFiles = tracker.getChangedFiles();
    if (changedFiles.length === 0) {
      return;
    }

    const summaryLines = changedFiles.map((change) => {
      const diff = createUnifiedDiff(change.path, change.before, change.after);
      const stats = computeDiffStats(diff);
      return `- ${change.path}: +${stats.added} / -${stats.removed}`;
    });

    ui.info(
      [
        "Change summary:",
        ...summaryLines,
      ].join("\n"),
    );
  }

  private async safeAuditLog(
    audit: AuditLogger,
    type: string,
    data: unknown,
  ): Promise<void> {
    try {
      await audit.log(type, data);
    } catch {
      // Audit should never break task execution.
    }
  }
}
