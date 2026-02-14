# ultimate-vibe-agent

Build features from plain English requests inside your real codebase.

`ultimate-vibe-agent` is an AI coding teammate that does more than generate snippets:

- understands your repository structure
- reads and edits multiple files
- runs real commands and checks
- asks for write approval with clear diffs
- keeps memory of project conventions
- enforces policy + audit trails for safer team usage

---

## Why This Product Exists

Most AI coding tools look good in demos but break on real projects because they ignore context.

This product is built for real software delivery:

- existing repositories
- active teams
- deadlines
- quality standards

You can use it for feature delivery, bug fixing, refactors, and repetitive engineering tasks while keeping humans in control.

---

## What You Get

### 1) Natural Language to Working Code
Describe what you want in simple English:

> "Add forgot-password flow with email token and tests."

The agent plans, edits, validates, and iterates.

### 2) Real Codebase Awareness
It scans your project and tracks symbols/imports so it can make grounded changes.

### 3) Plan -> Act -> Verify Loop
Not one-shot guessing. It uses iterative steps and verifies work using commands.

### 4) Diff Approval Before Writes
Every write is previewed with a unified diff and requires approval.

### 5) Team Safety
Policy rules, secret detection, and audit logs make it safer to adopt in shared repos.

### 6) Multi-Interface Usage
Use whichever fits your workflow:

- CLI (`vibe-agent`)
- JavaScript SDK (`ultimate-vibe-agent`)
- Python wrapper SDK (`vibe_agent_sdk`)

---

## Quick Start

### 1) Install dependencies

```bash
npm install
```

### 2) Configure provider

Create `.env` (or copy `.env.example`) and set:

```env
GROQ_API_KEY=your_groq_api_key_here
VIBE_MODEL=moonshotai/kimi-k2-instruct-0905
VIBE_BASE_URL=https://api.groq.com/openai/v1
```

### 3) Run interactive mode

```bash
npm run dev
```

### 4) Run one-shot task

```bash
npm run dev -- --goal "add onboarding checklist feature with tests"
```

---

## CLI Usage

If installed globally:

```bash
npm install -g ultimate-vibe-agent
vibe-agent
```

Useful commands inside chat:

- `/task <goal>` run a task
- `/config` view active runtime settings
- `/help` command help
- `/exit` quit

---

## JavaScript SDK Example

```ts
import { CodingAgent, loadRuntimeConfig } from "ultimate-vibe-agent";

const config = loadRuntimeConfig(process.cwd(), {
  model: "moonshotai/kimi-k2-instruct-0905",
  baseUrl: "https://api.groq.com/openai/v1",
  maxIterations: 8,
});

const agent = new CodingAgent(config);

const ui = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  ask: async () => "continue",
  confirm: async () => true,
};

await agent.runTask("refactor auth flow and add regression tests", ui);
```

---

## Python SDK Example

```python
from vibe_agent_sdk import VibeAgentClient

client = VibeAgentClient(
    executable="vibe-agent",
    env={
        "GROQ_API_KEY": "your-key",
        "VIBE_MODEL": "moonshotai/kimi-k2-instruct-0905",
        "VIBE_BASE_URL": "https://api.groq.com/openai/v1",
    },
)

result = client.run_task(
    "optimize product search endpoint and add tests",
    max_iterations=6,
    check=False,
)

print(result.returncode)
print(result.stdout)
```

Install Python package:

```bash
pip install ultimate-vibe-agent
```

or

```bash
uv pip install ultimate-vibe-agent
```

---

## Core Tooling Built In

- `list_files`
- `read_file`
- `grep`
- `run_command`
- `write_file` (approval required)
- `scan_project`
- `symbol_lookup`
- `find_references`
- `dependency_map`
- `memory_set`
- `memory_get`

---

## Product Workflow (What Users Experience)

1. User describes a feature in plain English.
2. Agent plans concrete steps.
3. Agent inspects and edits relevant files.
4. User reviews diffs before write.
5. Agent runs verification commands.
6. Agent retries fixes if checks fail.
7. User gets a change summary and audit trail.

---

## Safety and Governance

Default safety behavior includes:

- command policy controls
- blocked sensitive write paths (like `.env`, `.git/*`)
- secret pattern detection before writes
- full session audit logs
- rollback option for unresolved bad sessions

State and logs are stored under:

- `.vibe-agent/memory.json`
- `.vibe-agent/policy.json`
- `.vibe-agent/index/project-index.json`
- `.vibe-agent/audit/*.jsonl`

---

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `GROQ_API_KEY` | Provider API key | empty |
| `VIBE_API_KEY` | Generic API key override | empty |
| `VIBE_MODEL` | Model name | `moonshotai/kimi-k2-instruct-0905` |
| `VIBE_BASE_URL` | OpenAI-compatible endpoint | `https://api.groq.com/openai/v1` |
| `VIBE_MAX_ITERATIONS` | Max loop rounds | `6` |
| `VIBE_TOOL_TIMEOUT_MS` | Tool timeout | `120000` |
| `VIBE_MAX_TOOL_OUTPUT_CHARS` | Output truncation limit | `18000` |
| `VIBE_MAX_SCAN_FILES` | Indexing limit | `6000` |
| `VIBE_AUTO_REPAIR_ROUNDS` | Retry cap for repeated failures | `3` |
| `VIBE_AUTO_VERIFY` | Auto-run detected verify commands | `true` |
| `VIBE_STATE_DIR` | Agent state directory | `.vibe-agent` |

---

## Landing Page

Preview locally:

```bash
npm run landing:serve
```

Then open:

`http://localhost:4173`

For Vercel deployment:

- Root Directory: `landing`

---

## Build and Validation

```bash
npm run check
npm run build
npm run start
```

Python build:

```bash
npm run build:py
```

---

## Release

Automated publish setup exists for both npm and PyPI.

Use one command after version bump and commit:

```bash
release.cmd 0.1.1
```

Detailed checklist:

- `docs/release-plan.md`

---

## License

MIT - see `LICENSE`.
