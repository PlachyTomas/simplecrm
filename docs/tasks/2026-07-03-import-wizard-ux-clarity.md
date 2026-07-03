# 2026-07-03 — Import wizard: make contact↔company linking legible

> Source: Tomáš (conversation 2026-07-03), after watching an operator
> spend ~15 failed attempts trying to attach a CSV of contacts to
> companies that were **already imported** in a previous run. The field
> mapping worked; the *linking* model did not, and the UI gave no signal
> about why. This task is about discoverability (info icons, inline
> examples, better defaults) — not a rewrite. Builds on
> `2026-05-20-import-wizard-v2.md`.
>
> Files: `frontend/src/app/settings/import/ImportPage.tsx` and the
> mapping components under `frontend/src/app/settings/import/`; matcher
> behavior in `backend/app/services/imports/matcher.py` +
> `backend/app/api/v1/imports.py`.

## The confusion, concretely

1. **"Sloupec pro propojení s firmou" vs "Klíč pro spárování kontaktů s
   firmou" read as the same thing.** Neither the operator nor an
   experienced agent could tell them apart. They are two halves of one
   idea, split into two far-apart UI groups with no example:
   - *Sloupec pro propojení* = which **column in the contact file**
     holds the company reference (e.g. `ICO`).
   - *Typ klíče* = **what that value is matched against** (IČO / name /
     e-mail), and — critically — that a company file **in the same
     batch** must map that same field.
   → Add an info (ⓘ) tooltip to each, and a one-line worked example
   under the pair: *"Contact column `ICO` (46995129) → matched against
   each company's IČO."*

2. **Contacts only match companies uploaded in the *same batch*, never
   the existing DB — but nothing says so.** Attaching contacts to
   already-imported companies is a dead end today:
   - Contacts-only file → "Spustit náhled" stays **disabled** (guard
     wants a company column mapped to the key) with no explanation of
     what's missing.
   - Add the real companies back into the batch → every contact errors
     with `Key '…' matched multiple companies (<name>, existing company
     <uuid>)` because the batch row and the existing DB row both match.
     Summary shows `Firmy — nové: 0, aktualizace: 0`, which makes the
     double-match look like a no-op.
   - A header-only company file (to satisfy the guard without adding
     rows) → **400 "CSV has a header row but no data rows."**
   → Two fixes, pick one: (a) **de-dupe** a batch company against the
   existing DB company by the match key so it counts as **one** match,
   or (b) add a first-class **"attach to existing companies"** toggle
   that matches contacts against the DB with no company file required.
   Either way, when a contact can't be linked, say *why* and *how to
   fix it* inline.

3. **`ICO → — Ignorovat —` in the contact mapping looks like a mistake.**
   The IČO column is not a contact field, so it shows "Ignorovat" while
   actually being used below as the link key. Operators read this as
   "you forgot to map IČO." → When a column is selected as the
   *Sloupec pro propojení*, badge it in the mapping table (e.g.
   "používá se pro propojení") instead of the bare "Ignorovat".

4. **Combined mode ("Firmy + kontakty") auto-maps shared columns to both
   sides.** A single `Email`/`Telefon` column gets mapped to the company
   **and** the contact automatically, silently overwriting the
   company's own e-mail/phone with the contact's. → Default
   contact-only columns (name, position) to the contact side and leave
   `Email`/`Telefon` on the company side as **Ignorovat** unless the
   operator opts in; or show a "this will overwrite company X" warning.

5. **The 5-imports/hour rate limit (`imports.py:62`,
   `max_calls=5, window_seconds=3600`) counts *previews*.** Iterating on
   mapping — which is exactly when you lean on the non-destructive
   preview — burns the budget in minutes, then hands back
   `429 "wait a few minutes"` that's actually up to an hour. → Either
   don't rate-limit preview as hard as commit (separate buckets), raise
   the preview budget, or surface the real reset time in the message.

## Claude's own note

The single highest-leverage change is #1 + #2: the link column and match
key are one concept shown as two, and the batch-vs-DB matching rule is
invisible. An ⓘ tooltip and a live "row 2: contact `ICO` 46995129 →
Bosch Powertrain s.r.o." preview beside the key selector would have
prevented essentially every wrong turn in this session.

## Out of scope

- Splitting a single "full name" column into first/last automatically
  (operators still pre-split). Worth a separate small task — the app
  requires Jméno + Příjmení but most real CSVs carry one name column
  with titles (`Ing.`, `Mgr.`).
