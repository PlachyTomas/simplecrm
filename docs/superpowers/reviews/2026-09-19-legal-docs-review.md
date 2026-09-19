# Legal documents review — 2026-09-19

Adversarial, source-grounded review of every legal document SimpleCRM displays, plus the legal-adjacent UI copy. Goal: enforceable and consistent documents that claim only what is verified in production.

## Scope

- Pages (Czech only, hardcoded JSX under `frontend/src/marketing/legal/`): VOP, Reklamační podmínky, Dodací a platební podmínky, Zásady ochrany osobních údajů, Zpracovatelská smlouva (DPA), Cookies, Předplatné a platby, Kontakt.
- Adjacent copy: landing hero/pricing/FAQ, cookie banner, order consent, Card-on-File consent, billing cancel copy, settings privacy copy, invoice notice, transactional e-mails.
- Out: the unmerged competitor-comparison branch.
- Assumption: Czech B2B customers.

## Method

1. Corpus: pages rendered to text via a throwaway vitest dump (scratchpad `legal-review/corpus/01–09`).
2. Claims inventory (Sonnet): every factual claim → verified-code / verified-ops-doc / owner-to-confirm / contradicted; undisclosed processing activities; owner checklist.
3. Sources pack (orchestrator, DirectCase): one batch call each of law / case-law / regulatory search; follow-up paragraph lookups per citation.
4. Attack (Opus ×6, one persona each): customer plaintiff · consumer-in-disguise · data subject/ÚOOÚ · regulator+Comgate/card schemes · competitor · consistency auditor. Max 12 attacks each, every attack cites act+§ and proposes wording.
5. Refute (Opus ×3, two personas each): refute with citations, rate enforceability and exposure.
6. Verify + synthesize + rewrite (orchestrator): every citation checked against e-Sbírka; P0–P3 below; rewrites as uncommitted diffs.

Rule for every rewrite: vague where the law allows, precise where it demands, never future tense, no claim that is not verified in production.

## Status log

- 2026-09-19 00:40 — corpus dumped (8 pages, 4,668 words) + adjacent copy. DirectCase connector down (upstream sign-in unavailable); single-shot searches not yet spent. Claims inventory dispatched.
- 2026-09-19 01:10 — claims inventory done (47 claims: 24 verified-code, 2 verified-ops-doc, 11 owner-to-confirm, 10 contradicted; 11 undisclosed processing activities). Six persona briefs + refuter brief written (scratchpad `legal-review/briefs/`). DirectCase connector now requires re-authentication by the owner; sources pack still unbuilt. Paused for the owner checklist + phase-2 go.
- 2026-09-19 — owner answered items 3, 8, 10 (see checklist); other items take the bracketed defaults.
- 2026-09-19 — owner re-authenticated DirectCase. Single-shot searches spent: law (thin, 4 docs + summaries), case law (first call timed out empty; a narrower retry returned NS 28 Cdo 1551/2025, ÚS II. ÚS 1176/21, ÚS I. ÚS 3512/11, NS 23 Cdo 3024/2021 and more), regulatory (ÚOOÚ summaries). 36 provisions pulled verbatim from e-Sbírka. Sources pack: scratchpad `legal-review/sources/pack.md`. Comgate facts verified from comgate.eu (X1–X4 in the claims inventory). Launching attack/refute.
- 2026-09-19 — run wf_969659a5-79d done (9 agents, 1.63M subagent tokens, 37 min). Findings verified and written below. Rewrites applied to 16 files (uncommitted): 7 legal pages, legal-entity.ts, cs/en marketing, billing, common, settings catalogs. Checks: i18n parity OK, tsc OK, eslint OK, legalPlaceholders + App tests pass (17), pages render in the browser with no console errors of their own (only backend-refresh connection errors with the backend down). Completion self-review: T0 (copy-only diff), read in full by the orchestrator; two sentences tightened (VOP 6.2 change-notice bullet, DPA 4.8 retention tail).
- 2026-09-19 — F1 product change implemented (see decision 1). Backend: 79 affected tests + 2 new pass, mypy OK, migration applied to dev DB; frontend: types regenerated + parity OK, tsc/eslint/prettier/i18n OK, 19 tests incl. 2 new for the checkbox gate. Owner verifies the UI. Completion-review tier for this diff is T2 by the migration rule; orchestrator read the full diff, fan-out offered to the owner.

## Owner decisions still open

1. ~~Ship the F1 acceptance record~~ DONE 2026-09-19 for new organisations (uncommitted): declaration checkbox on the org-creation step, `business_declaration: Literal[True]` on `POST /onboarding/organization` (422 without it), `organizations.terms_accepted_at/terms_version/terms_accepted_by_user_id` stamped server-side (migration d7e8f9a0b1c2, `TERMS_VERSION` in `app/core/legal.py` mirrors `LEGAL_EFFECTIVE_DATE`), shown in Nastavení → Soukromí; VOP 1.3/3.1/3.2 and DPA čl. 11 now describe it. Follow-up: existing organisations have no record — blocking dialog for admins at next login.
2. F5: purge job vs. the truthful wording now applied; contacts/companies CSV export outside the pay-gate.
3. F8: OWNER ACCEPTED THE RISK 2026-09-19 — no default footer, no unsubscribe link. Reassessed after discussion: the sender (customer) carries the § 7 zák. 480/2004 Sb. duties, a reply address counts as a valid refusal address and the blocked-companies list is a manual suppression mechanism, so the provider's own exposure is P2 (contractual/reputational), not P1. DPA čl. 10 allocates the duty to the customer. Do not re-raise unless campaign volumes reach Gmail/Yahoo bulk-sender thresholds.
4. F7: persist recurring-payment consent; pre-charge e-mail for annual plans.
5. F4: confirm Google Cloud DPA / Cloudflare DPA (SCC) are in place before publishing the transfer sentence; self-host the two fonts to drop Google Fonts.
6. F3: relabel „Soukromá osoba" in the billing form.
7. F14: keep or drop the 99,5 % SLA figure.
8. F21: confirm the Comgate contact (platby-podpora@comgate.cz, +420 288 288 700) against the merchant contract.
9. F23: name search for „SimpleCRM".
10. Have a Czech advokát read VOP 4a, 10.4, 13.2 and DPA §4/§6/§8 before publishing — these are the clauses with real litigation exposure.

## Owner checklist

Facts only the owner can confirm. Default applied if unanswered is in brackets.

1. Backup job (`scripts/backup_postgres.sh`) scheduled in Coolify/cron and verified? [no → drop "denní zálohy" from privacy §5, DPA 4c and the Hetzner line]
2. Disk/volume encryption at rest on the production server? [no → drop the at-rest sentence entirely]
3. Hetzner region — owner confirmed NUREMBERG (nbg1) on 2026-09-19 → FAQ "Hetzner, Frankfurt / Nuremberg" becomes "Hetzner, Norimberk (Německo)"; Hetzner has no Frankfurt region
4. Frontend on Cloudflare Pages, and Smart-BCC inbound mail via Cloudflare Email Routing, both live? [yes → Cloudflare joins the sub-processor list with an EU-processing/transfer note]
5. Any error monitoring (Sentry etc.) in production? [no]
6. Any newsletter or marketing e-mails sent outside the app? [no → privacy §2c shrinks to a one-line reservation]
7. Uptime measured anywhere (UptimeRobot)? [no → the 99,5 % SLA has no evidence behind it]
8. Support reply "do několika hodin" and phone 9–17 real? — owner: NO → soften to a non-binding statement
9. Manual processes in place for maintenance notices (48 h), price-change notices (30 d), breach notification, customer audits? [none documented]
10. Does an external accountant see customer billing data? — owner: not today, maybe later → keep "účetní" as a possible recipient in privacy §3 (controller data only; not a DPA sub-processor)
11. Trademark / name search for "SimpleCRM" done (ÚPV, EUIPO)? [no]
12. Which competitors were benchmarked for "Nejlevnější CRM na trhu"? [none documented]
13. `BillingSettings.is_vat_payer` is false in production? [yes]

Decisions the review will recommend (say now if you already have a preference): post-cancel retention (purge job vs. wording), signup acceptance + B2B gate, cookies page rewrite, sub-processor list, bulk-mail responsibility clause.


## Findings

Run wf_969659a5-79d (2026-09-19): 6 Opus attackers → 65 attacks; 3 Opus refuters → 65 verdicts + 15 missed items. Orchestrator verified every statutory citation against e-Sbírka (36 + 35 provisions fetched verbatim; all found). Case-law citations come from DirectCase summaries + snippets; NS 23 Cdo 3024/2021 could not be located by keyword search, so the "nejlevnější" findings rest on § 2977 and the ÚS snippets, not on that decision. Card-scheme rules (Visa/Mastercard) are own-knowledge, unverified.

Severity is the orchestrator's final call after the refuter pass. "Text" = rewrite applied in this working tree (uncommitted). "Product" = code change to decide on; no product change was implemented.

### P0

- **F1 — The contract-formation chain does not exist.** VOP 3.1 describes a form nobody fills, 3.2 names a confirming e-mail that is never sent (verification e-mail has no VOP reference), signup and org creation show no terms, no checkbox, no link; the only in-app terms link says „čl. 6 Obchodních podmínek". § 1751 odst. 1, § 1753 OZ; ÚS I. ÚS 3512/11 (burden of proving incorporation on the provider); § 1745 OZ. Everything else (cap, changes, licence, B2B declaration, DPA as Příloha č. 1) hangs on this. Attacks P1-01, P2-02, P3-04, P6-01. **Product:** one acceptance record at org creation: unticked checkbox „Potvrzuji, že jednám v rámci své podnikatelské činnosti (§ 420 OZ) a souhlasím s Obchodními podmínkami, Reklamačními podmínkami, Dodacími a platebními podmínkami a Zpracovatelskou smlouvou" with four links; block creation without it; store time, user id, document versions (no IP); show in Nastavení → Soukromí; confirmation e-mail with links; existing accounts get a blocking dialog at next login. Reuse the same record for the recurring-payment consent (F7). **Text:** VOP 3.1/3.2 rewritten to what happens today (account creation = conclusion; terms published at the URL); in-app consent label widened to the whole VOP; DPA gets an "Uzavření smlouvy" article only after the record ships (not applied).
- **F2 — Liability cap 10.4 is disregarded as written.** No carve-out for intent, gross negligence, natural rights or a weaker party; § 2898 OZ + NS 28 Cdo 1551/2025 (cap survives only if intent/gross negligence are unambiguously excluded). "Uživatel s tímto omezením výslovně souhlasí" is a false statement of fact. Attacks P1-02, P2-06. **Text:** applied (carve-out, entrepreneur-conditioned cap, stacking sentence, false sentence deleted).
- **F3 — The B2B framing is a fiction and the checkout has a „Soukromá osoba" path.** No IČO anywhere until plan choice (optional even then), Google sign-in with no business data, billing form validates a natural person on name + address and nulls IČO/DIČ (orgBillingForm.ts:72-76, org_billing.py:25-27). ÚS II. ÚS 1176/21 (status follows facts, not a form clause); finanční arbitr EvPe GROUP (no IČO field = offer aimed at consumers); § 1829 odst. 4 (a consumer never instructed may withdraw for a year + 14 days); § 14 ZOS (ADR information mandatory when a consumer is possible). Attacks P2-01, P1-08, P4-03, P2-03, P2-04. Realistic cohort is small (team CRM, per-seat pricing) but each case unwinds every payment. **Product:** business declaration inside the F1 record; relabel „Soukromá osoba" → „Fyzická osoba bez IČO" with helper „Tuto volbu použijte, pouze objednáváte-li Službu pro svou podnikatelskou činnost nebo samostatný výkon povolání."; IČO required for Czech buyers at plan choice. **Text:** VOP 1.3 rewritten without the false declaration; new 4a (consumer withdrawal instruction, 14 days, model form on request; no deemed-consent clause); new 13.4 ČOI ADR sentence.
- **F4 — Privacy policy recipients are incomplete and "mimo EU údaje nepředáváme" is false; DPA sub-processor list and data categories are incomplete.** Google (login, Calendar tokens/events, Fonts on every page load → visitor IP), Cloudflare (Email Routing receives full MIME for Smart BCC), stored user SMTP passwords, e-mail bodies + attachments as a data category. Čl. 13 odst. 1 písm. e), čl. 28 odst. 2/3/4, čl. 44/46 GDPR; ÚOOÚ UOOU-01025/20 (false/incomplete information is the aggravating pattern). Refuter correctly cut ARES (public register, not a recipient) and Google login/Calendar as sub-processors (independent controller at the user's request). Attacks P3-01, P3-02, P6-10 + missed items. **Text:** privacy §3 rewritten (recipients incl. Google, Cloudflare, accountant; Germany hosting; SCC statement conditioned — owner must confirm Google Cloud DPA / Cloudflare DPA are accepted before this ships); DPA §1/§3 categories widened (e-mail content, attachments, SMTP credentials, campaign recipients), §6 rewritten (Cloudflare added, Google paragraph, flow-down 6.2, objection consequence 6.3). **Product:** self-host Inter + JetBrains Mono (removes the Google Fonts transfer entirely).
- **F5 — Retention and deletion promises are false; export promise is narrower than advertised.** FAQ „po 30 dnech natvrdo smažeme" and DPA §8 describe an automatic clock that does not exist (only manual org erasure); privacy §2b promises 12-month log retention with no purge job and an IP address that is never stored; export outside the pay-gate exists only for deals (contacts gated, companies have no CSV at all). Čl. 5 odst. 1 písm. e), čl. 13 odst. 2 písm. a), čl. 28 odst. 3 písm. g) GDPR; § 2977 OZ for the FAQ. Attacks P3-06, P6-02, P5-A8, P6-06, P5-A7. **Text:** privacy §2b/§2c corrected; DPA §8 → effective until deletion, deletion on instruction or self-service; DPA 4f export limited to CSV of data held; FAQ a5/a6 and billing copy corrected (cs + en). **Product (owner decides):** either a daily post-termination purge job (clock from termination, 7-day warning e-mail) so the 30-day promise can return, or keep the truthful wording; move contacts CSV export and add companies CSV export outside PROTECTED_DEPS.
- **F6 — Advertising: „Nejlevnější CRM na trhu" badge and FAQ a3 naming Raynet and Pipedrive.** § 2977 (unsubstantiated superlative price claim; free-tier CRMs exist on the Czech market), § 2980 odst. 2 písm. c) (comparison must be objective and verifiable; „jednodušší" never is; NS 23 Cdo 2415/2012: all conditions must be met), § 2976 odst. 2 písm. g), § 2988 remedies incl. injunction. Live on the landing page in cs and en. Attacks P5-A1, P5-A2, P5-A3. **Text:** badge → „Jedna cena, všechny funkce"; q3/a3 rewritten without competitors or superlatives; a1 „Frankfurt" → Norimberk, „Splňujeme GDPR" → factual sentence; en mirrored. If a price comparison is wanted later: dated table on /cenik#srovnani first, claim second.

### P1

- **F7 — Recurring payments: consent exists only as a client-side checkbox; no pre-charge notice for annual plans; dunning undocumented.** InitialPaymentInitIn carries only plan_code; nothing persisted; renewal_draft_sweep drafts an invoice for the founder, not an e-mail to the customer; PAST_DUE_GRACE = 7 days and retries are in code but in no document. § 1751/§ 1753 OZ; card-scheme CoF rules (own-knowledge). Attacks P4-01, P4-04, P2-08 + missed. **Product:** persist recurring consent (time, text version, user) in the F1 record; send a pre-charge e-mail 7 days before annual charges and whenever the provider changes the price. **Text:** VOP 6.5 added describing failed-charge retries, 7-day grace and suspension (true today); pre-charge promise NOT added until the sender ships.
- **F8 — Bulk-mail tool has no unsubscribe mechanism; tracking pixel/click rewrite undisclosed and on by default.** No unsubscribe link, token or List-Unsubscribe header anywhere; tracking default=True on Organization. § 7 odst. 3 a odst. 4 písm. c), § 11 odst. 2 a 5 zák. 480/2004 Sb. (offence is the customer's as sender, fine up to 10 M Kč; provider exposure is contractual and reputational); § 89 odst. 3 ZEK for the pixel (obligation on the sender/controller). Attacks P3-09, P3-03. **Product:** per-recipient unsubscribe token + link in HTML and text + List-Unsubscribe(-Post) headers, suppression list on the contact, block sending without it; tracking default off with admin confirmation. **Text:** DPA new articles on e-mail tracking (9) and bulk mail (10.1–10.2 only; 10.3 waits for the feature); privacy §6 mentions tracking as processor activity; settings copy no longer says „podle Vašeho výkladu GDPR".
- **F9 — Unilateral-change clauses 5.4, 8.4, 13.2 state no scope.** § 1752 odst. 2 OZ disregards changes driven by the provider's own circumstances when no scope was agreed; 8.4 gives no termination right. Attacks P1-05, P2-07 + missed. **Text:** scope added to 5.4 and 13.2; 8.4 gets notice + termination right with pro-rata refund of the running period.
- **F10 — DPA §4 misses čl. 28 odst. 3 items and promises the wrong breach clock.** Missing: documented instructions, assistance with čl. 32–36 (DPIA), deletion of copies, information to demonstrate compliance, warning about unlawful instructions, sub-processor liability; „max. do 72 hodin" is the controller's deadline to the authority, not the processor's to the controller. Attack P3-05. **Text:** §4 rewritten (4.1–4.9), soft deadlines where nothing measures them.
- **F11 — Every document knows only Comgate; the product bills by invoice and bank transfer.** scheduler.py:463-467 „Until ComGate is wired, paying customers are billed via bank transfer … Founder marks it paid"; invoice carries IBAN/VS/QR; in-app copy „fakturu se splatností v den ukončení zkoušky"; Dodací 1.5 promises a refund if not activated within 24 h, which the manual flow cannot guarantee; Reklamační 4.2 refunds only „prostřednictvím platební brány Comgate". § 557, § 2389b odst. 1 a 3, § 2977 odst. 2 písm. c) OZ. Attacks P6-04 + missed. **Text:** Dodací 1.3/1.5/2.3, VOP 4.2/5.2, Reklamační 4.2 rewritten; no activation e-mail promised (none exists).
- **F12 — Security statement over-promises** (owner's own example): daily off-site backups unproven, at-rest encryption admitted absent. **Text:** privacy §5 and DPA 4.3 reduced to čl. 32 GDPR + verified measures (TLS, access control, org isolation, access logging); Hetzner line drops „denní zálohy".

### P2

- **F13 — Cookies page describes storage that does not exist** („session 1 hodina"; real: simplecrm_refresh 30 d, simplecrm_oauth_state 10 min; consent + theme in localStorage; theme written regardless of consent). § 89 odst. 3 ZEK. **Text:** table rewritten to reality; theme classified as user-requested storage. **Product (optional):** gate theme on consent or drop the „preferenční" category.
- **F14 — SLA 99,5 % with no measurement, no formula, no third-party carve-out** (owner: uptime not measured). Recommendation: replace the percentage with a defined „významná nedostupnost" threshold and the remedy path already in čl. 10; not applied — owner's call.
- **F15 — Termination semantics**: „zrušení účtu" (9.1) does not exist as a button (only irreversible erasure); provider termination 9.2 says nothing about prepaid periods; user termination 9.1 says nothing about non-refund; 8.2 suspension is unlimited. **Text:** 9.1/9.2 sentences added (matches code: paid-through-period, no refund on user termination; refund on provider termination); 8.2 limited to the necessary time with notice.
- **F16 — Price basis**: VOP 5.1 „za kalendářní měsíc" vs annual prepaid period; Předplatné page carries operative rules with no effective date or hierarchy. **Text:** 5.1 clarified; Předplatné page gets an effective date and a hierarchy sentence.
- **F17 — „Daňový doklad" from a non-VAT payer** (§ 28 ZDPH ties the term to plátce; the invoice template itself says „Faktura"). **Text:** replaced with „faktura" across VOP, Dodací, Reklamační, Předplatné and billing copy.
- **F18 — Legitimate interest not named** in privacy §2b/§2c (čl. 13 odst. 1 písm. d)). **Text:** named.
- **F19 — Reklamační self-imposed deadlines** („do 2 pracovních dnů") nobody measures. **Text:** softened to „bez zbytečného odkladu"; 30-day resolution kept.
- **F20 — Trial hint** in billing copy implies an invoice with a due date creates a debt after trial (contradicts VOP 4.2). **Text:** cs/en hint reworded: invoice is an offer; nothing is owed without payment.

### P3

- **F21 — Comgate contact block** publishes podpora@comgate.cz and +420 228 224 267; Comgate's contacts page lists platby-podpora@comgate.cz for payment support and +420 288 288 700; the mandated operator text lacks its final sentence. **Text:** updated in legal-entity.ts — owner to confirm against the Comgate merchant contract.
- **F22 — EN funnel → Czech-only legal documents** (§ 1811 odst. 1 only for consumers; for businesses a weakness, not a breach). Recommendation only.
- **F23 — Name search** for „SimpleCRM" (ÚPV, EUIPO, Google) never done. Owner action.
- **F24 — Feedback endpoint** receives screenshots with customer data into the support mailbox; impersonation instruction (DPA §5) could name purpose limits. Recommendation only.
- **F25 — Enterprise tariff** on /cenik vs FAQ a4 „zatím neuvedli". Recommendation only.

### Dropped after refutation
P1-09 (seat billing not in VOP — dispositive, no exposure), P4-09 (trial-end reminder as obchodní sdělení — transactional, refuted).
