#!/usr/bin/env bash
# Start Postgres, backend, and frontend for local development.
#
# Usage:
#   ./scripts/start-local.sh
#
# Ctrl-C stops backend + frontend and leaves Postgres running.
# Pass --stop-db to also stop the Postgres container on exit.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker-compose.dev.yml"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"

STOP_DB=0
for arg in "$@"; do
  case "$arg" in
    --stop-db) STOP_DB=1 ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: '$1' is required but not on PATH" >&2
    exit 1
  }
}

require docker
require uv
require pnpm

if [[ ! -f backend/.env ]]; then
  echo "error: backend/.env is missing — see docs/local-development.md §1" >&2
  exit 1
fi
if [[ ! -f frontend/.env.local ]]; then
  echo "error: frontend/.env.local is missing — see docs/local-development.md §1" >&2
  exit 1
fi

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "[start-local] shutting down..."
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ "$STOP_DB" -eq 1 ]]; then
    echo "[start-local] stopping postgres container..."
    docker compose -f "$COMPOSE_FILE" stop postgres >/dev/null
  else
    echo "[start-local] postgres still running (use --stop-db to stop it)"
  fi
}
trap cleanup EXIT INT TERM

echo "[start-local] starting postgres..."
docker compose -f "$COMPOSE_FILE" up -d postgres >/dev/null

echo "[start-local] waiting for postgres to accept connections..."
for _ in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U simplecrm >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U simplecrm >/dev/null 2>&1 || {
  echo "error: postgres did not become ready in 30s" >&2
  exit 1
}

echo "[start-local] syncing backend deps + running migrations..."
(cd backend && uv sync --quiet && uv run alembic upgrade head)

echo "[start-local] starting backend on :8000 (logs: $LOG_DIR/backend.log)"
(cd backend && uv run uvicorn app.main:app --reload --port 8000) \
  >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo "[start-local] waiting for backend healthz..."
for _ in $(seq 1 60); do
  if curl -fsS http://localhost:8000/api/v1/healthz >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "error: backend exited early — see $LOG_DIR/backend.log" >&2
    exit 1
  fi
  sleep 1
done

echo "[start-local] installing frontend deps + regenerating API types..."
(cd frontend && pnpm install --silent && pnpm types:generate)

echo "[start-local] starting frontend on :5173 (logs: $LOG_DIR/frontend.log)"
(cd frontend && pnpm dev) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

cat <<EOF

[start-local] all services up:
  postgres  -> 127.0.0.1:5432
  backend   -> http://localhost:8000  (logs: $LOG_DIR/backend.log)
  frontend  -> http://localhost:5173  (logs: $LOG_DIR/frontend.log)

Press Ctrl-C to stop backend + frontend.
EOF

wait -n "$BACKEND_PID" "$FRONTEND_PID"
