# Task 0.1 — Initialize monorepo

## Goal
Establish the repo skeleton so subsequent tasks have a home. No application code yet.

## Files in scope
- `README.md` — project-level README (distinct from existing `README-dev-env.md`).
- `backend/.gitkeep` + short `backend/README.md` — placeholder until Task 0.2.
- `frontend/.gitkeep` + short `frontend/README.md` — placeholder until Task 0.3.
- `docs/adr/0001-stack-and-structure.md` — record the stack decision from the brief.
- `docs/README.md` — points to ADRs, API docs, runbook (to-be-created).

## Not in scope
- No package.json, pyproject.toml, or source yet (those come in 0.2 / 0.3).
- No CI (0.5).
- No DB (0.4).

## Acceptance criteria
1. `README.md` exists at repo root, briefly describes the product and points to
   `MANAGER_TASK.md`, `WORK_LOG.md`, `README-dev-env.md`.
2. `backend/` and `frontend/` dirs exist and are tracked (via `.gitkeep` or README).
3. `docs/adr/0001-stack-and-structure.md` captures the Section 4 stack decision.
4. `git status` is clean on my own changes after commit (dev-env edits left as-is).
5. One commit: `chore(repo): initialize monorepo skeleton — Task 0.1`.

## Verification
- `ls backend frontend docs/adr` shows the expected structure.
- `git log -1` shows the conventional-commit message.
