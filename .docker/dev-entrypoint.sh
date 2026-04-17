#!/usr/bin/env bash
set -e

# Re-assert git identity in case a volume mount shadowed it.
git config --global user.name "Claude Dev"
git config --global user.email "claude-dev@simplecrm.local"
git config --global --add safe.directory /workspace

cat <<'BANNER'
================================================================
  SimpleCRM dev container
  ----------------------------------------------------------------
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
