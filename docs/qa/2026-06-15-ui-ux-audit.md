# SimpleCRM — UI/UX audit (HD + mobile)

Date: 2026-06-15
Reviewer: Claude (frontend-design lens)
Method: logged in as the demo admin (`eva@demo.cz`), walked the app at **HD 1440×900**
and **mobile 390×844** via Playwright. Focus areas requested by owner: the
lead-capture critical path, Settings complexity, and the email-confirmation
requirement.

Verdict up front: the app is visually clean and coherent (good token system, calm
palette, solid KPI/dashboard and pipeline layouts). The problems are **information
architecture and flow friction**, not styling. The two that matter most are the
**add-lead critical path** (can't capture a person, loses typed input) and **Settings**
(11 flat tabs). Email confirmation is a non-issue we were nagging about — already
actioned (see §3).

---

## 1. Critical path — adding a new lead (HIGHEST PRIORITY)

**Goal (owner):** capturing a new lead should be fast, blocked by nothing, and should
create the company *and* the contact person when those are filled in.

**Today** (`AddDealModal`, opened from Pipeline "+ Přidat obchod" / mobile FAB):
fields are *Název obchodu\** (deal name), *Firma\** (company), Hodnota, Očekávané
uzavření, Vlastník, *Fáze\**. A company can be created inline; an *existing* contact
can be attached only after a company is chosen.

### Findings

1. **No way to capture the contact person.** There is no name/email/phone field for a
   person anywhere in the flow. For a brand-new company you cannot record *who* the
   lead is — the single most important thing about a lead. This directly misses the
   owner's requirement ("create … contact person if filled in"). *(blocker-class gap)*
2. **Typed company name is dropped.** Type a new name in *Firma*, click
   "Vytvořit přes IČO" → the inline panel's *Název firmy* is **empty**; the name must
   be retyped. Pure friction + feels broken.
3. **Inline-create is framed IČO-first.** The only affordance is "Vytvořit **přes IČO**",
   and the panel leads with the IČO field. Manual name *is* allowed ("Doplní se z ARES,
   nebo zadejte ručně") but the framing pushes users toward needing an IČO they may not
   have yet for a fresh lead.
4. **Two hard-required fields to log a lead:** deal name **and** company. A salesperson
   who just got a business card has to invent a deal name before anything saves.
5. **Date input shows `mm/dd/yyyy`** (US order) in a Czech product — i18n inconsistency
   (the native control is locale-driven, but the displayed placeholder is US).
6. **Possible wrong default stage from the mobile FAB.** Opening via the FAB landed the
   *Fáze* select on **"Vyhráno"** (the Won stage) rather than the first open stage.
   Needs verification — a new lead must never default into Won. *(verify)*

### Brainstormed solutions

- **A. Add an optional inline "Kontaktní osoba" block to `AddDealModal` (recommended).**
  One row — jméno, e-mail, telefon — collapsed by default ("+ Přidat kontakt"). On
  submit, after the company is resolved/created, POST a contact with `company_id` and
  set it as the deal's `primary_contact_id`. Backend already has `POST /contacts`; this
  is purely additive. Solves #1 with the least new surface.
- **B. Carry the typed name into the inline-create panel** (fixes #2): seed
  `newCompany.name` from the combobox query when "Vytvořit přes IČO" is clicked, and
  relabel the affordance to "**Vytvořit firmu** «{typed name}»" so name-first is the
  obvious path and IČO is the optional enrichment (fixes #3).
- **C. Default the deal name** to the company name (or "Nový obchod – {firma}") so the
  only thing a user *must* type is the company/person (relaxes #4 without removing the
  field). Keep deal-name editable.
- **D. A dedicated "+ Lead" quick-add** (lighter than a deal): name + company + person,
  everything else deferred. Bigger change; revisit if A–C don't feel fast enough.
- **E.** Localize the date field (fixes #5) and audit the FAB's `initialStageId` to pin
  the first `open` stage (fixes #6).

**Recommendation:** ship **A + B + C + E** as one focused "fast lead capture" change.
That makes the existing modal do what the owner wants without a new screen. (D held in
reserve.) This is a feature-sized change — propose to brainstorm/spec it next.

---

## 2. Settings — 11 flat tabs (HIGH PRIORITY — the owner's hint)

**Today:** a single horizontal tab row with **eleven** tabs: Pipeline, Týmy, Uživatelé,
Pozvánky, Vzhled, Oprávnění, Blokovaná IČO, Organizace, Fakturace, Integrace, Soukromí.

### Findings

1. **No grouping; mixed audiences.** Personal settings (Vzhled, Integrace = the user's
   own SMTP + Google), org-admin settings (Týmy, Uživatelé, Pozvánky, Oprávnění,
   Organizace, Blokovaná IČO), billing (Fakturace), and data/compliance (Soukromí,
   CSV import) all sit in one undifferentiated strip. Users can't form a mental model.
2. **Desktop:** 11 tabs *just* fit on one line at 1440px and will collide on smaller
   laptops / when labels get longer.
3. **Mobile:** the row becomes a **horizontal-scroll strip** showing ~4 tabs with a
   scrollbar — the other 7 are invisible with no affordance hinting they exist. Bad
   discoverability.
4. **Orphan action:** "Hromadný import z CSV →" renders under the page subtitle on
   *every* tab regardless of context.
5. **Growth:** this only gets worse — the recent SMTP card already had to be squeezed
   into "Integrace".

### Brainstormed solutions

- **A. Group into 3–4 sections with a left sub-nav on desktop (recommended).**
  Suggested grouping:
  - **Účet (osobní):** Vzhled, Integrace (SMTP + Google)
  - **Organizace:** Organizace, Týmy, Uživatelé, Pozvánky, Oprávnění
  - **Data & pravidla:** Blokovaná IČO, Import z CSV, Soukromí
  - **Předplatné:** Fakturace
  Desktop = vertical grouped sub-nav (sidebar-in-page); mobile = a grouped **list →
  drill-in** (tap a group → see its settings → back), which is the native mobile
  settings pattern and kills the horizontal scroll.
- **B. Lighter touch:** keep tabs but split into a 2-row grouped tab bar with section
  labels; mobile becomes a grouped accordion. Less work, less clean than A.
- **C.** Route the CSV-import link into the "Data & pravidla" group instead of the global
  subtitle (fixes #4).
- **D.** Gate personal vs admin sections by role so salespeople see a short list (most of
  these are admin-only anyway), which shrinks the surface for the majority of users.

**Recommendation:** **A** (grouped sub-nav desktop / drill-in mobile) + **D** (role
filtering). This is the durable fix as settings keep growing.

---

## 3. Email confirmation — why do we require it? (ACTIONED)

**Question:** why do we require email confirmation, and is the nag worth it?

**Investigation:**
- `email_verified` is **never used as a gate** anywhere in the backend — grep of
  `app/` shows it's only *set* during signup/verify flows; no endpoint or dependency
  returns 403/blocks on it.
- The frontend `UnverifiedEmailBanner` literally documents itself as a
  *"Non-blocking nudge"*, mounted persistently on every in-app screen (`AppShell`) and
  on the org-creation wizard (`CreateOrgPage`).

**Conclusion:** we don't actually *require* it for anything. Verification is a
deliverability/hygiene signal (real address, fewer bounces, password-reset target) —
legitimately *nice to have*, but for a self-serve SaaS a **persistent app-wide nag** is
friction with zero functional payoff. The address is already captured at signup, and
nothing depends on the verified flag.

**Action taken (this session):** removed the persistent `UnverifiedEmailBanner` from
`AppShell` and `CreateOrgPage` and deleted the component. **Kept** everything that makes
verification still *possible and encouraged at the right moment*: the signup
confirmation screen still says "we emailed you a link" and offers resend
(`resendVerification` is still used there), the `/verify-email` token flow is untouched,
and password reset is unaffected. Net: verification stays available, the nagging stops.
Frontend lint/typecheck/tests (127) + build all pass.

> If we later want a *gentle* re-prompt, do it as a one-time dismissible toast after
> first login — not a permanent banner.

---

## 4. Other findings (medium / low)

- **Trial banner is a second persistent nag.** A full-width "Zkušební verze končí za N
  dnů" bar sits above the header on every screen; on mobile it truncates to
  "Zkušební verze končí …" and still eats a row. Consider folding it into the existing
  header trial-badge (already present) and showing the full-width bar only in the last
  ~3 days. *(medium)*
- **Mobile pipeline** uses a vertical list of stages, each with its **own horizontal
  card scroller**. It works, but two scroll axes per screen is easy to miss; consider a
  stage-switcher (chips/segmented control) that shows one stage's cards vertically.
  *(low–medium)*
- **Per-card "Vyhráno / Neúspěch" buttons** show permanently on mobile (no hover),
  adding visual noise to every card. Consider a swipe or overflow-menu action. *(low)*
- **Consistency:** good. Tokens, spacing, accent usage, empty states, and the new
  SMTP/bulk-email surfaces all match the established language. No styling regressions
  found.

---

## 5. Prioritized backlog

| # | Item | Priority | Size | Notes |
|---|------|----------|------|-------|
| 1 | Add-lead: inline contact capture (§1A) + carry typed name (§1B) + default deal name (§1C) | **P0** | M | core ask; one focused change |
| 2 | Add-lead: verify FAB default stage isn't "Won" (§1.6) | **P0** | S | data-correctness bug if real |
| 3 | Settings IA: grouped sub-nav / mobile drill-in (§2A) + role filtering (§2D) | **P1** | M–L | durable fix as settings grow |
| 4 | Email nag removal (§3) | **P1** | — | ✅ done this session |
| 5 | Localize date input to cs (§1E) | **P2** | S | i18n polish |
| 6 | Trial banner → header badge except final days (§4) | **P2** | S | de-nag |
| 7 | Mobile pipeline scroll model (§4) | **P3** | M | UX refinement |

**Done now:** #4. **Recommend next:** #1 + #2 as a small "fast lead capture" spec, then
#3. Happy to brainstorm/spec #1 on request.
