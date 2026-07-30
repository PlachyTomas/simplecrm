# Email sync — competitor research (2026-07-30)

Researched for the "full email suite synced with the user's email provider" idea
(mail page + clickable emails on activity timelines). Facts below were gathered
by a web-research agent on 2026-07-30; items the sources could not confirm are
marked **unverified**. The pitch built on top of this lives in the conversation
that produced it; the durable facts are here.

## 1. How competitors do email sync

**Pipedrive**
- (a) Native OAuth to Gmail or Outlook for "Email Sync"; separate "Smart BCC" address for manual per-thread capture from any provider. [support.pipedrive.com/email-sync](https://support.pipedrive.com/en/article/email-sync)
- (b) Links synced threads to matching Persons by email address; sends from within Pipedrive. Whether it's whole-inbox vs matched-only isn't explicit in docs — unverified.
- (c) Three-level visibility per thread: **Shared** (visible on linked items), **Private** (only you), **Team only**; owner can change any individual email's visibility later. [support.pipedrive.com/email-privacy](https://support.pipedrive.com/en/article/email-privacy-and-sharing-emails-in-pipedrive), [how-can-i-view-or-adjust-email-visibility](https://support.pipedrive.com/en/article/how-can-i-view-or-adjust-email-visibility)
- (d) Email Sync gated to **Advanced plan and up** (1 mailbox); Enterprise allows up to 5 connected mailboxes. Smart BCC is available on **all plans**. [blog.skyvia.com](https://blog.skyvia.com/pipedrive-integration-with-gmail/), [support.pipedrive.com/smart-email-bcc](https://support.pipedrive.com/en/article/smart-email-bcc)

**HubSpot**
- (a) Native Gmail/Outlook OAuth (browser extension + Outlook add-in). [protocol80.com](https://www.protocol80.com/blog/hubspot-gmail-outlook-integration)
- (b) True two-way sync: emails sent/received in either HubSpot or the connected mailbox propagate to the other; can log everything or exclude specific contacts/domains. [community.hubspot.com](https://community.hubspot.com/t5/Account-Settings/2-way-email-Sync/m-p/1009777), [mpiresolutions.com](https://mpiresolutions.com/blog/how-to-add-hubspot-to-outlook/)
- (c) No granular private/shared toggle comparable to Pipedrive was found in the docs surfaced — unverified whether per-email privacy exists; shared team inboxes give full team visibility by design. [blog.hubspot.com shared-inbox-tools](https://blog.hubspot.com/service/shared-inbox-tools)
- (d) Gmail/Outlook connection and basic logging are in the **Free** Sales Hub tier; multi-step email **sequences** require Professional ($100/seat/mo) or Enterprise. [docket.io](https://www.docket.io/resources/research/hubspot-sales-hub-pricing), [encharge.io](https://encharge.io/hubspot-pricing/)
- BCC/forwarding capture address (`portalid@bcc.hubspot.com`) exists independent of full sync, available regardless of tier. [knowledge.hubspot.com](https://knowledge.hubspot.com/connected-email/log-email-in-your-crm-with-the-bcc-or-forwarding-address)

**Attio**
- (a) Native Gmail API + Microsoft 365 (Graph) OAuth. [attio.com/help/email-and-calendar-syncing](https://attio.com/help/reference/email-calendar/email-and-calendar-syncing)
- (b) Only **Inbox and Sent folders** sync (not full mailbox); drafts don't sync. Auto-creates People/Company records from anyone you've emailed or met with (can be turned off). Can send from Attio; **open tracking only works when sending from Attio via Microsoft 365** (not Gmail, not third-party clients). [attio.com/help/view-emails-and-meetings](https://attio.com/help/reference/email-calendar/view-emails-and-meetings), [attio.com/help/introduction-email-sync](https://attio.com/help/academy/introduction/email-sync-people-companies)
- (c) Default: **metadata shared with team** (subject, participants, timestamp) but **body hidden**; other members can request access to a full email, owner approves/denies. [folk.app HubSpot-vs-Attio](https://www.folk.app/articles/HubSpot-vs-Attio-email-integration)
- (d) Email sync is on the **Free plan** (1 mailbox/user); Plus keeps 1/user, Pro doubles to 2/user, Enterprise 3+/user. [sollmannkann.com](https://www.sollmannkann.com/crm-software/best-attio-crm-review/), [comparedge.com](https://comparedge.com/tools/attio/pricing)

**Close**
- (a) True **two-way IMAP/SMTP** integration (protocol-level, not just Gmail/Graph API), with an OAuth walkthrough for Gmail/Google Workspace/Microsoft and manual SMTP/IMAP entry ("Custom Email") for anything else. [help.close.com/connect-your-email](https://help.close.com/docs/connect-your-email)
- (b) Sends from Close or the native client; auto-logs anything appearing in the connected account's **Sent folder** regardless of which client sent it; syncs matched history with existing Leads, including past emails predating Close use. [close.com/integrations/gmail](https://close.com/integrations/gmail)
- (c) Granular private/shared thread controls not documented in what surfaced — unverified.
- (d) Connected-mailbox counts are plan-gated: **Growth = 3, Scale = 10**; pricing runs Solo $9 → Scale $139/user/mo. [layer3labs.io](https://www.layer3labs.io/guides/close-crm-pricing), [g2.com Close pricing](https://www.g2.com/products/close/pricing)

**Copper**
- (a) Native, Google-certified integration built specifically for **Google Workspace** (Gmail, Calendar, Drive, Contacts) — not Microsoft/IMAP. [copper.com/google-workspace-crm](https://www.copper.com/google-workspace-crm)
- (b) Auto-identifies senders in Gmail, auto-creates contacts/leads, surfaces deal history in a Gmail sidebar; separately offers a **"Copper Mailbox" BCC address** for non-Gmail-sync users (attachments don't auto-associate via this path). [support.copper.com Email-settings](https://support.copper.com/hc/en-us/articles/360000344451-Email-settings-and-Email-Templates)
- (c) Unverified — no per-email private/shared control surfaced in search.
- (d) Gmail sync/contact auto-capture is present from the **Starter** tier ($12–29/seat/mo); multi-step email sequences are gated to the **Business** tier (~$99/seat). [aeroleads.com](https://aeroleads.com/blog/copper-crm-2026-updated-review-ratings-final-verdict/)

**folk**
- (a) Native OAuth to Gmail and Outlook (plus LinkedIn/WhatsApp as separate native integrations, not IMAP). [folk.app/crm-for-x/gmail](https://www.folk.app/crm-for-x/gmail)
- (b) Auto-syncs emails/meetings to the matched contact/company; replies trigger notifications; send-from-folk with open/click tracking. [folk.app/products/integrations](https://www.folk.app/products/integrations)
- (c) Unverified — no privacy-control documentation surfaced.
- (d) Full email/calendar/WhatsApp sync is included on the base **Standard** tier ($24–30/seat/mo); no free CRM tier found in current pricing. [lightfield.app/folk-crm-pricing](https://lightfield.app/blog/folk-crm-pricing)

**Streak**
- (a) Not a server-side mailbox sync — runs as a **Chrome extension inside Gmail/Google Workspace only** (no Outlook/IMAP support found). [streak.com](https://www.streak.com/)
- (b) Because it lives inside Gmail, "sync" = tagging/organizing existing Gmail threads into pipeline "boxes"; mobile app mirrors the same Gmail data.
- (c) Sharing/permissions configured per box/pipeline when inviting teammates; no granular private/shared per-email control documented — partially unverified.
- (d) **As of 2024–2025 Streak removed its free CRM tier** — the current Free plan is email power-tools only (tracking, mail merge, snippets), with pipeline/CRM functionality starting at **Pro $59/user/mo** (or $49 annual). [costbench.com](https://costbench.com/software/crm/streak/), [mentionagent.ai](https://mentionagent.ai/blog/streak-pricing/)

**Raynet (CZ)**
- (a) Supports Outlook, Gmail (OAuth), and generic **IMAP**. [support.raynetcrm.com](https://support.raynetcrm.com/hc/en-us/articles/21783670752157-Connecting-Email-Inbox-to-Raynet)
- (b) User explicitly chooses at setup which folders/labels sync and how much mailbox history to import — configurable scope, not automatically the whole inbox. [raynetcrmllc.zendesk.com](https://raynetcrmllc.zendesk.com/hc/en-us/articles/22843032044306-Connecting-Email-Inbox-to-Raynet)
- (c) **Private by default**: "Emailové zprávy v Raynetu jsou viditelné jen pro vás, dokud se nerozhodnete je sdílet s ostatními." [raynet.cz/blog/emaily](https://raynet.cz/blog/emaily/)
- (d) Email connection is gated to **Professional and Enterprise plans only**. [podpora.raynet.cz](https://podpora.raynet.cz/hc/en-us/sections/200378268-Integrations-and-Synchronization)

**eWay-CRM (CZ)**
- (a) Fundamentally an **Outlook/Exchange desktop add-in (COM plugin)** — rides on whatever mailbox Outlook is configured with rather than talking to Gmail API/Graph directly. [eway-crm.com Outlook integration](https://www.eway-crm.com/integrations/a-strong-integration-with-microsoft-office-perfect-with-outlook/)
- (b) Contacts sync **two-way** automatically; emails are captured via an explicit "Synchronize with eWay-CRM" action or rule-based auto-save from Outlook — selective/rule-driven capture, not a continuous full inbox mirror. [kb.eway-crm.com](https://kb.eway-crm.com/documentation/4-modules/tasks/synchronization-of-superior-item-company-and-contact-with-microsoft-outlook)
- (c) Unverified — likely governed by general CRM permission groups rather than per-thread controls.
- (d) Companies & Contacts base module from $20/user/mo (mandatory; appears to include Outlook email-save); the separately-priced "Marketing" module covers campaigns, not core email-logging — that gating distinction is **unverified**. [zoftwarehub.com](https://zoftwarehub.com/products/eway-crm/pricing)

## 2. Build options for a small self-hosted product

### Direct integration

**Gmail API scopes** (per [support.google.com/cloud/answer/13464325](https://support.google.com/cloud/answer/13464325?hl=en)):
- **Sensitive** (verification only, no security-assessment fee): `gmail.send`.
- **Restricted** (verification **+ annual third-party CASA assessment**): `mail.google.com`, `gmail.readonly`, `gmail.metadata`, `gmail.modify`, `gmail.insert`, `gmail.compose`, `gmail.settings.*`. Any read capability triggers restricted-scope treatment.
- **Exemption**: apps not shared with others, or accessing **fewer than 100 Gmail accounts**, are exempt from verification/CASA. [buzzclan.com](https://buzzclan.com/cyber-security/google-casa-tier-2-assessment/)

**CASA cost/timeline:**
- Tier 1 = self-scan (lowest risk only). **Tier 2 = authorized-lab DAST scan; mandatory baseline for all restricted scopes.** Tier 3 = full manual pentest for higher sensitivity/volume. [deepstrike.io](https://deepstrike.io/blog/google-casa-security-assessment-2025)
- Cost figures found (assessor-dependent, not an official price list): **Tier 2 ≈ $540–$1,800/yr**, **Tier 3 ≈ $4,500/yr** (TAC Security figures); wider "$5,000–$75,000+" ranges cited for enterprise engagements are **unverified/outlier**.
- **Recurs annually** — reverification at least every 12 months after the assessor's Letter of Assessment approval date. [developers.google.com/restricted-scope-verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- Timeline: several weeks for restricted-scope verification; Tier 2 reassessment 1–3 weeks, Tier 3 2–4 weeks. Assessors: TAC Security, Leviathan, DEKRA.

**Microsoft Graph (Mail.Read / Mail.Send) — publisher verification:**
- Business-identity verification, not a security assessment: MPN account, Entra tenant association, non-`*.onmicrosoft.com` publisher domain, DNS-verified email domain. **1–5 business days.** [learn.microsoft.com/publisher-verification-overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- Unverified apps requesting broad delegated permissions show an "unverified publisher" warning unless a tenant admin consents. No CASA-equivalent annual paid assessment found for Graph mail scopes.

**Generic IMAP fallback:** no vendor verification regime — you own credential-storage risk directly.

### Aggregators

| Provider | Pricing (as found) | EU residency | Notes |
|---|---|---|---|
| **Nylas** | $15/mo incl. 5 accounts, then **$2/account/mo**. [nylas.com/pricing](https://www.nylas.com/pricing/) | **EU (Ireland) DC**, no extra cost; SOC 2; DPA available. [developer.nylas.com/data-residency](https://developer.nylas.com/docs/dev-guide/platform/data-residency/) | Shared pre-verified Google project skips OAuth verification + CASA entirely (Contract-tier add-on). [google-verification guide](https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/) |
| **Aurinko** | **$1–2/account/mo** by transfer volume; no minimum found. [aurinko.io/pricing](https://www.aurinko.io/pricing/) | Not stated — **unverified**. | "Shared OAuth app" mode skips Google verification/security review. [docs.aurinko.io](https://docs.aurinko.io/authentication/oauth-flow) |
| **Unipile** | From **€49/mo incl. 10 accounts**, ~€5/account beyond. [unipile.com/pricing-api](https://www.unipile.com/pricing-api/) | **All data in EU (France, Scaleway)**; SOC 2 Type II; AES-256-GCM at rest. [unipile.com/security-compliance](https://www.unipile.com/security-compliance/) | CASA Tier-2-certified own OAuth client; can later switch to bring-your-own credentials. |
| **Unified.to** | Usage/API-call-based; ≈$750/mo at 750k calls is a **third-party estimate, unverified**. [truto.one](https://truto.one/blog/how-much-does-a-unified-api-cost-per-connection-at-scale-2026/) | Not found — **unverified**. | Broad horizontal unified-API platform, not an email specialist. |

### Self-hosted middleware: EmailEngine (Postalsys)

- **$995/year flat**, unlimited mailboxes, self-hosted. Handles IMAP/SMTP, Gmail API and MS Graph OAuth flows, webhooks for new mail; "does not send or store any data outside of your network." [learn.emailengine.app/licensing](https://learn.emailengine.app/docs/licensing), [emailengine.app](https://emailengine.app/)
- **Does NOT avoid CASA** — production use for external users requires your own verified Google OAuth client, i.e. Google verification + CASA yourself. [learn.emailengine.app/gmail-api](https://learn.emailengine.app/docs/accounts/gmail/gmail-api)

### Sync-light alternative: BCC capture / auto-forward

- HubSpot: BCC + forwarding address independent of full sync, all tiers; does not create new contacts from BCC'd recipients. [knowledge.hubspot.com](https://knowledge.hubspot.com/connected-email/log-email-in-your-crm-with-the-bcc-or-forwarding-address)
- Pipedrive: Smart BCC on all plans; auto-creates a Person; 20MB cap. [support.pipedrive.com/smart-email-bcc](https://support.pipedrive.com/en/article/smart-email-bcc)
- Copper: "Copper Mailbox" BCC for non-Gmail users; attachments don't auto-associate. [support.copper.com](https://support.copper.com/hc/en-us/articles/360000344451-Email-settings-and-Email-Templates)
- Close: auto-BCC exists but documented mainly for helpdesk integration. [help.close.com/helpdesk-integration](https://help.close.com/docs/helpdesk-integration)
- Attio, folk, Streak, Raynet, eWay-CRM: no BCC-capture docs surfaced — **unverified**.

## 3. Gotchas

- **Limited Use policy**: Google API data usable only for prominent user-facing features, disclosed in a public privacy policy; ads/resale prohibited. [api-services-user-data-policy](https://developers.google.com/terms/api-services-user-data-policy)
- **AI/ML training prohibited** on Workspace/Gmail API data for non-personalized models. [workspace.google.com/blog/api-policy-protections](https://workspace.google.com/blog/ai-and-machine-learning/api-policy-protections)
- **No human review** of restricted-scope data — support/dev staff cannot open a customer's synced mailbox to debug except narrow consent/security exceptions. [workspace-api-user-data-developer-policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy)
- **Annual CASA re-assessment**: 12 months from LOA approval date — recurring line item.
- **Token storage**: encrypt access/refresh tokens at rest, server-side only, restricted DB access, rotate refresh tokens (OWASP ASVS via CASA). [oauth2 best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- **GDPR**: synced mailbox contains personal data of the customer AND every correspondent; Art. 28(3) DPA needed with any subprocessor touching it; SCCs if processing leaves EU/EEA. [gdpr.eu/data-processing-agreement](https://gdpr.eu/data-processing-agreement/)
- **Deletion on revoke**: an explicit "30 days" clause was not confirmed (**unverified**) — build prompt deletion-on-revoke regardless.
- **Scope minimization = cost minimization**: `gmail.send` alone is only "sensitive" (no CASA); the CASA trigger is specifically any read capability.
