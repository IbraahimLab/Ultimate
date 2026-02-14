from __future__ import annotations

from dataclasses import dataclass
import os
import subprocess
from typing import Dict, Optional


@dataclass
class VibeAgentResult:
    returncode: int
    stdout: str
    stderr: str
    command: str


class VibeAgentClient:
    def __init__(
        self,
        executable: str = "vibe-agent",
        cwd: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
    ) -> None:
        self.executable = executable
        self.cwd = cwd
        self.env = env or {}

    def run_task(
        self,
        goal: str,
        *,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        max_iterations: Optional[int] = None,
        timeout: Optional[float] = None,
        check: bool = True,
    ) -> VibeAgentResult:
        cmd = [self.executable, "--goal", goal]

        if model:
            cmd.extend(["--model", model])
        if base_url:
            cmd.extend(["--base-url", base_url])
        if max_iterations is not None:
            cmd.extend(["--max-iterations", str(max_iterations)])

        merged_env = os.environ.copy()
        merged_env.update(self.env)

        completed = subprocess.run(
            cmd,
            cwd=self.cwd,
            env=merged_env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

        result = VibeAgentResult(
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            command=" ".join(cmd),
        )

        if check and completed.returncode != 0:
            raise RuntimeError(
                f"vibe-agent failed (exit={completed.returncode})\n"
                f"Command: {result.command}\n"
                f"STDOUT:\n{result.stdout}\n"
                f"STDERR:\n{result.stderr}"
            )

        return result
