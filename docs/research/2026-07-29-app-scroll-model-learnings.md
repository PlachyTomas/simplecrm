# App scroll model — what two failed attempts established

Written 2026-07-29 after two attempts at "get rid of the full page scrolls" were
both reverted. This is the handover for attempt three: what the goal is, what is
already fixed and should NOT be redone, what actually broke, and what to find out
before writing any code.

## The goal (owner's words)

> "I dont like that the whole page scrolls when content expands (example — Firmy →
> detail firmy → aktivity/kontakty atp. Měly by scrollovat jen ty kontakty."

> "contact detail page scrolls a bit even though its full of empty space — check
> the whole app and get rid of the full page scrolls"

So: page chrome (sidebar, top bar, page title, filters, tabs) should stay put, and
scrolling should happen in the region that owns the data.

## Current state of main

The shell is **unchanged from its original design**: the window is the scroll
container, `min-h-screen` on the shell, sticky sidebar and top bar. Both attempts
at changing that are reverted.

What survived and is on main — do not redo these:

| Fix | Commit | Notes |
|---|---|---|
| Calendar month grid scrolls instead of clipping its last week | `fd0bb29` | Pre-existing bug, unrelated to the shell |
| Contacts is a fluid route and fills its region | `2dc895c` | Killed the `h-[calc(100vh-4rem)]` guess |
| Mobile pipeline board scrolls its deal list | `2dc895c` | Was clipping ~1185px unreachable |
| Shell root is `relative` | `2dc895c` | Stops `sr-only` escaping `overflow-hidden` |
| External links open in a new tab | `38fb028` | `lib/externalLink.ts` |
| Firmy sorts by Obor | `fd45adf` | |

Reverted: `962d517` (attempt 1, reverted by `3783f27`), `4016628` (attempt 2,
reverted by `dab2936`).

## Attempt 1 — reverted for the wrong reason

Viewport-locked shell (`h-dvh overflow-hidden`), `main` as the scroll container,
per-page conversions of company detail, the two list pages, dashboard and reports.

Owner reported: "the calendar page doesnt display the full calendar (and cannot
scroll there)."

**The calendar bug was pre-existing.** Checking out `fa6e43b` (before any of this
work) reproduced the clipping identically. The calendar has been a fluid
full-height route since it shipped; its day cells carry a min-height, so once six
week rows don't fit, `auto-rows-fr` can't shrink them and the last week fell off a
page with no scroll of its own. The shell lock only made it *visible* by removing
the window scrollbar that had been masking it.

It is fixed independently in `fd0bb29`. **The revert of attempt 1 was therefore
not necessary** — but by the time that was established the owner had reverted, and
re-landing it is what became attempt 2.

## Attempt 2 — reverted, cause still unknown

Same change, re-landed once the calendar was fixed, plus a verification pass
written specifically for the failure mode attempt 1 missed (see below).

Owner reported: **"u broke the whole ui (cant see log out for example)"**.

**I could not reproduce this.** With the shell locked, at 1440×560 and with the
shell root forced down to 500/440/400/360px, the sidebar logout button and the
theme toggle both stayed on screen, and the nav group above them scrolled as
designed. So the mechanism is unexplained.

Plausible causes not yet ruled out — **check these first next time**:

1. **Browser zoom.** The owner may not be at 100%. Zoom shrinks the CSS viewport,
   and the sidebar's fixed-height children (logo, nav items, footer group) don't
   shrink with it. This is the most likely candidate and the easiest to test.
2. **A shorter real viewport than any tested** — external monitor scaling, browser
   with bookmarks bar + dev tools docked.
3. **`h-dvh` on a desktop browser that reports a different dvh than vh.**
4. **A stale hot-reload state** — the app was mid-HMR when they looked.
5. **Trial banner mounted**, eating ~40px above the shell on their org but not on
   the demo org used for verification.

## What each attempt got right, mechanically

These are established facts, verified in the browser. Reuse them.

- **`h-dvh`, not `h-screen`.** On mobile, 100vh includes the collapsible URL bar
  and pushes the tab bar off-screen.
- **The shell root needs `relative`.** Tailwind's `sr-only` is
  `position: absolute`. With no positioned ancestor it resolves against the
  viewport, escapes the shell's `overflow-hidden`, and produces a stray window
  scrollbar — 61px from a hidden radio on the feedback form, 1047px on the mobile
  kanban. Already on main via `2dc895c`.
- **The content wrapper needs a *definite* height (`h-full`), not `min-h-full`.**
  With `min-h-full` the column just grows to fit its content and `main` scrolls;
  `flex-1` children never feel any pressure to shrink, so inner regions never take
  over the scrolling. This was the single thing that made "only the contacts
  scroll" work.
- **Bottom padding for the mobile tab bar belongs on the scroll container**
  (`main`), not on the wrapper inside it — otherwise on a long page the padding
  sits at the wrapper's bottom edge while content overflows past it.
- **Every flex child that is chrome needs `shrink-0`.** Without it flexbox
  squashes toolbars to nothing once a sibling becomes the flexible one — the
  mobile pipeline stage switcher collapsed to 4px tall this way.
- **A `<thead>` that stays put while the body scrolls needs an opaque fill**
  (`sticky top-0 z-10 bg-surface`), or rows show through it.

## The verification that is still not sufficient

Attempt 1 was checked for **window overflow only** — `scrollHeight > clientHeight`
on the document. That passed everywhere, and the calendar was still broken,
because its content was *clipped* rather than overflowing.

Attempt 2 added a real checker: for each route, walk `main` and find any element
whose box extends past the viewport with **no scrollable ancestor** between it and
the root — content the user physically cannot reach. It reported zero across all
twelve routes at 1280×620, 1280×560 and 390×844.

**It still missed whatever the owner saw**, and the most likely reason is a gap in
coverage rather than in method:

- it only walked `main`, so **the sidebar and top bar were never checked** — and
  the sidebar is exactly what the owner reported broken;
- it only ran at three viewport sizes and **never at a non-100% zoom**;
- it ran against the demo org, which has **no trial banner**.

Attempt three should extend it to the whole shell, run it at several zoom levels,
and run it against an org that shows the trial banner. Better still: **get the
owner's viewport size and zoom level before starting**, and reproduce their exact
report first.

## Process lessons

- **Ask which page the complaint is about before reverting anything.** Attempt 1
  was reverted app-wide over a bug on one route that turned out to predate the
  change entirely. One question would have saved both attempts.
- **A pre-existing bug that a change merely *reveals* is not a regression** — but
  it will be reported as one, so establish provenance immediately (`git checkout
  <base> -- <files>` and re-measure) and say so.
- **Stage the files you actually changed for that commit.** Attempt 2 bundled the
  external-link and Obor-sort edits into the shell commit because all three
  changes were in the working tree when the shell commit was staged; the revert
  then took the unrelated features out with it.
- **Land a broad layout change in slices.** Both attempts changed the shell *and*
  six pages in one commit, so the only available response to "this is broken" was
  to revert all of it. Shell first, verified alone, then one page per commit.
