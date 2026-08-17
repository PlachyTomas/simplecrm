---
name: reviewing-completed-tasks
description: Use when a unit of owner-requested work reaches its done state — suites green, about to claim done, commit the final result, or prepare a push — and before reporting completion to the owner. Also use when unsure whether finished work counts as a completed task, or how deeply to check a diff before pushing.
---

# Reviewing completed tasks

## Overview

Standing owner-agreed gate (2026-08-17): every completed task gets a self-review BEFORE it is reported done or pushed. The trigger is **task completion, not the push** — recognizing completion is the session's job. CI green is not a review: it catches breakage, not design flaws, missed edge cases, or tenancy leaks.

## What counts as a completed task

- A coherent unit of owner-requested work reaching its done state: feature implemented, bug fixed, refactor landed — suites green, about to claim done / merge / push.
- NOT a trigger: WIP checkpoint commits or backup pushes mid-task; sub-steps of a larger tracked task (review once, at task level).
- Several trivial tasks finished together may share one review at the batch's highest tier.
- A task is not done until findings are triaged: P0/P1 fixed before claiming done or pushing; P2/P3 fixed or explicitly reported to the owner as accepted debt.

## Tiers — pick by the diff's risk, not its size

| Tier | When | What runs |
|---|---|---|
| T0 | docs, i18n copy, pure styling | Orchestrator reads the full diff itself; no agents |
| T1 (default) | normal feature branches | 2–4 pre-briefed opus agents sliced by surface (backend / frontend / ONE playwright live-UX agent); schema'd findings; orchestrator dedups and judges inline |
| T2 | diff touches auth/tenancy, money/invoices/subscriptions, GDPR/data lifecycle/erasure, or DB migrations | T1 + adversarial refuter votes (2–3 opus refuters) on P0/P1 findings only + ONE Fable single-point verdict as the final pre-push check (owner default, 2026-08-17) |

`/code-review ultra` stays owner-triggered for the biggest merges — never launch it.

## Mechanics

- **REQUIRED SUB-SKILL:** budget-optimal-ultracode governs every fan-out (pre-chewed prompts with exact paths and diff slices pasted in, schema returns, no synthesis agent).
- Diff ONCE inline; hand agents slices. Never let agents each run `git diff`.
- Finding format: `[P0–P3] file:line — summary — concrete failure scenario — fix` (reviewing-in-batches).
- T2 or any large review: append findings to `docs/superpowers/reviews/YYYY-MM-DD-<scope>-review.md` as they land, not at the end.
- Disclose the per-task model list when launching agents; offer `~/.claude/tools/ultracode-watch.sh` (ultracode-progress skill).

## Red flags — all of these mean run the review

| Excuse | Reality |
|---|---|
| "CI is green, it's fine" | CI never caught the deal-reopen bug or the GDPR erasure leaks — reviews did. |
| "The diff is small" | Small diffs on T2 surfaces caused the P0s. Tier is risk, not size. |
| "The owner approves the push anyway" | The push prompt shows a command, not the diff's flaws. |
| "I'll review after pushing" | Post-push review = production review. The gate is pre-claim. |
| "Lots of small steps, no single completion point" | Then the task completes NOW — review the accumulated diff. |
