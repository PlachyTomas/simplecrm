#!/usr/bin/env bash
# Start Postgres, backend, and frontend for local development.
#
# Usage:
#   ./scripts/start-local.sh [-b BACKEND_PORT] [-f FRONTEND_PORT] [--stop-db]
#
# Examples:
#   ./scripts/start-local.sh                  # defaults (backend 8000, frontend 5173)
#   ./scripts/start-local.sh -b 8001 -f 5174  # run alongside another instance
#
# Options:
#   -b, --backend-port PORT   uvicorn port (default 8000, or $BACKEND_PORT)
#   -f, --frontend-port PORT  vite dev server port (default 5173, or $FRONTEND_PORT)
#       --stop-db             also stop the Postgres container on exit
#   -h, --help                show this help
#
# Ctrl-C stops backend + frontend and leaves Postgres running unless --stop-db.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker-compose.dev.yml"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
STOP_DB=0

usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--backend-port)
      [[ $# -ge 2 ]] || { echo "error: $1 requires a port number" >&2; exit 2; }
      BACKEND_PORT="$2"; shift 2 ;;
    -f|--frontend-port)
      [[ $# -ge 2 ]] || { echo "error: $1 requires a port number" >&2; exit 2; }
      FRONTEND_PORT="$2"; shift 2 ;;
    --stop-db) STOP_DB=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

for port_name in BACKEND_PORT FRONTEND_PORT; do
  port_value="${!port_name}"
  if ! [[ "$port_value" =~ ^[0-9]+$ ]] || (( port_value < 1 || port_value > 65535 )); then
    echo "error: $port_name='$port_value' is not a valid TCP port" >&2
    exit 2
  fi
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

port_in_use() {
  # 0 if something is listening on the given TCP port on loopback
  if command -v ss >/dev/null 2>&1; then
    ss -tlnH "sport = :$1" 2>/dev/null | grep -q .
  else
    (echo >/dev/tcp/127.0.0.1/"$1") >/dev/null 2>&1
  fi
}

for port_name in BACKEND_PORT FRONTEND_PORT; do
  port_value="${!port_name}"
  if port_in_use "$port_value"; then
    echo "error: $port_name=$port_value is already in use" >&2
    echo "hint: another instance may be running — set $port_name to a free port, e.g. $port_name=$((port_value + 1))" >&2
    exit 1
  fi
done

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

echo "[start-local] starting backend on :$BACKEND_PORT (logs: $LOG_DIR/backend.log)"
(cd backend && uv run uvicorn app.main:app --reload --port "$BACKEND_PORT") \
  >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo "[start-local] waiting for backend healthz..."
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:$BACKEND_PORT/api/v1/healthz" >/dev/null 2>&1; then
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

echo "[start-local] starting frontend on :$FRONTEND_PORT (logs: $LOG_DIR/frontend.log)"
(cd frontend && VITE_API_BASE_URL="http://localhost:$BACKEND_PORT" \
  pnpm dev --port "$FRONTEND_PORT" --strictPort) \
  >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

cat <<EOF

[start-local] all services up:
  postgres  -> 127.0.0.1:5432
  backend   -> http://localhost:$BACKEND_PORT  (logs: $LOG_DIR/backend.log)
  frontend  -> http://localhost:$FRONTEND_PORT  (logs: $LOG_DIR/frontend.log)

Press Ctrl-C to stop backend + frontend.
EOF

wait -n "$BACKEND_PID" "$FRONTEND_PID"
