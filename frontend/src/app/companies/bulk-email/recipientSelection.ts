import type { components } from "@/types/api.generated";

export type RecipientCandidate = components["schemas"]["RecipientCandidate"];

export interface EmailOption {
  email: string;
  label: string;
  /** The contact behind the address; `null` for the company's own address. */
  contactId: string | null;
}

/** Selectable addresses for a company: its default address first (a
 * contact's name when it maps to one, else the generic company-email label),
 * then any remaining contacts that have an email. */
export function emailOptions(c: RecipientCandidate, companyEmailLabel: string): EmailOption[] {
  const out: EmailOption[] = [];
  const seen = new Set<string>();
  const contactByEmail = new Map<string, RecipientCandidate["contacts"][number]>();
  for (const ct of c.contacts) {
    if (ct.email) contactByEmail.set(ct.email.toLowerCase(), ct);
  }
  if (c.default_email) {
    const ct = contactByEmail.get(c.default_email.toLowerCase());
    out.push({
      email: c.default_email,
      label: ct ? `${ct.first_name} ${ct.last_name}` : companyEmailLabel,
      contactId: ct?.id ?? null,
    });
    seen.add(c.default_email.toLowerCase());
  }
  for (const ct of c.contacts) {
    if (ct.email && !seen.has(ct.email.toLowerCase())) {
      out.push({ email: ct.email, label: `${ct.first_name} ${ct.last_name}`, contactId: ct.id });
      seen.add(ct.email.toLowerCase());
    }
  }
  return out;
}

/** What a freshly resolved company starts with: every contact that has an
 * address, and the company's own address only when no contact does — mailing
 * info@ next to the people behind it would double up on the same firm. */
export function defaultEmails(options: EmailOption[]): string[] {
  const contacts = options.filter((o) => o.contactId !== null).map((o) => o.email);
  return contacts.length > 0 ? contacts : options.map((o) => o.email);
}
