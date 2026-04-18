# Task 5.4 — Mark as won / lost

Backend endpoints:
- `POST /api/v1/deals/{id}/mark-won` — moves the deal to the pipeline's
  `stage_type=won` stage, stamps `closed_at`, bumps the owning company's
  `last_order_at` + `ownership_expires_at` (365d from now), writes a
  `deal_won` Activity.
- `POST /api/v1/deals/{id}/mark-lost` — requires `{lost_reason}` (1-200
  chars). Moves to a dedicated `lost` stage if the pipeline has one,
  stamps `closed_at` + `lost_reason`, writes a `deal_lost` Activity.

Frontend:
- `useMarkDealWon` + `useMarkDealLost` mutation hooks; both invalidate
  the relevant deal / deals / pipeline query keys on success.
- DealDetailPage shows a primary "Označit jako vyhráno" (neon-lime per
  ui-design §4.2) + a ghost "Označit jako prohráno" button whenever the
  deal isn't yet closed. The lost flow opens a modal with a radio list
  of common reasons plus "Jiný" with a free-form input.
