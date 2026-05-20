/**
 * Heuristic: classify a CSV by its header row alone.
 *
 * The wizard runs this client-side after sniffing the headers so each
 * uploaded file can show its detected role (companies / contacts /
 * combined / unknown) and pre-fill the per-file mapping. The user can
 * always override the guess via a `<select>` on the file row.
 *
 * The heuristics are deliberately loose — they recognize a handful of
 * Czech + English aliases for the load-bearing fields (company name +
 * IČO on the company side; first_name + last_name on the contact side)
 * and let the user fix mis-classifications by hand.
 */

import type { FieldDescriptor } from "@/app/settings/import/useImport";

export type FileRole = "companies" | "contacts" | "combined" | "unknown";

const COMPANY_ALIASES: Record<string, string> = {
  // headers → company-side field key
  name: "name",
  název: "name",
  "název firmy": "name",
  firma: "name",
  company: "name",
  ico: "ico",
  ičo: "ico",
  ic: "ico",
  dic: "dic",
  dič: "dic",
  email: "email",
  "e-mail": "email",
  phone: "phone",
  telefon: "phone",
  "tel.": "phone",
  website: "website",
  web: "website",
  www: "website",
  url: "website",
  industry: "industry",
  obor: "industry",
  odvětví: "industry",
  segment: "industry",
  street: "address_street",
  ulice: "address_street",
  city: "address_city",
  město: "address_city",
  zip: "address_zip",
  psc: "address_zip",
  psč: "address_zip",
  legal_form: "legal_form",
  "právní forma": "legal_form",
  owner: "owner",
  obchodník: "owner",
  obchodnik: "owner",
  prodejce: "owner",
  salesperson: "owner",
  note: "note",
  poznámka: "note",
  poznamka: "note",
};

const CONTACT_ALIASES: Record<string, string> = {
  first_name: "first_name",
  jméno: "first_name",
  jmeno: "first_name",
  given_name: "first_name",
  firstname: "first_name",
  last_name: "last_name",
  příjmení: "last_name",
  prijmeni: "last_name",
  surname: "last_name",
  lastname: "last_name",
  family_name: "last_name",
  position: "position",
  pozice: "position",
  title: "position",
  role: "position",
  email: "email",
  "e-mail": "email",
  phone: "phone",
  telefon: "phone",
  linkedin: "linkedin_url",
  linkedin_url: "linkedin_url",
};

function normalize(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function intersectCount(headers: string[], aliases: Record<string, string>): number {
  const matched = new Set<string>();
  for (const h of headers) {
    const key = aliases[normalize(h)];
    if (key) matched.add(key);
  }
  return matched.size;
}

export function detectFileRole(headers: string[]): FileRole {
  const companyHits = intersectCount(headers, COMPANY_ALIASES);
  const contactHits = intersectCount(headers, CONTACT_ALIASES);
  // Contact side needs both first and last name; a single "Jméno" column
  // alone (which could be a company name) doesn't count as a contact signal.
  const hasFirstAndLast =
    headers.some((h) => CONTACT_ALIASES[normalize(h)] === "first_name") &&
    headers.some((h) => CONTACT_ALIASES[normalize(h)] === "last_name");
  const hasCompanySignal =
    headers.some((h) => COMPANY_ALIASES[normalize(h)] === "name") ||
    headers.some((h) => COMPANY_ALIASES[normalize(h)] === "ico");

  if (hasFirstAndLast && hasCompanySignal) return "combined";
  if (hasFirstAndLast) return "contacts";
  if (hasCompanySignal) return "companies";
  if (companyHits >= 2) return "companies";
  if (contactHits >= 2) return "contacts";
  return "unknown";
}

/**
 * Auto-suggest a header→field mapping for a given side. The user can
 * still override via the dropdowns; this just saves clicks on the
 * common case where headers already match the canonical names.
 */
export function autoMap(
  headers: string[],
  side: "company" | "contact",
  catalog: FieldDescriptor[],
): Record<string, string> {
  const aliases = side === "company" ? COMPANY_ALIASES : CONTACT_ALIASES;
  const allowed = new Set(catalog.map((f) => f.key));
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const guess = aliases[normalize(h)];
    if (guess && allowed.has(guess) && !used.has(guess)) {
      out[h] = guess;
      used.add(guess);
    }
  }
  return out;
}
