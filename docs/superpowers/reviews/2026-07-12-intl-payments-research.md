# International payments for SimpleCRM — research (PARTIAL)

Date: 2026-07-12
Status: **PARTIAL — verification infrastructure failed mid-run (network outage, then
session token limit).** ComGate capability claims are adversarially verified (3-0 votes
each). Stripe pricing claims were extracted from primary sources but NOT verified.
Paddle/merchant-of-record and the EU OSS compliance baseline were never researched.
No recommendation yet — do not treat this as the decision document.

Spec: `docs/superpowers/specs/2026-07-12-i18n-and-payments-prep-design.md` (Part 2).

## Verified findings (3-0 adversarial votes, primary sources)

**ComGate can handle international payments better than assumed:**

1. **9 currencies supported:** CZK, EUR, PLN, HUF, USD, GBP, RON, NOK, SEK.
   (help.comgate.cz/docs/meny-a-jazyky, apidoc.comgate.cz/en/metody-platebni-brany/,
   comgate.eu/online-payments — three sources agree.)
2. **Foreign currency activation is manual:** email request to ComGate support with
   company name, IČ, currency, and a bank statement of an account able to receive that
   currency — i.e. SimpleCRM needs a EUR-capable bank account for EUR settlement.
3. **Recurring + tokenized card payments are a documented gateway feature** (recurring,
   pre-authorization, card-on-file), incl. for subscriptions.
4. **Foreign-issued cards are accepted regardless of country** — ComGate holds its own
   VISA/Mastercard acquiring license (Principal member); cross-currency conversion is
   done by the cardholder's issuing bank at its rate (cardholder bears FX).
5. **Settlement is same-currency:** EUR payments pay out to your EUR account, CZK to CZK
   — no forced FX on settlement.

**Refuted (1-2 vote, treat as unclear):** the claim that ComGate's headline card fees
(0.6% Easy / 0.47% + 1 CZK Profi) apply only to "the 95% most common card types" with
foreign cards priced worse — verifiers could not confirm the interpretation. Foreign-card
fee terms remain an open question for ComGate sales.

## Extracted but UNVERIFIED claims (primary sources, single fetch, no vote)

Stripe (stripe.com/en-cz/pricing, …/local-payment-methods):
- EEA standard cards: 1.5% + 6.50 Kč; premium EEA 1.9% + 6.50 Kč.
- UK cards 2.5% + 6.50 Kč; non-EEA 3.25% + 6.50 Kč; +2% if currency conversion needed.
- Stripe Billing (pay-as-you-go): +0.7% of billing volume; enterprise alternative
  15 500 Kč/mo (oversized for solo founder).
- Stripe Tax Basic: 0.5%/transaction (no-code) or 10 Kč/transaction (API) where
  registered to collect.
- SEPA Direct Debit (CZ account): 9 Kč per charge; 360 Kč per dispute; 85 Kč per failed
  payment.

ComGate (help.comgate.cz, comgate.eu, upgates.cz srovnani-platebnich-bran-2026):
- Checkout available in 26 languages.
- Payouts free to CZ/SK accounts; SEPA EUR payouts free across EU/EEA.
- Czech-merchant fees ~0.62–0.98% + 0–0.7 Kč/txn + 0–100 Kč/mo (comparison article).
- Fast bank-transfer buttons cover CZ/PL/SK banks only — no pan-EU local methods
  (no SEPA DD, iDEAL, Bancontact) → cards are the only ComGate path for most of the EU.

## Not researched yet (gaps)

- **Paddle / Lemon Squeezy (merchant of record):** fees vs self-managed VAT, how MoR
  invoicing composes with in-house Czech tax invoices for CZ customers, B2B
  reverse-charge handling, solo-founder fit.
- **EU OSS compliance baseline:** when OSS registration becomes mandatory for B2C SaaS,
  B2B reverse charge + VIES mechanics, UK/US exposure.
- **Coexistence patterns** (ComGate for CZ + Stripe for intl) and migration effort.
- Fee table synthesis + recommendation.

## Preliminary read (orchestrator judgment, NOT verified)

The verified ComGate findings weaken the case for adding Stripe *just for EUR cards*:
ComGate already does EUR pricing, foreign cards, recurring tokens, and free EUR SEPA
payout. The open deciders are (a) foreign-card fees on ComGate vs Stripe's published
ladder, (b) VAT/OSS automation (Stripe Tax or MoR vs manual OSS in in-house invoicing),
(c) non-card EU payment methods (Stripe has SEPA DD; ComGate doesn't).

## How to finish this cheaply (per budget-optimal-ultracode)

ONE agent (opus, schema-forced return, max ~15 findings): verify the Stripe pricing
claims above via stripe.com, fill the Paddle + OSS gaps via 6–8 targeted fetches, and
return a fee table + recommendation draft for the orchestrator to synthesize into this
file. Estimated 30–60k tokens. Do NOT re-run the deep-research workflow.
