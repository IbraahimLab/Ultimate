import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export interface CommandResult {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
}

function appendCapped(
  current: string,
  chunk: string,
  maxChars: number,
): string {
  if (current.length >= maxChars) {
    return current;
  }
  const remaining = maxChars - current.length;
  return current + chunk.slice(0, remaining);
}

export async function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  maxOutputChars: number,
): Promise<CommandResult> {
  const startedAt = performance.now();
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "cmd.exe" : "/bin/sh";
  const args = isWindows ? ["/d", "/s", "/c", command] : ["-lc", command];

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(shell, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendCapped(stdout, chunk.toString("utf8"), maxOutputChars);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendCapped(stderr, chunk.toString("utf8"), maxOutputChars);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        exitCode,
        timedOut,
        durationMs: Math.round(performance.now() - startedAt),
        stdout,
        stderr,
      });
    });
  });
}
