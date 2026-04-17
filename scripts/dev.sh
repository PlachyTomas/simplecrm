#!/usr/bin/env bash
# SimpleCRM dev container launcher.
#
# Usage:
#   ./scripts/dev.sh                 Open an interactive shell in the dev container
#   ./scripts/dev.sh claude          Launch Claude Code with --dangerously-skip-permissions
#   ./scripts/dev.sh claude-plain    Launch Claude Code with prompts enabled (testing)
#   ./scripts/dev.sh stop            Stop and remove containers (keeps volumes)
#   ./scripts/dev.sh reset           Nuke everything including volumes and rebuild
#   ./scripts/dev.sh <cmd...>        Run an arbitrary command inside the container

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker-compose.dev.yml"

# Make sure the dev image is built (cheap no-op if up to date).
docker compose -f "$COMPOSE_FILE" build dev >/dev/null

case "${1:-shell}" in
  shell|"")
    docker compose -f "$COMPOSE_FILE" run --rm dev bash
    ;;
  claude)
    shift
    docker compose -f "$COMPOSE_FILE" run --rm dev \
      claude --dangerously-skip-permissions "$@"
    ;;
  claude-plain)
    shift
    docker compose -f "$COMPOSE_FILE" run --rm dev claude "$@"
    ;;
  stop)
    docker compose -f "$COMPOSE_FILE" down
    ;;
  reset)
    docker compose -f "$COMPOSE_FILE" down -v
    docker compose -f "$COMPOSE_FILE" build --no-cache dev
    echo "Reset complete. Volumes and image rebuilt."
    ;;
  *)
    docker compose -f "$COMPOSE_FILE" run --rm dev "$@"
    ;;
esac
