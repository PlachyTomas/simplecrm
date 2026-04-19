#!/usr/bin/env bash
set -e

# Re-assert git identity in case a volume mount shadowed it.
git config --global user.name "Claude Dev"
git config --global user.email "claude-dev@simplecrm.local"
git config --global --add safe.directory /workspace

# Restore Claude config from backup if needed
if [ ! -f "$HOME/.claude.json" ] && ls "$HOME/.claude/backups/.claude.json.backup."* 1>/dev/null 2>&1; then
    LATEST_BACKUP=$(ls -t "$HOME/.claude/backups/.claude.json.backup."* | head -1)
    cp "$LATEST_BACKUP" "$HOME/.claude.json"
    echo "Restored Claude config from backup"
fi

cat <<'BANNER'
================================================================
  SimpleCRM dev container
  ----------------------------------------------------------------
  user         : claude (non-root)
  git identity : Claude Dev <claude-dev@simplecrm.local>
  workspace    : /workspace  (your repo, mounted read-write)
  postgres     : postgres:5432  (db: simplecrm / user: simplecrm)
  claude code  : run  `claude --dangerously-skip-permissions`
  workflow     : single session, plans + builds + tests autonomously

  Isolation:
    - No access to host ~/.ssh, ~/.aws, or other host creds
    - No git push to remote (no SSH keys inside)
    - Commits are local only; push from your host after review

  Safety net:
    - This container is the sandbox. Everything done inside
      is bounded to /workspace and to the postgres service.
================================================================
BANNER

exec "$@"
