---
name: reviewing-in-batches
description: Use when asked to review, audit, or code-review the entire app or any surface too large for one pass (multiple routers/pages), or when resuming a review plan under docs/superpowers/plans/. Also use when a review might outlive the session's token budget.
---

# Reviewing in batches

## Overview

A whole-app review must survive session death. Findings live on disk from
the first minute; a fresh session resumes from the tracker with zero rework.
Never hold findings only in context.

## Files (create before reviewing anything)

- **Plan/tracker**: `docs/superpowers/plans/YYYY-MM-DD-<scope>-review-plan.md`
  — batch list `R0..Rn` with checkboxes, ground rules, locked user decisions.
- **Findings report**: `docs/superpowers/reviews/YYYY-MM-DD-<scope>-review.md`
  — append-only, one section per batch, written the moment a batch finishes.

## Finding format

`[P0–P3] file:line — summary — concrete failure scenario — suggested fix`

- **P0** security / data loss / tenant leak · **P1** correctness bug ·
  **P2** performance / reliability · **P3** maintainability / quality.

## Batch protocol

1. R0 is always recon: inventory, run test suites/linters/audits, record
   failures as findings, map the surface into the report header.
2. Order batches by blast radius: auth/tenancy → payments → data lifecycle →
   domain logic → API surface → frontend → quality → infra → synthesis.
3. Depth tiers: line-by-line on auth/tenancy/payments/data-lifecycle;
   standard on domain/API; light on presentational UI.
4. Adversarial multi-agent (ultracode) verification ONLY on batches where a
   missed bug is catastrophic (security, payments) unless the user widens it.
5. After EACH batch: append findings to the report, tick the tracker
   checkbox, THEN start the next batch. Never batch the bookkeeping.
6. Report-only: no code changes during review; fixes are triaged afterwards.

## Verify before reporting

Read the actual code path end to end before writing a finding. No
pattern-matched guesses. A finding without a concrete failure scenario is
not a finding.

## Resuming

Fresh session: read the plan/tracker → find first unchecked batch → skim the
report's existing findings (avoid duplicates) → continue. Do not re-review
checked batches.

## Common mistakes

- Findings summarized only in the final chat message → lost on cutoff.
- Ticking several checkboxes at once "at the end" → cutoff loses batches.
- Reviewing hot spots ad hoc without a tracker → fresh session redoes them.
