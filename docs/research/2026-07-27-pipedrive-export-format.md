# Getting data OUT of Pipedrive — reference for a migration importer

Research date: 2026-07-27. Sources are marked by strength:
**[V]** = Pipedrive's own docs/assets (support.pipedrive.com, developers.pipedrive.com, pipedriveassets.com CDN) ·
**[C]** = Pipedrive community forum · **[3P]** = third-party blog/vendor · **[?]** = not confirmed anywhere, must test.

## What an importer must handle (executive summary)

1. **Exports are per-entity files, not a relational dump.** Users export Deals, People, Organizations, Activities, Notes, Products, Leads, Projects, Files one at a time as **XLSX or CSV**. There is no built-in "one ZIP with everything" for normal plans **[V]**.
2. **Internal IDs exist for every record** ("Pipedrive System ID") and Pipedrive explicitly documents exporting them for round-trip updates — but they are **opt-in columns in list-view exports**, not guaranteed present, and there is **no documented ID column for the *linked* org/person on a deal row** **[V + gap]**. Design for name/email matching, treat IDs as a bonus.
3. **Header convention is `Entity - Field`** ("Deal - Title", "Person - Email (Work)") — verified verbatim from a Pipedrive-hosted sample file **[V]**.
4. **Custom fields**: in UI exports the header is the field's **display label** (user-authored, any language, may collide with default labels). The 40-char hash keys are an **API-side** concept **[V]**; one 3P guide claims UI exports use hashes — treat as contested, verify.
5. **Header localization is the biggest open risk.** Pipedrive's UI is fully localized incl. Czech, and export headers are built from field labels. Not confirmed either way **[?]** — do not hard-match English header strings.
6. **Multi-value email/phone likely collapses into one comma-separated column with the Work/Home/Mobile labels lost** on export **[C]**, while *import* supports one column per label **[V]**. Asymmetric — plan a splitter.

---

## 1. Export mechanisms

### 1a. List-view export (the common path) **[V]**
- Path: open a list view (Deals, Leads, Projects, Contacts/People, Organizations) → apply filter → `...` → **"Export filter results"**.
- The **visible columns decide the exported columns**: gear icon → "Choose columns". In the *deal* list view you can add **deal, person and organization fields into one export** — this is how you get a denormalized deal sheet.
- Format choice: **"Excel" (XLSX) or "CSV"**.
- Immediate download prompt; if dismissed, retrieve from *Tools and apps → Export data → Generated exports* (cloud icon).
- **Row cap: not documented [?].** (The *import* side is documented at max 50,000 rows / 50 MB **[V]** — do not assume the same applies to export.)

### 1b. Account-level export (Tools and apps → Export data) **[V]**
- Exportable item types: **Leads, Deals, Organizations, People, Products, Activities, Projects, Notes, Files**.
- Per Pipedrive: *"Most item exports include default, custom and system fields, along with ownership information and any linked records."* Linked records are documented for Leads and Deals ("Linked organizations and contact people") and People ("Linked organizations").
- **One file per selected item type** — appears in the **"Generated exports"** list, downloaded from the browser. No ZIP bundle documented, no email delivery documented **[V]**.
- No column picker here (unlike list view) — you get the standard set.
- Retention: *"Exported files are available for 28 days."*
- Permissions: *"Only global admins and regular users with the correct permissions enabled can export data."* Visibility groups still apply — a non-admin's export is silently partial.
- Not included: **Google Drive files**. Activities, notes and files linked to deals **must be exported separately** — no nesting.

### 1c. Other paths
- **Deal detail view** → export a single deal as **XLSX only**, includes linked person/organization **[V]**.
- **Insights**: charts as PDF/PNG, table data as spreadsheet **[V]** — not a migration path.
- **Data backups → ZIP of CSVs by object type** on Professional/Power/Enterprise: claimed by **[3P]** only; I could not find this in Pipedrive's own KB. Treat as unconfirmed.
- **API** (fallback for technical users): REST, `GET /api/v1|v2/deals|persons|organizations|activities|notes|products` plus `…Fields` endpoints for the custom-field key↔label map. **API v1 is being sunset — all v1 endpoints deprecated, partner-facing deadline 31 July 2026** (Pipedrive changelog + Zapier/Make notices, **[V/3P]**). Build against **v2** if you build at all; note v2 returns *less* data per record than v1.

---

## 2. Entity-by-entity field names

**Source of truth used here:** Pipedrive's own sample spreadsheet asset, tab *"READ ME All default Pipedrive fields"* —
`https://kb-cms.pipedriveassets.com/Sample-data-spreadsheets/Pipedrive sample data (with Products) - Import data.xlsx`
(linked from support.pipedrive.com/en/article/importing-sample-import-spreadsheets). **[V]**

Caveat: this asset is the **import/mapping** vocabulary. The *export* headers follow the same `Entity - Field` convention (confirmed by the sample CSV below and by 3P reports), but exact per-column spelling in an export file is **not published** — e.g. the ID column is called **"… - Pipedrive System ID"** in the import reference while the list-view column picker calls it simply **"ID"** **[V]**. Verify against a real export.

### Persons / People
`Person - Name*` · `Person - First name*` · `Person - Last name*` · `Person - Email` · `Person - Phone` · `Person - Label` (single option) · `Organization name` (link to org) · `Person - Owner` (user) · `Person - Creation date` · `Person - Visible to` · `Person - Pipedrive System ID`
(*at least one of Name / First name / Last name required on import.)

### Organizations
`Organization - Name*` · `Organization - Labels` · `Organization - Address` plus **nine address subfields**, each spelled `Organization - Address - <part> of Address`: *Apartment/suite no, House number, Street/road name, District/sublocality, City/town/village/locality, State/county, Region, Country, ZIP/Postal code* · `Organization - Owner` · `Organization - Followers` · `Organization - Creation date` · `Organization - Visible to` · `Organization - Pipedrive System ID` · `Person name` (link to a contact person).

### Deals
`Deal - Title` · `Deal - Value` · `Organization*` · `Contact person*` · `Deal - Owner` · `Deal - Stage (pipeline)` · `Deal - Expected close date` · `Deal - Currency of value` · `Deal - Label` (multiple options) · `Deal - Creation date` · `Deal - Closed on` · `Deal - Lost reason` · `Deal - Lost time` · `Deal - Probability` · `Deal - Status` · `Deal - Won time` · `Deal - Visible to` · `Deal - Pipedrive System ID`.
Note the linked org/person columns are **bare** (`Organization`, `Contact person`), not prefixed.

### Activities
`Activity - Subject*` · `Activity - Due date` · `Activity - Assigned to user` · `Activity - Note` (large text) · `Activity - Type` · `Activity - Done` (Done/Undone) · `Activity - Due time` · `Activity - Duration` · `Activity - Marked as done time` · `Activity - Creation date` · link columns `Deal`, `Lead`, `Organization`, `Contact person` · `Activity - Pipedrive System ID`.

### Notes
`Note - Content*` (*"Can be HTML-formatted"* — expect HTML in the cell, not plain text) · `Note - Pipedrive system ID` (lowercase "system" in the source — inconsistent casing is real).
**No documented column linking a note to its deal/person/org in this reference [?]** — a note export that cannot be re-attached is a plausible failure mode; verify.

### Products
`Product - Name*` · `Product - Category` · `Product - Currency` · `Product - Description` · `Product - Price` · `Product - Product code` · `Product - Owner` · `Product - Active` · `Product - Tax` · `Product - Unit` · `Product - Unit prices` · `Product - Visible to` · `Product - Billing frequency` · `Product - Billing cycles` · `Product - Followers` · `Product - Pipedrive System ID`.
**Products *linked to deals* (line items) cannot be imported and are not in this list** — Pipedrive: *"you can currently only import the product catalog rather than individual products linked to deals."* Whether deal line-items can be *exported* at all is **[?]**.

### Leads (bonus, same file)
`Lead - Title*` · `Lead - Labels` · `Contact person*` · `Organization*` · `Lead - Owner` · `Lead - Source channel` · `Lead - Source channel ID` · `Lead - Pipedrive System ID`. Lead IDs are **UUIDs**, not integers **[V]**.

### Users / owners
No user-export field list is published. Owner appears on every entity as `<Entity> - Owner` (type: User) and is rendered as the **user's name** in spreadsheets **[V, inferred from field type]**; user email is **[?]**. Pipedrive says user data is exportable from account settings **[V]** but does not document its columns.

### Always-present vs. conditional
Not documented **[?]**. The account export is described as including *"default, custom and system fields"* for the entity, which implies a **fixed header set regardless of population** (empty cells for unset values); list-view exports contain exactly the columns the user chose. An importer must not assume any given column exists — match headers dynamically and tolerate absence.

---

## 3. Multi-value fields (emails, phones)

- **On import**, Pipedrive expects **one column per value**, with the Work/Home/Other label assigned during mapping. Verbatim from the READ ME tab: *"During the mapping process, you can label the email address as Work, Home or Other. We recommend adding multiple columns for multiple email addresses."* Same wording for phone with *"Work, Home, Mobile, Other"* **[V]**. The sample file uses `Person - Email (Work)`, `Person - Email (Home)` **[V]**.
- **On export**, a long-standing community thread ("Contact Export - Column for each phone type") reports the opposite: **all values land in a single column separated by commas, and the Work/Mobile/Home label is lost**; Pipedrive staff replied it was in the backlog **[C]**. I could not re-fetch the thread verbatim (community.pipedrive.com now 301s to pipedrive.com/en/community) and could not confirm whether this changed since.
- **Importer consequence:** for `Person - Email` / `Person - Phone`, split on `,` (also trim, and expect no type labels), and *also* handle `… (Work)` / `… (Home)` style suffixed columns if present. Treat the first value as primary. Do not assume phone strings are normalized — they are free text (`570-809-7197` in Pipedrive's own sample).

---

## 4. Custom fields

- **16 custom field types [V]**: Text, Large text, Single option, Multiple options, Autocomplete, Numerical, Monetary, User, Organization, Person, Phone, Time, Time range, Date, Date range, Address.
- **API-side keys** are random 40-char hashes, e.g. `dcf558aac1ae4e8c4f849ba5e668430d8df9be12`, unique per account and unrenameable; API `field_type` values are `varchar`, `varchar_auto`, `text`, `double`, `monetary`, `enum`, `set`, `user`, `org`, `people`, `phone`, `date`, `daterange`, `time`, `timerange`, `address` **[V]**.
- **Monetary** exposes a currency subkey: *"a `monetary` field with the key `…be12` also exposes `…be12_currency`"* **[V]** → expect **two columns** (value + currency) in a file export too, though the exported header spelling is **[?]**.
- **Address** custom fields *"behave like the default address fields under organizations, including subfields"* **[V]** → expect the main address string plus up to nine subfield columns following the `<Field> - <part> of <Field>` pattern seen for organizations.
- **Multiple options (`set`)**: values are option **labels**, and multi-value cells elsewhere in Pipedrive's docs use **comma separation** (followers: *"add them to the same cell separated with commas"* **[V]**). Comma separation for `set` fields is **highly likely but not verbatim-confirmed [?]** — and commas inside option labels would be ambiguous. Verify.
- **Header in a UI export = the custom field's display label** (this is what the column picker shows). **Contested:** one migration vendor guide claims *"Pipedrive custom fields export with internal field IDs as column headers, not the labels you see in the UI. An export column might appear as `abcdef123456` instead of 'Contract Value.'"* **[3P — resources.rework.com]**. This contradicts the label-based column picker; it may describe an API/Data-Loader path. **Must be settled with a real export file** — it changes whether an importer can offer label-based custom-field mapping at all.
- Custom field labels are **not translated** when the UI language changes; Pipedrive users are told to create parallel fields per language **[C/V]**. So custom-field headers are in whatever language the account owner typed.

---

## 5. Deals specifics

| Aspect | Representation | Confidence |
|---|---|---|
| Pipeline / stage | Import field is `Deal - Stage (pipeline)`; matching is by **stage name**, resolved via a drag-and-drop mapping UI — *"You don't need to worry about matching the names of your stages"* | **[V]** — whether an *export* gives one combined column or separate `Pipeline` + `Stage` columns is **[?]** |
| Status | `Deal - Status`, values **Open / Won / Lost** (words, not codes) | **[V]** |
| Lost reason | `Deal - Lost reason`, type *Lost reason (Single option)* → the reason **text** | **[V]** |
| Dates | `Deal - Expected close date`, `Deal - Won time`, `Deal - Lost time`, `Deal - Closed on`, `Deal - Creation date` — separate columns, all present in the schema | **[V]** |
| Value / currency | `Deal - Value` (number) + `Deal - Currency of value` (*"currency symbol (f.e. $, USD)"*) → **two columns; value is in the deal's own currency** | **[V]** |
| Normalized/company-currency value | Pipedrive computes a default-currency amount internally; whether an export column carries it | **[?]** |
| Linked org/person | Columns `Organization` and `Contact person` carrying **names, not IDs** | **[V]** for import; **[3P]** confirms exports are denormalized by name: *"Deal exports include the Person name and Organization name as columns … But they use names, not IDs"* |
| Probability, labels | `Deal - Probability` (number), `Deal - Label` (multiple options, comma-joined) | **[V]** |
| Stage history | **Not in the deal row.** *"Deal stage history … lives in Pipedrive's activity log, not in the Deal record itself. The Deal record only stores the current stage."* | **[3P]**, consistent with the field list |

---

## 6. IDs and linking — the decision that shapes the importer

Confirmed **[V]**:
- Every Lead, Deal, Activity, Person, Organization, Product has a **Pipedrive System ID** (numeric; leads are UUIDs, e.g. `55ebb4c0-536e-11ea-87d0-d1171b17f6a0`).
- A user can surface it: list view → gear → *"Choose columns"* → select **ID** → Save → export. Also visible as the last number in the record's URL.
- Pipedrive's documented **update-by-spreadsheet** workflow is exactly export-with-ID → edit → re-import mapping the ID column, *"The Pipedrive System ID will automatically update your database"*. So the ID **does survive a round trip through a file**.
- The account-level export claims to include *"system fields"*, which most plausibly includes the row's own ID — **not stated explicitly [?]**.

Not confirmed / likely absent:
- **A `Person - Organization ID` or `Deal - Organization ID` / `Deal - Person ID` column.** Nothing in Pipedrive's field reference lists an ID column for the *linked* entity; the link fields are typed `Organization` / `Person` and carry names. **[3P]** states outright that deal exports reference person and organization **by name**.
- Whether the deals list view's column picker exposes "Organization → ID" as a nested column (it does let you add organization and person *fields* to a deal export, so an org ID column may be reachable this way) — **[?] and worth testing first, because if it works it is the single highest-value trick for this importer.**

**Design implication.** Build the importer to:
1. Use `<Entity> - ID` / `… Pipedrive System ID` when present, as a **stable external key** (`pipedrive_id`) for dedupe and re-runs — never as the join key for relationships, since it may be absent.
2. Join **Deals → Organizations by organization name** and **Deals → Persons by person name**, with email as a stronger secondary key for persons; join **Persons → Organizations by organization name**.
3. Assume names are **not unique** (Pipedrive's own docs cite duplicate names as the reason IDs exist). Surface ambiguous matches to the user rather than silently picking one; consider creating a placeholder org on miss.
4. Prefer a **single combined deal export** (deal + person + org columns in one file, list-view path) over three separate files — it removes most joining.

---

## 7. Encoding / format gotchas

Confirmed **[V]**:
- Formats offered: **XLSX ("Excel") and CSV**; XLSX-only for the deal-detail export.
- Import side (and therefore the shape of a round trip): **XLS/XLSX/CSV, ≤ 50,000 rows, ≤ 50 MB, one tab per import, header row required**; rows are skipped on *"an invalid date format"*.
- **Per-user locale settings exist and change data formatting**: *Personal preferences → Account → Language* and *Date/number format*, described as affecting *"numbers (1,0 for German, 1.0 for English)"* and *"dates (29/09/2024 for British English, 09/29/2024 for American English)"*. **Czech (Čeština) is a supported language.**

Therefore, plan for **locale-dependent output**: `31.12.2026` and `1 234,56` are realistic in a Czech user's export, alongside `12/31/2026` / `1,234.56`. Whether the export writer honors the personal locale or emits ISO/US canonical form is **[?]** — the importer must sniff (try ISO → dd.mm.yyyy → dd/mm/yyyy → mm/dd/yyyy) and, when ambiguous (`03/04/2026`), ask.

Unconfirmed but must be handled defensively **[?]**:
- **Delimiter** — presumably `,` with RFC4180 quoting (Pipedrive's own sample CSVs are comma-delimited **[V]**), but a `;` variant for European locales is not ruled out. Sniff the delimiter.
- **Encoding / BOM** — no Pipedrive statement found. Assume UTF-8; **test for a BOM** and strip it, otherwise the first header becomes `﻿Person - Name`. If Pipedrive emits UTF-8 *without* BOM, Czech users who "fix" the file by opening and re-saving in Excel will hand you mojibake (`Novák` → `NovÃ¡k`) or a `;`-delimited, `,`-decimal Windows-1250 file. **Recommend XLSX to users** — it carries encoding and (mostly) types internally; the opposite advice from **[3P]** ("choose CSV over Excel") assumes an English/US desktop.
- **Empty values**: expect truly empty cells (`,,`), but also `""`, `-`, and `0` for unset numerics.
- **Excel traps for Czech users**: leading-zero postal codes and product codes turned into numbers; phone numbers turned into numbers/scientific notation; dates auto-reinterpreted. In XLSX, dates may arrive as **Excel serial numbers** — Pipedrive's own sample sheet stores `Activity - Due date` as `45631`, i.e. days since 1899-12-30. **An XLSX reader must convert serials, not stringify them.** **[V — observed in the vendor asset]**

---

## 8. Czech UI — are headers localized?

**Status: UNKNOWN, and it is the highest-risk unknown for header matching.** **[?]**

What is established:
- Pipedrive ships a fully localized Czech UI (added June 2022; Czech is in the language selector) **[V]**; the Czech KB renders default field names in Czech prose (*"Jméno, telefon, e-mail, štítek, marketingový stav"*).
- Export columns are chosen from the field list **as displayed in the UI**, so localized default labels are the natural source for headers.
- Custom-field labels are never translated **[C/V]** — so even in a localized export, custom columns stay in the author's language.
- The downloadable sample spreadsheets are **English-only and not language-specific** (the Czech KB page links the identical English files) **[V]** — evidence that Pipedrive does not maintain per-locale header vocabularies for these assets, but says nothing about the export writer.

**Do not build header matching on English literals.** Practical design: match on a normalized token set with a per-locale alias table (cs/en at minimum), fall back to a **mapping UI where the user assigns each unrecognized column** — which you need anyway for custom fields. Ask a Czech Pipedrive user for one real export before writing any alias table.

---

## 9. Verbatim example header rows (cited)

**(a) Pipedrive's official sample import spreadsheet** — `https://kb-cms.pipedriveassets.com/Sample-data-spreadsheets/Pipedrive%20sample%20data%20-%20Import%20data.csv`, linked from https://support.pipedrive.com/en/article/importing-sample-import-spreadsheets **[V, fetched 2026-07-27]**:

```
Person - Name*,Person - First name,Person - Last name,Person - Phone,Person - Email (Work),Person - Email (Home),Organization - Name*,Organization - Address,Deal - Title,Deal - Value,Activity - Subject*,Activity - Due date,Note - Content*
```

**(b) Same asset, "with Products" variant** — `…/Pipedrive%20sample%20data%20(with%20Products)%20-%20Import%20data.csv` **[V]**:

```
Person - Name*,Person - First name,Person - Last name,Person - Phone,Person - Email (Work),Person - Email (Home),Organization - Name*,Organization - Address,Deal - Title,Deal - Value,Activity - Subject*,Activity - Due date,Note - Content*,Product - Name*,Product - Product Code,Product - Unit,Product - Price,Product - Currency
```

Sample data row (shows value formats): `Tony Turner,Tony,Turner,570-809-7197,tony.turner@moveer.com,tony.turner@gmial.com,Moveer Limited,"5, 943 Fincham Road, New Mexico 87503, US",Moveer Deal,100.0,First pitch,45631.0,…` — note `100.0` for money, `45631` (Excel serial) for a date, and the quoted comma-containing address.

**I found no verbatim header row from an actual *export* file in any documentation or reputable community post.** Every header list above is the import/mapping vocabulary. This is the single biggest documentation gap.

---

## Unknowns / must verify with a real export file

Ordered by impact on importer design:

1. **Do exports contain IDs of *linked* records** (org ID on a person row; org ID + person ID on a deal row), or only names? If yes → ID-based joins; if no → name matching is mandatory. Test by adding "Organization → ID" in the deals list-view column picker.
2. **Are export headers localized to the UI language (Czech)?** Determines whether header matching needs a locale alias table.
3. **Custom field headers: display label or 40-char hash?** Contradiction between the column-picker behavior and a 3P migration guide.
4. **Exact export header spellings** vs. the import vocabulary — `ID` vs `Pipedrive System ID`; one `Stage (pipeline)` column vs separate `Pipeline` + `Stage`; whether the row's own ID is present by default in the account-level export.
5. **Encoding (UTF-8 with or without BOM) and delimiter** of the CSV export; whether the delimiter changes with locale.
6. **Date and number rendering in the export**: locale-formatted vs ISO; Excel serials in XLSX; decimal comma in Czech locale.
7. **Multi-value emails/phones**: still one comma-joined column with labels dropped (2026 behavior), or separate labeled columns now?
8. **Multiple-option custom fields**: exact separator (`,` vs `;` vs `, ` ) and behavior when an option label itself contains a comma.
9. **Monetary custom fields**: one column or two (`<Label>` + `<Label> currency`), and the second column's exact header.
10. **Export row cap** (import is 50,000; export undocumented) and whether large exports are paginated or emailed.
11. **Notes**: is there a column linking a note to its deal/person/organization? If not, notes are effectively unmigratable from a file export and the API is the only path.
12. **Deal line items** (products attached to deals) — exportable at all from the UI?
13. **Users/owners export** columns — is the owner an email (joinable) or just a display name?
14. **"Data backups → ZIP of CSVs"** on Professional+ — does this feature exist in 2026 as third parties describe?

**Suggested verification:** ask one Czech and one English Pipedrive user for a `Deals` list-view CSV *and* XLSX (with ID and org/person columns added), plus a `People` export from an account that has multi-email contacts and at least one custom field of each type: text, monetary, multiple options, date, address.

## Sources

- https://support.pipedrive.com/en/article/exporting-data-from-pipedrive
- https://support.pipedrive.com/en/article/importing-data-into-pipedrive-with-spreadsheets
- https://support.pipedrive.com/en/article/importing-sample-import-spreadsheets · asset: `kb-cms.pipedriveassets.com/Sample-data-spreadsheets/…`
- https://support.pipedrive.com/en/article/import-fields · https://support.pipedrive.com/en/article/importing-advanced-mapping · https://support.pipedrive.com/en/article/importing-deals-into-a-specific-stage-or-pipeline
- https://support.pipedrive.com/en/article/pipedrive-system-ids · https://support.pipedrive.com/en/article/updating-pipedrive-data-with-a-spreadsheet
- https://support.pipedrive.com/en/article/what-types-of-custom-fields-are-there · https://support.pipedrive.com/en/article/address-fields-in-pipedrive
- https://support.pipedrive.com/hc/en-us/articles/115005198069-How-can-I-change-my-language-or-locale-
- https://pipedrive.readme.io/docs/core-api-concepts-custom-fields · https://developers.pipedrive.com/changelog/post/deprecation-of-selected-api-v1-endpoints
- https://www.pipedrive.com/en/newsroom/pipedrive-introduces-its-crm-software-platform-in-four-new-languages
- [3P] https://resources.rework.com/guides/data-migration/exporting-from-pipedrive · [C] community.pipedrive.com/discussion/1126 (now redirects) · [3P] help.make.com/pipedrive-api-v1-to-v2-transition-by-july-31-2026
