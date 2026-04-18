# Task 4.2 — TanStack Table list + tabbed detail

## Goal
Upgrade the companies list page from a plain `<table>` to TanStack Table v8
with debounced server-side search, page navigation, and sortable columns.
Upgrade the detail page with tabs (Přehled / Kontakty / Obchody / Aktivita /
Poznámky) so Phase 4.3+ tabs can plug in without another rewrite.

## Non-goals
- Real content for Kontakty / Obchody / Aktivita tabs — placeholders.
- Multi-column server-side sort (client-side sort for the current page only
  in this task; backend sort param arrives later if needed).

## Acceptance criteria
1. Search input debounced 300 ms; fires with `?search=`; empty state shows
   "Žádná firma tomu neodpovídá" message when nothing matches.
2. Pagination controls (Previous / Next) appear only when `total > PAGE_SIZE`.
3. Column sort toggles ascending/descending on `Název` and `Založeno` (IČO
   and Město not sortable).
4. Detail page has 5 tabs with `role="tab"`, default shows Přehled.
5. Backend `?search=` query param filters by name or IČO (case-insensitive).
6. 21 frontend tests pass; 127 backend tests; lint/typecheck/format/build clean.
7. One commit.
