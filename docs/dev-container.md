# SimpleCRM development environment

This repo runs Claude Code in an isolated Docker container. The container is the sandbox — the permission flag `--dangerously-skip-permissions` is safe to use inside because the blast radius is bounded to `/workspace` and the sibling postgres service.

## Prerequisites

- Docker Desktop (macOS / Windows) or Docker Engine + Compose plugin (Linux)
- Git
- A Claude Code subscription or an `ANTHROPIC_API_KEY`

## First-time setup

1. Clone the repo.
2. On the host, authenticate Claude Code once so `~/.claude` exists:
   ```bash
   claude login
   ```
   This directory is mounted into the container so auth persists.
3. Build the dev image:
   ```bash
   ./scripts/dev.sh reset
   ```

## Daily use

Open a shell inside the container:
```bash
./scripts/dev.sh
```

Launch Claude Code with permission prompts disabled (recommended for overnight autonomous runs):
```bash
./scripts/dev.sh claude
```

Stop everything but keep data:
```bash
./scripts/dev.sh stop
```

Nuke volumes and rebuild (after a bad state):
```bash
./scripts/dev.sh reset
```

## What the container can and cannot do

**Can:**
- Read and write files anywhere under `/workspace` (the repo)
- Install dependencies (`pnpm install`, `uv sync`, etc.)
- Run tests and linters
- Make local git commits as `Claude Dev <claude-dev@simplecrm.local>`
- Connect to the sibling `postgres` service
- Make outbound HTTP requests (npm registry, PyPI, Anthropic API, ARES)

**Cannot:**
- Touch any host file outside the repo
- Access `~/.ssh`, `~/.aws`, `~/.gnupg`, or other host credentials
- Push to a git remote (no SSH keys inside)
- Run `sudo` on the host
- Affect other containers or networks

## Usage

The recommended workflow is a **single Claude Code session running inside the container**. It plans, builds, and tests sequentially.

Launch Claude Code inside the container:
```bash
./scripts/dev.sh claude
```
Then feed it the `MANAGER_TASK.md` brief. It will work through tasks autonomously, committing progress and writing `RESUME.md` when a session limit approaches.

Set model and effort inside the session with `/model` and `/effort` commands (recommend Opus with high effort).

## Pushing to a remote

Do this from the host, not from the container. The container has no SSH keys intentionally.

```bash
# On host
git pull         # bring in the container's commits (they're on disk via the mount)
git log          # review what Claude Dev committed
git push         # push to origin
```

## Changing the git identity inside the container

Edit `.docker/dev.Dockerfile` and `.docker/dev-entrypoint.sh`, then `./scripts/dev.sh reset`.
