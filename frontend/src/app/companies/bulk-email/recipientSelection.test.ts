import { describe, expect, it } from "vitest";

import {
  defaultEmails,
  emailOptions,
  type RecipientCandidate,
} from "@/app/companies/bulk-email/recipientSelection";

function contact(id: string, first: string, email: string | null) {
  return {
    id,
    first_name: first,
    last_name: "Novák",
    email,
  } as RecipientCandidate["contacts"][number];
}

function candidate(
  defaultEmail: string | null,
  contacts: RecipientCandidate["contacts"],
): RecipientCandidate {
  return {
    company_id: "c1",
    company_name: "ACME",
    default_email: defaultEmail,
    contacts,
    emailable: true,
    skip_reason: null,
  };
}

describe("emailOptions", () => {
  it("lists the company address first, then each contact with an e-mail, deduplicated", () => {
    const opts = emailOptions(
      candidate("info@acme.cz", [
        contact("p1", "Jan", "jan@acme.cz"),
        contact("p2", "Eva", null),
        contact("p3", "Petr", "INFO@acme.cz"),
      ]),
      "Firemní e-mail",
    );
    expect(opts).toEqual([
      { email: "info@acme.cz", label: "Petr Novák", contactId: "p3" },
      { email: "jan@acme.cz", label: "Jan Novák", contactId: "p1" },
    ]);
  });

  it("labels a company address that belongs to no contact generically", () => {
    const opts = emailOptions(candidate("info@acme.cz", []), "Firemní e-mail");
    expect(opts).toEqual([{ email: "info@acme.cz", label: "Firemní e-mail", contactId: null }]);
  });
});

describe("defaultEmails", () => {
  it("preselects every contact address and leaves the generic company address out", () => {
    const opts = emailOptions(
      candidate("info@acme.cz", [
        contact("p1", "Jan", "jan@acme.cz"),
        contact("p2", "Eva", "eva@acme.cz"),
      ]),
      "Firemní e-mail",
    );
    expect(defaultEmails(opts)).toEqual(["jan@acme.cz", "eva@acme.cz"]);
  });

  it("falls back to the company address when no contact has an e-mail", () => {
    const opts = emailOptions(
      candidate("info@acme.cz", [contact("p2", "Eva", null)]),
      "Firemní e-mail",
    );
    expect(defaultEmails(opts)).toEqual(["info@acme.cz"]);
  });
});
