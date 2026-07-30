# Email suite pitch — sync with the user's email provider

*2026-07-30. Facts behind this pitch (with sources): [docs/research/2026-07-30-email-sync-competitor-research.md](docs/research/2026-07-30-email-sync-competitor-research.md). Context: Smart BCC capture via `in.simplecrm.cz` went live the same day.*

## The one fact that shapes everything

Reading a user's Gmail — any read scope at all — puts the app in Google's
"restricted scope" regime: verification taking weeks plus an **annual paid
security audit (CASA Tier 2, ~$540–1,800/yr, repeated every 12 months)**.
Meanwhile Microsoft Graph needs only a free publisher-identity check (1–5
days), and IMAP needs nobody's permission.

Our market is Czech SMBs: Seznam mailboxes, webhosting IMAP, M365 — Gmail is a
fraction, not the default. So the suite gets built in the order the
gatekeepers are cheap, not the order the logos are famous.

## What the market does

- **Everyone monetizes sync**: Pipedrive gates it to Advanced+, Raynet to
  Professional+, Close caps connected mailboxes per tier. BCC capture is free
  on all plans everywhere (Pipedrive, HubSpot, Copper). Our packaging matches
  the playbook already: Smart BCC free, sync becomes the paid-tier feature.
- **Best-practice sync scope** (Attio): Inbox + Sent folders only, not the
  whole mailbox; auto-link to matched contacts.
- **Best-practice privacy** (Raynet, Pipedrive, Attio): private-by-default,
  share per thread; or metadata-visible/body-hidden. Raynet's fully-private
  default is the Czech-market reference point.

## The plan — three stages sequenced by compliance cost

### Stage 0 — the email-suite UI over data we already have (€0 compliance)

- **Mail page**: unified list of everything already captured (app-sent,
  tracked, BCC'd, inbound), filters like Mine / Shared / Unmatched.
- **Clickable emails** in the Mail page and on activity timelines:
  sender/recipient/subject in the row, detail view with sanitized body and
  linked contact/company/deal.
- All of it reads from `sent_emails` — pure frontend + one or two list/detail
  endpoints. No sync, no OAuth, ships immediately, validates whether users
  actually click into emails before we pay anyone anything.
- Sync-light trick to *document*, not build: most providers (incl. Seznam)
  support conditional auto-forward rules → users can auto-forward customer
  mail to their magic address today.

### Stage 1 — real sync for the mailboxes Czech SMBs actually have

- **Engine: EmailEngine** (postalsys), self-hosted on our Hetzner box —
  **$995/yr flat**, unlimited mailboxes, handles IMAP+SMTP, Graph OAuth,
  webhooks. Mailbox data never leaves our infrastructure → no new DPA
  subprocessor; the GDPR story stays "Hetzner + Cloudflare edge".
- **Providers**: generic IMAP (Seznam, webhosting, Zoho) + Microsoft Graph
  (free publisher verification, needs an MPN account, 1–5 days).
- **Sync policy**: Inbox + Sent only; **store only contact-matched threads**
  (GDPR minimization + storage sanity); private-by-default with per-thread
  share, reusing the existing visibility machinery.
- Outbound stays on the existing per-user SMTP path.

### Stage 2 — Gmail, when demand is proven

- Free runway: apps touching **fewer than 100 Gmail accounts are exempt**
  from verification/CASA → covers the entire beta.
- When enough paying users want it: CASA Tier 2 (~$1–2k/yr, assessors
  TAC/DEKRA/Leviathan) on our own OAuth client.
- Bridge option if we want Gmail sooner: route *only Gmail* through an
  aggregator with a pre-verified shared OAuth app — **Unipile** (€49/mo incl.
  10 accounts, all data in France) or Nylas ($2/account/mo, EU Ireland DC).
  Aggregators cost per-account forever → bridge, not destination; self-hosted
  + CASA wins past ~50–100 mailboxes.

## Constraints to design in from day 1 (expensive to retrofit)

- Access/refresh tokens encrypted at rest, server-side only.
- Support/admin tooling must never display mailbox bodies (Google's "no human
  review" rule binds us contractually).
- Prompt deletion of synced data when a user disconnects/revokes.
- No AI features trained on Gmail content (explicitly banned by Google);
  per-user, on-request processing only.
- DPA: mailbox content joins the record; subprocessor list unchanged in
  Stage 1 (everything stays on Hetzner + Cloudflare).

## Costs

| Stage | Recurring cost |
|---|---|
| 0 — UI over captured mail | €0 |
| 1 — IMAP + Graph via EmailEngine | $995/yr flat |
| 2 — Gmail via own OAuth + CASA | +$540–1,800/yr |
| 2-bridge — Gmail via Unipile | €49+/mo (per-account growth) |

Compare: Nylas at 200 mailboxes ≈ $4.8k/yr and growing with every account.

## Recommendation

Greenlight **Stage 0** as the next build — pure frontend + existing data.
Decide the Stage 1 EmailEngine license only after the Mail page proves people
click into emails. Gmail last, on evidence.
