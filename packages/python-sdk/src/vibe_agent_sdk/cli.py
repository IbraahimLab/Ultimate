from __future__ import annotations

import argparse
import sys

from .client import VibeAgentClient


def main() -> None:
    parser = argparse.ArgumentParser(description="Python wrapper for vibe-agent")
    parser.add_argument("--goal", required=True, help="Task to run")
    parser.add_argument("--model", default=None, help="Model override")
    parser.add_argument("--base-url", default=None, help="Provider base URL override")
    parser.add_argument("--max-iterations", type=int, default=None, help="Loop limit")
    parser.add_argument("--executable", default="vibe-agent", help="CLI executable path")
    args = parser.parse_args()

    client = VibeAgentClient(executable=args.executable)
    result = client.run_task(
        args.goal,
        model=args.model,
        base_url=args.base_url,
        max_iterations=args.max_iterations,
        check=False,
    )

    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    raise SystemExit(result.returncode)
