# Migrate from Pipedrive — design

2026-07-27 · Approved by the owner. Research: `docs/research/2026-07-27-pipedrive-export-format.md`.

## Goal

A Pipedrive user drops their exported files in, answers a couple of questions, and
their companies, contacts and pipeline are in SimpleCRM — with a way back if it
goes wrong.

## Scope

**In:** organizations → companies, persons → contacts, deals → deals; CSV; undo of a
whole import run; Czech and English Pipedrive headers.

**Out (v1, deliberate):** activities, notes, emails, products; real custom-field
definitions (gap #7 — custom columns append to the note instead); API-based sync;
XLSX (Pipedrive stores dates as Excel serials there, so v1 asks for CSV).

## Architecture

The existing importer already owns the generic work: CSV sniffing, header→field
mapping, dry-run preview, contact→company matching, owner resolution by e-mail or
name, per-row error reporting, rate limiting, admin gating. All of it stays.

New on top: a **provider layer**, `backend/app/services/imports/providers/`, where
`pipedrive.py` declares file roles, header alias tables (cs + en), and value
transforms. The engine stays provider-agnostic; a future "migrate from HubSpot" is one
profile file, not a second importer.

Auto-detection is a *convenience over* the manual mapper, never a replacement.
Anything unrecognised falls through to the mapping step the user confirms anyway —
that is what makes the unverified-header risk survivable (see Risks).

### Pipedrive profile facts (from research, `[V]` = verified verbatim)

- Header convention `Entity - Field`: `Deal - Title`, `Person - Email (Work)`,
  `Organization - Name*` `[V]`. Trailing `*` marks required columns — strip it.
- Deals reference their org and person **by name** (`Organization`, `Contact person`),
  not by id `[V]`. Linking therefore matches on name; the `… - Pipedrive System ID`
  column, when present, is stored as a dedupe key only.
- `Deal - Status` is the word Open / Won / Lost `[V]`; dates arrive in separate
  columns (`Deal - Won time`, `Deal - Lost time`, `Deal - Closed on`,
  `Deal - Expected close date`) `[V]`.
- Value and currency are two columns; the value is in the deal's own currency `[V]`.
- Organization addresses explode into nine `Organization - Address - <part> of Address`
  subfields `[V]` — v1 maps the main address string and the city/ZIP/street parts we
  have columns for, and ignores the rest.
- Multi-value e-mail/phone appear either comma-joined or as `… (Work)` / `… (Home)`
  columns `[V]`. Take the first value as primary; keep the rest in the note.

## Deals: the part that needs care

SimpleCRM's convention is that a **lost deal sits in an open-type stage with
`closed_at` and `lost_reason` set** — there is no "lost" stage. An importer that
dumped Pipedrive's lost deals into an open stage without `closed_at` would silently
corrupt every report, the forecast, and the new rotting badges.

So: `Deal - Status` drives `closed_at` and the stage *type*, and the stage mapping only
positions the deal.

- **Open** → mapped stage, `closed_at` null.
- **Won** → mapped stage if it is won-type, else the pipeline's won stage;
  `closed_at` = `Deal - Won time` ?? `Deal - Closed on` ?? import date.
- **Lost** → mapped stage (open-type is correct here), `closed_at` = `Deal - Lost time`
  ?? `Deal - Closed on` ?? import date, `lost_reason` = `Deal - Lost reason` or a
  fallback string.

**Stage mapping step:** read the distinct values of the stage column, show one select
per value pre-guessed by fuzzy name match against the org's stages. Unmapped values
block the import (an explicit error, not a silent default).

**Company linking:** a deal naming a company absent from the organizations file
**creates** that company, surfaced in the preview ("3 firmy budou vytvořeny z
obchodů"). A migration must not fail because someone exported deals but not orgs.
`deals.company_id` is NOT NULL, so this is required, not a nicety.

**Currency:** if `Deal - Currency of value` disagrees with the org currency, import the
number as-is and warn once in the preview with the count. No FX conversion — inventing
exchange rates is worse than a visible warning.

## Corrections found when the spec met the code (2026-07-27, phase 1)

- The deal column is `primary_contact_id`, not `contact_id` (nullable — optional
  linking stands).
- **Deals have no `note` column**, so the "custom fields append to the note" fallback
  works for companies and contacts only. Pipedrive *deal* custom fields are dropped in
  v1; a caller asking for `note_append` on the deal side raises.
- Pipedrive's persons export carries `Person - Name` (one full name) while our
  `first_name`/`last_name` are both required — a persons export is unimportable without
  a `full_name` split target, so one was added. Single-token names fail loudly rather
  than have a given name invented for them.
- No activity rows are written on import: a 500-deal migration would otherwise fabricate
  500 timeline entries all stamped at import time. `Company.last_order_at` /
  `ownership_expires_at` are likewise left alone, so historical deals can't silently
  extend or expire ownership.
- Auto-created companies are left unowned, because owner assignment feeds the
  `max_owned_companies` cap arithmetic and silently busting a business cap is worse
  than a later bulk-assign.

## Undo

New table `import_runs` (id, organization_id, user_id, provider, created_at, counts
JSONB, status, undone_at) and a nullable, indexed `import_run_id` FK on `companies`,
`contacts`, `deals`.

`POST /imports/runs/{id}/undo` deletes what the run created, in FK-safe order
(deals → contacts → companies), in one transaction, **skipping anything modified
since the import** (`updated_at > created_at`) and reporting it: "3 firmy byly po
importu upraveny — ponecháme je beze změny." Admin only; refuses if already undone.

Skipping edited rows is what makes undo trustworthy rather than a second destructive
button.

## Custom fields

Unrecognised columns get a "→ připojit k poznámce" mapping option, the default for
provider custom fields, appended to the entity's note as `Label: value` lines with a
sample rendered in the preview. When gap #7 lands, the profile changes in one place.

## Wizard

Provider pick ("Odkud migrujete?" — Pipedrive, obecné CSV) → drop files (role
auto-detected) → mapping (pre-filled, unknowns highlighted) → stage mapping (only when
deals are present) → preview (counts, warnings, per-row errors) → result with an undo
button. Plus an import history list with per-run undo.

## Testing

- Provider profile: header alias resolution for cs and en variants, `*` stripping,
  address subfields, multi-value e-mail/phone.
- Deals: each status → correct `closed_at`/stage-type/`lost_reason`, especially that a
  lost deal keeps an open-type stage; unmapped stage blocks; company auto-creation;
  currency mismatch warns.
- Undo: removes created rows, skips edited ones, FK order, idempotent refusal.
- Synthetic fixtures for both header languages now; a real export becomes a regression
  fixture in the hardening pass.

## Risks

1. **Unverified headers.** No real export file was obtainable; published lists are
   Pipedrive's *import* vocabulary. Mitigated by the manual mapper fallback and by
   phase 4.
2. **Czech localization unknown.** Pipedrive's Czech UI is localized and export headers
   derive from displayed labels, so headers may be Czech. Never match English literals
   — alias table plus fuzzy matching, with the user confirming.
3. **Undo after real work.** Users may undo days later having built on the data; the
   edited-row skip plus a clear count is the guard.

## Sequencing

1. Provider framework + Pipedrive profile + deals in the import engine (backend).
2. Undo: `import_runs`, provenance columns, endpoint.
3. Wizard UX: provider pick, stage mapping, undo + history.
4. Hardening on a real export (owner supplies a Czech and an English one).

Phases 1–3 ship together as the feature; phase 4 is a follow-up that only adds aliases
and a fixture.
