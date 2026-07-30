# Mail page (email suite Stage 0) — design

Approved by owner 2026-07-30 (chat). Basis: `EmailSuitePitch.md` +
`docs/research/2026-07-30-email-sync-competitor-research.md`. Direction:
Stage 0 only — UI over already-captured mail; no sync, no OAuth, no
EmailEngine license yet (decide after usage evidence). Owner additions:
Smart-BCC setup guide behind a clickable ? icon; filtering by deal, company,
keyword. Owner verifies manually; console-error check stays.

## Established facts

- `sent_emails` already stores both directions (`direction`), subject, plain
  TEXT body (inbound HTML is tag-stripped at ingest → no XSS surface),
  snapshotted recipients, threading (`thread_id`, reply chain), tracking
  columns, and `company`/`deal`/`sender` relationships.
- `GET /api/v1/emails` lists with optional deal/company filters,
  `_scope_history` visibility (salespeople: own sends only) and sorts by
  `coalesce(sent_at, created_at)`. `GET /emails/{id}` returns
  `SentEmailDetail` = the email + its whole thread.
- Email activity payloads (mailer single sends, inbound Smart BCC) carry
  subject but NOT the email row id; bulk campaign activities carry
  `campaign_id` (by design — many recipients per activity).
- The magic address is served by `useInboundAddress` (Settings →
  `InboundAddressCard`); reading it mints the token. That card's comment
  says "deliberately no unmatched inbox screen" — Stage 0 revises this
  decision (update the comment).

## A. Backend (small)

- `SentEmailListItemOut(SentEmailOut)` + `company_name` / `deal_name` /
  `sender_name` (selectinload, filled endpoint-side like `_activity_out`).
  `SentEmailDetail` gets the same three names.
- `GET /emails` new params: `search` (ILIKE over subject, body, from_email,
  recipients-as-text; max 120), `direction` (outbound|inbound),
  `unmatched` (company IS NULL AND deal IS NULL), `mine`
  (sender_user_id = me; no-op for salespeople who are already scoped).
  Existing deal_id/company_id params unchanged (EmailHistorySection).
- Add `"email_id"` to the `email_sent` (mailer) and `email_received`
  (inbound) activity payloads. Old rows lack it — the UI only links rows
  that have it. Bulk campaigns unchanged.
- Tests: filters (search/direction/unmatched/mine), names in payload,
  salesperson scoping unchanged, payload email_id present on new sends.

## B. Mail page — `/app/emails`, sidebar "E-maily"

Structure mirrors `DealsListPage` (URL-param filters, debounced search,
pagination, CSV not needed). Row: direction badge (Odeslaný/Přijatý),
counterparty (outbound: first recipient +N; inbound: from), clickable
subject → detail modal, company link, deal link, date, tracking chips on
outbound (reuse EmailHistorySection's chip look). Filters: search box;
quick status select Vše / Odeslané / Přijaté / Nepřiřazené; company picker +
deal picker (fetch-100 + client filter, house pattern); "Jen moje" toggle
(hidden for salespeople). Empty state per ui-design.

Header ? icon (HelpCircle) → small dialog: your magic address + copy button
(via `useInboundAddress`), one-paragraph how-to (BCC on customer mail), the
auto-forward-rule tip (Seznam/Outlook), link to Settings → E-mail for
rotation. All copy cs+en in the `emails` ns.

## C. Email detail modal

`EmailDetailModal` ({emailId|null, onClose, onReply}): subject, direction
badge, from/to/cc, date, plain-text body (`whitespace-pre-wrap`), links to
company/deal, tracking state, thread list (other mails in the thread,
click to switch), Reply → existing compose-with-replyTo flow hosted by the
caller. Opened from: Mail page rows, EmailHistorySection subjects, and
timeline rows whose activity payload carries `email_id` (ActivityRow gets an
optional `onOpenEmail` callback; wired in DealTimelineSection + company
Aktivita tab).

## Out of scope

Mailbox sync/OAuth/EmailEngine (Stage 1), per-thread privacy controls,
bulk-campaign row linking, any Gmail work. Prod real-mail smoke test =
owner BCCs their magic address once (address surfaced during handoff).

## Verification

Owner clicks through `/app/emails`, a deal detail timeline, and a company
Aktivita tab. Before handoff: full local CI + playwright console-error
check on the new/touched routes (no screenshot loop — owner verifies).
