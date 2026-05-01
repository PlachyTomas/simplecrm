#!/usr/bin/env bash
# scripts/claude-loop.sh — autonomous Claude Code session loop
#
# Sleeps 5 hours, then on each iteration:
#   - waits for any running Claude session to exit
#   - if RESUME.md exists → launches a new Claude session that continues
#     from RESUME.md per the prompt's session-resilience protocol
#   - if RESUME.md absent → exits cleanly (work is done)
#
# Started by the first Claude session via:
#   nohup ./scripts/claude-loop.sh PAYGATE_TASK.md > logs/loop.out 2>&1 < /dev/null & disown
#
# Stop manually with: kill $(cat .claude-loop.pid)

set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROMPT_FILE="${1:-PAYGATE_TASK.md}"
SLEEP_SECONDS=$((5 * 60 * 60))   # 5 hours
MAX_ITERATIONS=24                 # ~5 days of 5h sessions
PID_FILE=".claude-loop.pid"

mkdir -p logs
LOG_FILE="logs/claude-loop-$(date +%Y%m%d-%H%M%S).log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Refuse to start a second loop instance.
if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || echo "")"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    log "ERROR: another claude-loop is already running (PID $EXISTING_PID). Exiting."
    exit 1
  fi
fi
echo "$$" > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

if [ ! -f "$PROMPT_FILE" ]; then
  log "ERROR: prompt file not found: $PROMPT_FILE"
  exit 1
fi

wait_for_no_claude() {
  local waited=0
  while pgrep -x claude >/dev/null 2>&1; do
    if [ $((waited % 600)) -eq 0 ]; then
      log "Claude is still running — waiting for it to exit..."
    fi
    sleep 30
    waited=$((waited + 30))
  done
}

wake_time() {
  if date -d "+5 hours" '+%Y-%m-%d %H:%M:%S' >/dev/null 2>&1; then
    date -d "+5 hours" '+%Y-%m-%d %H:%M:%S'
  else
    date -v +5H '+%Y-%m-%d %H:%M:%S'
  fi
}

log "claude-loop started (PID $$)"
log "  Repo:    $REPO_ROOT"
log "  Prompt:  $PROMPT_FILE"
log "  Sleep:   5h between sessions"
log "  Logs:    $LOG_FILE"

ITERATION=0
while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))

  log ""
  log "============================================================"
  log "Iteration $ITERATION — sleeping 5h until $(wake_time)"
  log "============================================================"
  sleep $SLEEP_SECONDS

  wait_for_no_claude

  if [ ! -f "RESUME.md" ]; then
    log "No RESUME.md present → work is complete. Exiting cleanly."
    exit 0
  fi

  log "RESUME.md present → launching new Claude session"
  CONTINUATION_PROMPT="RESUME.md is present. Read WORK_LOG.md and RESUME.md in full, then continue executing $PROMPT_FILE from the exact next step. Delete RESUME.md once you have absorbed it. The auto-loop is already running (PID $$) — do NOT re-bootstrap it. When ALL work in $PROMPT_FILE is complete (every commit in the commit plan made, all acceptance criteria met, all tests green), do NOT write a new RESUME.md — its absence signals that no further sessions are needed."

  claude --dangerously-skip-permissions "$CONTINUATION_PROMPT" 2>&1 | tee -a "$LOG_FILE" || true

  log "Claude session ended"
done

log "WARNING: hit max iterations ($MAX_ITERATIONS). Stopping for safety."
log "  Inspect WORK_LOG.md and RESUME.md, then re-launch manually if needed."
exit 1
