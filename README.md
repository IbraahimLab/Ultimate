# Vibe Coding Agent

Coding agent runtime with:

- CLI chat for natural language coding tasks
- project scanner + symbol index + import/use tracking
- dependency map (Node + Python)
- iterative `plan -> act -> verify` loop with auto-repair retries
- diff preview + manual approval before writes
- rollback on unresolved verification failures
- persistent memory + conventions across sessions
- policy guardrails + secret checks + audit log
- JS SDK exports + Python SDK packaging scaffold

## Provider Setup (Groq + Kimi)

Use these env variables in `.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
VIBE_MODEL=moonshotai/kimi-k2-instruct-0905
VIBE_BASE_URL=https://api.groq.com/openai/v1
```

## Install and Run

```bash
npm install
npm run dev
```

One-shot task:

```bash
npm run dev -- --goal "add tests for auth middleware"
```

Build:

```bash
npm run check
npm run build
npm run start
```

## Core Agent Tools

- `list_files`
- `read_file`
- `grep`
- `run_command`
- `write_file` (manual approval required)
- `scan_project`
- `symbol_lookup`
- `find_references`
- `dependency_map`
- `memory_set`
- `memory_get`

## Week 3-4 Delivered: Real Codebase Awareness

- Project scanning into `.vibe-agent/index/project-index.json`
- Symbol indexing:
  - TS/JS via TypeScript AST
  - Python via structured parser
- Import/use tracking
- Dependency mapping:
  - `package.json` deps/devDeps
  - `requirements*.txt`
  - `pyproject.toml` (project/poetry sections)

## Week 5-6 Delivered: Reliability Loop

- Auto verify command discovery after edits (test/lint/format/typecheck where available)
- Stack trace parsing (JS/TS + Python)
- Auto-repair loop limit via `VIBE_AUTO_REPAIR_ROUNDS`
- Optional rollback prompt for unresolved failures

## Week 7 Delivered: Memory + Conventions

- Persistent memory stored in `.vibe-agent/memory.json`
- Stores:
  - project rules
  - architecture notes
  - common commands
  - key/value conventions
- Memory is loaded into every task context and updated by model output

## Week 9 Delivered: Security + Team UX

- Policy file at `.vibe-agent/policy.json`
  - command allow/deny rules
  - blocked write globs
  - secret-handling toggle
- Secret detection blocks unsafe writes by default
- Full audit trail at `.vibe-agent/audit/<session>.jsonl`
- End-of-task change summary with line stats

## Runtime Config

See `.env.example` for all values:

- `VIBE_MAX_ITERATIONS`
- `VIBE_TOOL_TIMEOUT_MS`
- `VIBE_MAX_TOOL_OUTPUT_CHARS`
- `VIBE_MAX_SCAN_FILES`
- `VIBE_AUTO_REPAIR_ROUNDS`
- `VIBE_AUTO_VERIFY`
- `VIBE_STATE_DIR`

## SDK and Packaging

### JS SDK (npm)

This package now exports a JS SDK surface:

```ts
import { CodingAgent, loadRuntimeConfig } from "Ultimate";
```

Dry-run package check:

```bash
npm run pack:dry
```

Automated npm publish workflow:

- `.github/workflows/release-npm.yml`
- tag format: `v*`

### Python SDK (PyPI)

Python package scaffold is in:

- `packages/python-sdk`

Install locally:

```bash
pip install -e packages/python-sdk
```

or

```bash
uv pip install -e packages/python-sdk
```

Build:

```bash
cd packages/python-sdk
python -m build
```

Automated PyPI publish workflow:

- `.github/workflows/release-pypi.yml`
- tag format: `v*`

Detailed release checklist: `docs/release-plan.md`

## One Command Release

If both versions are already updated and committed:

```bash
release.cmd 0.1.0
```

This will:

1. Validate version sync (`package.json` + `packages/python-sdk/pyproject.toml`)
2. Run checks/builds
3. Push tag `v0.1.0`
4. Trigger both GitHub release workflows (npm + PyPI)

PyPI token note:

- If PyPI Trusted Publishing is configured, no token is needed.
- Without trusted publishing, you must use a PyPI API token workflow instead.
