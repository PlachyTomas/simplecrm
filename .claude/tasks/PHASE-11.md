# Phase 11 — Landing page

Replaces `LandingStub` with `LandingPage`. Single-file marketing page
with: sticky nav + mobile hamburger-less layout, hero with gradient-glow
backdrop + mock Kanban screenshot, 3-card differentiators, three-step
how-it-works, side-by-side pricing tiers (free trial + 99 Kč tier),
accordion FAQ (6 entries), and footer.

All Czech copy, vykání throughout. Money formatting hardcoded at
`99 Kč/uživatel/měsíc` on the pricing block per brief (pricing page
intentionally single-currency for MVP); date formatting unused on the
landing page so `Intl` hook-in is trivial once i18n lands.

SEO basics:
- Updated `<title>` and `description` meta tags.
- OpenGraph tags for social sharing.
- `public/robots.txt` + `public/sitemap.xml` (Vite copies them to `dist/`).
- theme-color meta for mobile URL bar colour.

Deferred:
- Lighthouse ≥ 90 validation needs a real browser; covered manually on
  deploy.
- Feature-tour section with screenshots deferred until we have real
  screenshot fixtures.
