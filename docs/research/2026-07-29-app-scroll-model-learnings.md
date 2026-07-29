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

I could not reproduce it at any viewport height. Then the owner sent a
screenshot, and it turned out **the shell lock had nothing to do with it**.

### The actual cause: the Chrome window extends behind the macOS Dock

Measured off the owner's screenshot (2938×1912 at 2× Retina → a 1469×956 CSS
screen):

| | CSS px from the top of the viewport |
|---|---|
| Sidebar logo | ~37 |
| "Nastavení" | ~735 |
| Last pixel the owner can actually see | ~760 |

The sidebar footer group (Nastavení / Zpětná vazba / Odhlásit se / theme toggle)
is 169px tall and is anchored to the **bottom** of the sidebar box, which is
`h-screen` — exactly `100vh`. If "Nastavení" starts at ~735 then the bottom of
that box is at ~735 + 169 ≈ **900**.

Rendering the same page locally at `innerHeight: 900` puts "Nastavení" at 715 and
the theme toggle's bottom at 884 — matching the screenshot.

So `window.innerHeight` on the owner's machine is **~900**, while only **~760** of
it is visible: the Chrome window is ~140px taller than the Dock-free area of the
screen, and its bottom strip sits behind the Dock. `100vh` is *correct* — the
window really is 900 tall — the last 140px of it just isn't lookable-at. And
because the sidebar is `sticky top-0 h-screen`, scrolling the page never moves it,
so the footer is permanently unreachable.

**This is true on main right now and was true before any of this work started.**
It is not a regression from either attempt; both attempts simply left it in place,
and the second one got blamed for it.

Confirm in five seconds: DevTools console → `window.innerHeight`. ~900 while you
can only see ~760 means the window is under the Dock.

No CSS can fix this on its own — the page cannot detect the Dock, and when the box
height equals the window height there is nothing to scroll. The real options are:

1. **Move logout (and the theme toggle) into the top-bar user menu.** The top bar
   is always visible and this is where most apps put it. This is the fix that
   makes the app resilient rather than depending on the last 140px of the window.
2. Stop anchoring the sidebar footer to the bottom — pack it directly under the
   nav items so it lives in the upper part of the window. Cheaper, but it changes
   the look on a normal full-height window.
3. Owner-side only: resize the Chrome window off the Dock, or set the Dock to
   auto-hide.

A scrollable nav group (tried and reverted here) does **not** help this case: the
sidebar content is 757px inside a 900px box, so nothing overflows and there is
nothing to scroll.

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
- it only ran at three viewport sizes, against the demo org, which has **no trial
  banner**;
- and fundamentally, it could not have caught the Dock problem at all: that
  content is *inside* the viewport as far as the DOM is concerned. Only a human
  looking at the screen can see it.

Attempt three should extend it to the whole shell and run it against an org that
shows the trial banner — but the more important lesson is the one below.

## Process lessons

- **Get a screenshot before doing anything.** The owner's screenshot solved in one
  minute what two rounds of reverting and measuring had not: the numbers in it
  identified a 900px window with 760px visible. Ask for one the moment a report
  can't be reproduced.
- **Ask which page the complaint is about before reverting anything.** Attempt 1
  was reverted app-wide over a bug on one route that turned out to predate the
  change entirely. One question would have saved both attempts.
- **"I broke it" is a hypothesis, not a fact.** Both reports turned out to be
  pre-existing problems that the change either revealed or merely coexisted with.
  Establish provenance *before* reverting, not after.
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
