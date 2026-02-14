# vibe-agent-sdk (Python)

Python SDK wrapper for the Vibe Coding Agent.

This SDK calls the Node CLI (`vibe-agent`) through subprocess so Python projects can invoke the same agent runtime.

## Install

```bash
pip install vibe-agent-sdk
```

or

```bash
uv pip install vibe-agent-sdk
```

## Usage

```python
from vibe_agent_sdk import VibeAgentClient

client = VibeAgentClient(executable="vibe-agent")
result = client.run_task("add unit tests for auth middleware")
print(result.stdout)
```

## Notes

- Ensure the Node CLI is installed and available as `vibe-agent`.
- Configure environment variables (`GROQ_API_KEY`, `VIBE_MODEL`, `VIBE_BASE_URL`) before running tasks.
