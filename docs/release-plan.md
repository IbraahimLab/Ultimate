# Packaging and Release Plan

## Package Targets

1. **JavaScript SDK + CLI**
   - Package: `Ultimate`
   - Registry: npm
   - Contents: `dist/` + `README.md` + `LICENSE`
2. **Python SDK**
   - Package: `Ultimate`
   - Registry: PyPI
   - Source path: `packages/python-sdk`

## One-Command Release (recommended)

1. Set both package versions to the same value:
   - `package.json` -> `"version"`
   - `packages/python-sdk/pyproject.toml` -> `[project].version`
2. Commit and push your changes.
3. Run:
   - `release.cmd 0.1.0`

This script runs checks/builds and pushes tag `v0.1.0`.
Both GitHub workflows then auto-publish npm and PyPI.

## JS Release Checklist (npm)

1. Update version in `package.json`.
2. Run:
   - `npm ci`
   - `npm run check`
   - `npm run build`
   - `npm run pack:dry`
3. Tag release:
   - `git tag v0.1.0`
   - `git push origin v0.1.0`
4. GitHub Action `.github/workflows/release-npm.yml` publishes package.

## Python Release Checklist (PyPI)

1. Update version in `packages/python-sdk/pyproject.toml`.
2. Run:
   - `cd packages/python-sdk`
   - `python -m build`
   - or `uv build`
3. Validate artifacts:
   - check `packages/python-sdk/dist/*`
4. Tag release:
   - `git tag v0.1.0`
   - `git push origin v0.1.0`
5. GitHub Action `.github/workflows/release-pypi.yml` publishes package.

## Install Commands

### npm

```bash
npm install -g Ultimate
```

### pip

```bash
pip install Ultimate
```

### uv pip

```bash
uv pip install Ultimate
```

### uv tool (for CLI-like install)

```bash
uv tool install Ultimate
```

## Trusted Publishing Setup

1. Configure npm trusted publishing from your GitHub repo.
2. Configure PyPI trusted publisher for this repo and workflow.
3. Keep `id-token: write` enabled in release workflows.
4. With trusted publishing, PyPI token is not required.
