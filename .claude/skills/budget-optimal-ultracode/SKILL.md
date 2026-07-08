---
name: budget-optimal-ultracode
description: Use when running ultracode/Workflow multi-agent orchestration on a capped plan (Max, limited credits) or when the user asks for token-efficient agent fan-out — review passes, audits, fix batches on a feature branch.
---

# Budget-optimal ultracode

## Overview

Multi-agent quality without multi-agent bills. Core principle: **the orchestrator thinks,
agents read and write.** Every agent has fixed overhead (system prompt + its own repo
exploration), so fewer, broader agents with pre-chewed context beat many narrow ones.

## Quick reference

| Decision | Budget default |
|---|---|
| Subagent model | Opus max; NEVER the main-session model (Fable) as a subagent |
| Mechanical stages (file lists, label checks, lint-style sweeps) | `model: 'haiku'` or `'sonnet'`, `effort: 'low'` |
| Review fan-out for one feature branch | 3–6 agents total (backend / frontend / live-UX), not per-file |
| Findings verification | Orchestrator judges inline; adversarial N-vote panels ONLY when user says "thorough/comprehensive audit" |
| Synthesis/dedup stage | Orchestrator does it itself — no synthesis agent |
| Browser (playwright MCP) audits | ONE agent, all screens sequentially — the browser is shared, parallel agents clash |
| Discovery loops | Single round + orchestrator judgment; no loop-until-dry unless explicitly asked |
| Re-running after script edits | `Workflow({scriptPath, resumeFromRunId})` — cached prefix is free |

## Method

1. **Scout inline first.** Cheap greps/reads in the main session to build the work-list,
   file lists, spec paths. Agents must never re-discover what you already know.
2. **Pre-chew agent prompts.** Paste exact file paths, line refs, acceptance criteria,
   and the complaint list into each prompt. An agent that explores from scratch costs
   2–5× one that starts at the right files.
3. **Force compact returns.** Always pass a `schema` — structured JSON findings, not prose
   reports. Cap findings per agent in the prompt ("max 15, ranked").
4. **Tier models per stage.** Opus for judgment (review, fix, verify); haiku/sonnet +
   `effort: 'low'` for mechanical transforms. When unsure, one tier down — a wrong cheap
   answer surfaces in verification; a wasted Opus run is just gone.
5. **Persist state for resume.** Findings and progress go to a repo tracker file
   (`docs/.../plans/*.md`) as they land, so a credit cutoff loses nothing.
6. **Fix in the shared tree, sequentially or in disjoint-file groups.** Worktree isolation
   + merge reconciliation burns tokens; partition files instead when parallelizing fixes.

## Common mistakes

- Spawning a verifier per finding by default → verify only doubtful/expensive findings.
- A "synthesis agent" to merge findings the orchestrator already has in context.
- parallel() barriers between stages that don't need cross-item context (wall-clock waste;
  use pipeline()).
- Re-running a whole workflow after a small script edit instead of resuming.
- Letting agents run `git diff` on a huge branch each — diff once inline, hand out slices.
