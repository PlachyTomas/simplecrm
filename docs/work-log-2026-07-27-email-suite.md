# Overnight run — email suite (F1 + F2 + F3)

2026-07-27 · autonomous session · all work committed, pushed, CI green.

| Commit | Feature |
|---|---|
| `b1baac9` | F1 — open & click tracking |
| `87684bc` | F2 — templates, signatures, merge fields, org tracking opt-out |
| `e038556` | F3 — Smart BCC inbound logging |

Suites at the end: backend **879** pytest · frontend **335** vitest · mypy, ruff,
eslint, tsc, prettier, i18n parity, vite build, api-types freshness — all green.
Migrations on a single head (`c5d6e7f8a9b0`).

---

## What you can do now that you couldn't yesterday

1. **See whether anyone read the mail.** Sends carry an invisible pixel and links
   rewritten through a signed redirect. The composer has a per-send toggle; campaign
   detail shows per-recipient opens/clicks plus aggregate rates. Read the *clicks* —
   Apple Mail prefetches images and inflates opens (the UI says so).
2. **Stop retyping the same mail.** Org-shared templates (admins/managers curate,
   everyone sends), a per-user signature appended behind the standard `-- ` delimiter,
   and merge fields grown from 3 tokens to 7: `{firma} {kontakt} {kontakt_jmeno}
   {vlastnik} {obchod} {hodnota} {muj_email}`.
3. **Get incoming mail into the CRM.** BCC your magic address
   (`bcc+<token>@in.simplecrm.cz`, shown in Settings) and the message files itself
   against the contact, company, and — only when there's exactly one open deal — that
   deal. Unmatched mail is stored rather than dropped.

---

## Decisions I made without you (say the word and I'll change any of them)

- **Tracking is on by default, with an org-level off switch.** F1 shipped with
  campaigns always tracked; the security review flagged that as an EU/ePrivacy
  problem, so F2 added `email_tracking_enabled` on the organization. Off means no
  token, no pixel, no link rewriting anywhere.
- **`{kontakt}` now means the full name on both surfaces** (it used to be the first
  name in campaigns, full name in the composer — a shared template greeted the same
  person two different ways). `{kontakt_jmeno}` is the first name everywhere.
- **Inbound stores a body, not attachments.** Filenames only; blobs were out of scope.
- **No two-way Gmail/Outlook sync.** Per the gap analysis: that's 4–8 weeks plus
  Google's annual CASA assessment, and Pipedrive gates it at €39 precisely because
  it's a moat, not table stakes.

---

## What review caught before it reached you

Each feature ran through an adversarial security review. The ones worth knowing about:

- **Open redirect on our own API origin** (F1). A valid signature over *any* random
  token redirected anywhere — mintable by anyone who could send themselves one tracked
  mail, and `/signup` is public. Now a click only redirects for a token belonging to a
  real send.
- **`PUBLIC_API_BASE_URL` unset would have shipped dead links** in every tracked mail,
  silently. The app now refuses to boot outside dev without it.
- **Saving a signature un-verified the mailbox** (F2), which disabled sending entirely.
  A cosmetic edit was closing the send gate.
- **Merge-expanded subjects overflowed the column** *after* SMTP delivered the mail —
  no row, an error in the UI, and a user who re-sends a duplicate. Subjects are clamped.
- **Smart BCC captured nothing for real users** (F3): token lookup case-folded a
  mixed-case token. The 18-test suite passed anyway because its fixture minted
  lowercase-only tokens — the fixture now uses mixed case deliberately.
- **The magic address was stored in `to_emails`/`cc_emails`** (F3), where any org
  member could read a colleague's token out of the email history and inject forged
  correspondence into their timeline. Stripped before storage.
- **Two unauthenticated 500 vectors**: non-ASCII header bytes through
  `hmac.compare_digest`, and ~1600 nested MIME parts (100 KB) blowing the stack in the
  stdlib parser — the latter also makes the forwarding worker bounce legitimate mail.

---

## Open items (deliberately not done)

**Deferred findings, all P3, none blocking:**

- `append_signature` is API-only — no UI switch, so a user with a stored signature who
  also types "S pozdravem" gets two sign-offs. Worth a composer checkbox.
- The composer merge-substitutes every 1:1 mail with no opt-out, so a mail that
  mentions `{firma}` on purpose gets rewritten.
- Replies from the composer send `deal_id`/`company_id` as null, so `{firma}`/`{obchod}`
  render empty on a reply even though the picker offers them.
- Public tracking/inbound endpoints have no rate limiting (the app has none anywhere).
  Anyone with a real token can inflate their own open counts.
- The tracking-token index build isn't `CONCURRENTLY`; harmless at current table sizes,
  worth changing before those tables get large.
- ~116 leaked `ACME` campaign rows in the **dev** DB from old test runs (pre-existing).

**Ops — yours, and nothing works in prod without it:**

1. `PUBLIC_API_BASE_URL=https://api.simplecrm.cz` (or wherever the API is publicly
   reachable). Backend won't boot outside dev without it.
2. `INBOUND_SHARED_SECRET=<random>` — must ship in the *same* deploy as this code, same
   reason.
3. `docs/inbound-email-setup.md`: MX for `in.simplecrm.cz`, Cloudflare Email Routing +
   the Worker script (included), then the curl smoke tests.
4. **Redeploy the backend.** Everything above — plus the open-deals filters, contact
   company subtitle, and delete permissions from 2026-07-24 — is live in the code and
   dead in prod until then. Only the frontend auto-deploys (Cloudflare Pages).
5. Consider whether tracking should default **off** for new orgs (currently on).

Screenshots from verification: `.playwright-mcp/f1-*`, `f2-*`, `f3-*`.
