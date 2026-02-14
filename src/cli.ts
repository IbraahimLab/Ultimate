#!/usr/bin/env node
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadRuntimeConfig } from "./config.js";
import { CodingAgent } from "./agent/agent.js";
import type { CliArgs, RuntimeConfig } from "./types.js";

class ConsoleUI {
  private readonly rl: readline.Interface;

  public constructor(rl: readline.Interface) {
    this.rl = rl;
  }

  public info(message: string): void {
    output.write(`${message}\n`);
  }

  public warn(message: string): void {
    output.write(`WARN: ${message}\n`);
  }

  public error(message: string): void {
    output.write(`ERROR: ${message}\n`);
  }

  public async ask(question: string): Promise<string> {
    return this.rl.question(question);
  }

  public async confirm(question: string): Promise<boolean> {
    const answer = (await this.rl.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) {
      continue;
    }

    switch (token) {
      case "--goal": {
        const value = argv[i + 1];
        if (value) {
          args.goal = value;
          i += 1;
        }
        break;
      }
      case "--model": {
        const value = argv[i + 1];
        if (value) {
          args.model = value;
          i += 1;
        }
        break;
      }
      case "--base-url": {
        const value = argv[i + 1];
        if (value) {
          args.baseUrl = value;
          i += 1;
        }
        break;
      }
      case "--max-iterations": {
        const value = argv[i + 1];
        if (value) {
          const parsed = Number.parseInt(value, 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            args.maxIterations = parsed;
          }
          i += 1;
        }
        break;
      }
      case "--help":
      case "-h": {
        args.help = true;
        break;
      }
      default:
        break;
    }
  }

  return args;
}

function printHelp(): void {
  output.write(
    [
      "Vibe Coding Agent MVP",
      "",
      "Usage:",
      "  npm run dev",
      "  npm run dev -- --goal \"add tests for auth middleware\"",
      "",
      "Options:",
      "  --goal <text>            Run one task and exit",
      "  --model <name>           Override model (default from VIBE_MODEL)",
      "  --base-url <url>         Override API base URL",
      "  --max-iterations <num>   Max plan/act/verify loops",
      "  -h, --help               Show help",
      "",
      "Interactive commands:",
      "  /task <goal>   Run a task",
      "  /config        Show current config",
      "  /help          Show command help",
      "  /exit          Quit",
      "",
    ].join("\n"),
  );
}

async function runInteractive(
  agent: CodingAgent,
  ui: ConsoleUI,
  runtimeConfig: RuntimeConfig,
): Promise<void> {
  ui.info("Vibe Coding Agent ready. Type a coding task in plain English.");
  ui.info("Use /help for commands.");

  while (true) {
    const raw = (await ui.ask("\nYou> ")).trim();
    if (!raw) {
      continue;
    }

    if (raw === "/exit" || raw === "exit" || raw === "quit") {
      break;
    }

    if (raw === "/help") {
      printHelp();
      continue;
    }

    if (raw.startsWith("/task ")) {
      const goal = raw.slice("/task ".length).trim();
      if (!goal) {
        ui.warn("Missing task text after /task.");
        continue;
      }
      await agent.runTask(goal, ui);
      continue;
    }

    if (raw === "/config") {
      ui.info(
        [
          `Model: ${runtimeConfig.model}`,
          `Base URL: ${runtimeConfig.baseUrl}`,
          `Max iterations: ${runtimeConfig.maxIterations}`,
          `Workspace: ${runtimeConfig.workspaceRoot}`,
          `State dir: ${runtimeConfig.stateDir}`,
          `Auto verify: ${runtimeConfig.autoVerify ? "on" : "off"}`,
          `Max scan files: ${runtimeConfig.maxProjectScanFiles}`,
        ].join("\n"),
      );
      continue;
    }

    await agent.runTask(raw, ui);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const runtimeConfig = loadRuntimeConfig(process.cwd(), args);
  const rl = readline.createInterface({ input, output });
  const ui = new ConsoleUI(rl);
  const agent = new CodingAgent(runtimeConfig);

  if (!runtimeConfig.apiKey) {
    ui.warn("API key is not set. Use VIBE_API_KEY or GROQ_API_KEY in your shell or .env.");
  }

  try {
    if (args.goal) {
      await agent.runTask(args.goal, ui);
      return;
    }

    await runInteractive(agent, ui, runtimeConfig);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  output.write(`Fatal error: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
