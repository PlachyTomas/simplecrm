# What people actually want from a CRM — research (2026-07-31)

Owner ask: "research some papers or online surveys about what people want
most from a CRM and then try to improve on that on a special branch."
Inline web research (no fan-out); sources at the bottom.

## The convergent finding

Across buyer surveys, adoption studies and sales statistics, four themes
repeat — and three of them SimpleCRM already serves well. The fourth is a
real gap, and it happens to be the one with the largest measured revenue
impact.

### 1. Follow-up discipline is the single largest preventable revenue leak

- **48 % of salespeople never make a single follow-up attempt** after
  initial contact; 44 % give up after one.
- **80 % of B2B deals need 5+ touches to close**, yet 92 % of reps quit at
  four or fewer.
- The synthesis across sources: pipeline is mostly lost "not because of bad
  products… but because follow-up breaks down too early or never gets
  systematized."
- Pipedrive built its entire product moat on exactly this ("activity-based
  selling"): **every open deal should have a next planned activity**, the UI
  prompts for the next step whenever one completes, and "no next step" is
  treated as the pipeline's most urgent state. Reviewers consistently cite
  it as the reason the pipeline "stays honest".

**SimpleCRM today:** rotting badges (passive, days-since-stage-move) and
calendar events exist, but nothing distinguishes a deal WITH a planned next
step from one silently going stale; completing an activity never asks
"what's next?". This is the gap.

### 2. Data-entry burden kills adoption

- 55 % of CRM implementations miss their objectives; slow/low user adoption
  is the top cause; ~60 % of failures are people-related, only 6–10 %
  technology.
- Reps spent ~5.5 h/week on manual entry (35 % > 1 h/day); "every required
  field is a toll booth."

**SimpleCRM today:** already strong — ARES autofill, Smart BCC capture,
2-field quick actions, auto-logged activity timeline. Keep this bar; every
new feature must stay auto-captured or ≤2 fields.

### 3. Ease of use beats feature count; email is the #1 channel

- Buyers of SMB CRMs prioritize ease of use over advanced features.
- Email is the most important CRM channel for 29 % of users (ahead of
  social 25 %, ads 21 %).
- Top purchase motivations: centralized operations 41 %, analytical
  reporting 38 %, interaction tracking 35 %.

**SimpleCRM today:** this IS the product thesis ("CRM pro prodej. Nic víc,
nic míň.") — and the Mail page/Smart BCC/reports work maps directly onto
the 29/41/38/35 numbers. Validation, not a gap.

### 4. Academic lens (TAM/TOE studies on SME CRM adoption)

- Perceived usefulness + ease of use are the practical adoption
  determinants in SMEs; top-management support moderates everything.
- CRM adoption in SMEs correlates with 25–40 % retention improvement.
- SFA-acceptance literature notes most CRM rollouts "fail to be accepted by
  the sales force" — consistent with §2.

## The improvement to build: next-step discipline

One feature closes the §1 gap without violating §2's low-friction bar:

1. **Every open deal knows its next step** — the earliest upcoming calendar
   event bound to it. Board cards and the deal detail show it ("Další krok:
   út 5. 8."); a deal with none shows a quiet warning state.
2. **Completing an activity asks for the next one** — after logging a call
   or note via quick actions, one non-blocking nudge: "Naplánovat další
   krok?" (opens the existing event form prefilled). One click, skippable,
   zero new required fields.
3. **"Bez dalšího kroku" becomes visible** — the count surfaces where the
   team plans work (board toolbar filter and/or a dashboard widget), the
   same way rotting already does for stage-stagnation. Rotting says "this
   deal sat too long"; next-step says "nobody has decided what happens
   next" — the leading indicator instead of the lagging one.

Branch: `feature/next-step-discipline`. V1 slice = board/deal next-step
surfacing + post-activity nudge; widget + reports treatment as follow-up.

## Sources

- [Capterra CRM buyer data via SchedulingKit — 35 CRM statistics](https://schedulingkit.com/statistics/crm-statistics)
- [Zapier — Best CRMs for small business (ease-of-use priority)](https://zapier.com/blog/best-crms-for-small-business/)
- [Wave Connect — CRM statistics 2026 (adoption failure rates)](https://wavecnct.com/blogs/crm-statistics)
- [Salesflare — 7 CRM challenges (data-entry burden)](https://blog.salesflare.com/crm-challenges)
- [Squad4 — Why CRM user adoption fails](https://www.squad4.io/blog/why-crm-user-adoption-fails)
- [Centric Consulting — CRM failure & change management](https://centricconsulting.com/blog/why-did-your-crm-project-fail-change-management_eas/)
- [Martal — Sales follow-up statistics 2026](https://martal.ca/sales-follow-up-statistics-lb/)
- [LeadResponse — Why 80 % of deals require 5+ touches](https://leadresponse.co/blog/sales-follow-up-statistics)
- [IRC Sales Solutions — Follow-up statistics](https://ircsalessolutions.com/insights/sales-follow-up-statistics/)
- [Pipedrive — The ultimate guide to activity-based selling](https://www.pipedrive.com/en/blog/activity-based-selling)
- [Motii — Activity-based selling: Pipedrive's superpower](https://www.motii.co/post/activities-based-selling)
- [ScienceDirect — CRM technology acceptance in the sales force](https://www.sciencedirect.com/science/article/abs/pii/S001985010400149X)
- [PMC — Determinants of CRM adoption in SMEs (firm-size moderation)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7932763/)
- [ResearchGate — CRM systems and SME performance: systematic review](https://www.researchgate.net/publication/385096244_Customer_Relationship_Management_CRM_Systems_and_their_Impact_on_SMEs_Performance_A_Systematic_Review)
