import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";

const ME_RESPONSE = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@ex.cz",
  name: "Admin",
  avatar_url: null,
  role: "admin",
  organization: {
    id: "00000000-0000-0000-0000-0000000000aa",
    name: "Example s.r.o.",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: "2027-01-01T12:00:00+00:00",
  },
};

const EMPTY_LIST = { items: [], total: 0, limit: 50, offset: 0 };

const COMPANY_ROW = {
  id: "c1",
  organization_id: ME_RESPONSE.organization.id,
  name: "ACME s.r.o.",
  ico: "27082440",
  dic: null,
  address_street: null,
  address_city: "Praha",
  address_zip: null,
  legal_form: null,
  website: null,
  note: null,
  owner_user_id: null,
  last_order_at: null,
  ownership_expires_at: "2027-05-01T00:00:00+00:00",
  created_at: "2026-04-15T08:00:00+00:00",
  updated_at: "2026-04-15T08:00:00+00:00",
};

const VERIFIED_SMTP = {
  host: "mail.x.cz",
  port: 465,
  use_ssl: true,
  use_starttls: false,
  username: "petr@firma.cz",
  from_email: "petr@firma.cz",
  from_name: "Petr",
  has_password: true,
  verified: true,
  verified_at: "2026-06-15T10:00:00+00:00",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function baseRoutes(smtp: unknown) {
  return (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
    if (url.includes("/api/v1/me/smtp")) return jsonResponse(smtp);
    if (url.includes("/api/v1/companies?")) return jsonResponse(EMPTY_LIST);
    if (url.includes("/api/v1/companies/filter-options"))
      return jsonResponse({ industries: ["Strojírenství"], cities: [], owner_user_ids: [] });
    if (url.includes("/api/v1/companies/bulk-email/campaigns")) return jsonResponse(EMPTY_LIST);
    if (url.includes("/api/v1/users?")) return jsonResponse(EMPTY_LIST);
    void init;
    return null;
  };
}

describe("Bulk email", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("gates the wizard behind verified SMTP", async () => {
    const routes = baseRoutes({ configured: false });
    fetchMock.mockImplementation(async (input, init) => {
      const r = routes(input as string, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderAt("/app/companies");

    await user.click(await screen.findByRole("button", { name: /hromadný e-mail/i }));
    expect(
      await screen.findByRole("heading", { name: /nejdřív nastavte odesílání e-mailů/i }),
    ).toBeInTheDocument();
    // No wizard dialog yet.
    expect(screen.queryByRole("heading", { name: /^Hromadný e-mail$/i })).toBeNull();
  });

  it("picks companies on Firmy, then opens the wizard on exactly those, without filters", async () => {
    const routes = baseRoutes(VERIFIED_SMTP);
    const resolveBodies: unknown[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/companies/bulk-email/recipients")) {
        resolveBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([
          {
            company_id: "c1",
            company_name: "ACME s.r.o.",
            default_email: "acme@x.cz",
            contacts: [],
            emailable: true,
            skip_reason: null,
          },
        ]);
      }
      if (url.includes("/api/v1/companies?")) {
        return jsonResponse({
          items: [
            { ...COMPANY_ROW, id: "c1", name: "ACME s.r.o." },
            { ...COMPANY_ROW, id: "c2", name: "Jiná s.r.o." },
          ],
          total: 2,
          limit: 25,
          offset: 0,
        });
      }
      const r = routes(url, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderAt("/app/companies");

    // Nothing floats until something is ticked.
    await user.click(await screen.findByRole("button", { name: /hromadný e-mail/i }));
    expect(screen.queryByTestId(testIds.companies.bulkContinue)).toBeNull();
    await user.click(await screen.findByTestId(testIds.companies.selectRow("c1")));
    await user.click(screen.getByTestId(testIds.companies.bulkContinue));

    expect(await screen.findByRole("heading", { name: /^Hromadný e-mail$/i })).toBeInTheDocument();
    await screen.findByRole("button", { name: /další \(1\)/i });
    expect(resolveBodies[0]).toEqual({ unowned: false, company_ids: ["c1"] });
    // Explicit picks: no filter row in the dialog.
    expect(screen.queryByTestId(testIds.emails.bulkWizard.industryFilter)).toBeNull();

    await user.click(screen.getByRole("button", { name: /další \(1\)/i }));
    expect(await screen.findByPlaceholderText(/nová nabídka pro/i)).toBeInTheDocument();
  });

  it("leaves selection mode and empties the basket on Zrušit výběr", async () => {
    const routes = baseRoutes(VERIFIED_SMTP);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/companies?")) {
        return jsonResponse({ items: [COMPANY_ROW], total: 1, limit: 25, offset: 0 });
      }
      const r = routes(url, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderAt("/app/companies");
    await user.click(await screen.findByRole("button", { name: /hromadný e-mail/i }));
    await user.click(await screen.findByTestId(testIds.companies.selectPage));
    expect(screen.getByTestId(testIds.companies.bulkContinue)).toHaveTextContent("Pokračovat (1)");

    await user.click(screen.getByRole("button", { name: /zrušit výběr/i }));
    expect(screen.queryByTestId(testIds.companies.bulkContinue)).toBeNull();
    expect(screen.queryByTestId(testIds.companies.selectPage)).toBeNull();
  });

  it("launches from Kampaně with its own recipient filters and re-resolves on change", async () => {
    const routes = baseRoutes(VERIFIED_SMTP);
    const resolveBodies: unknown[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/companies/bulk-email/recipients")) {
        resolveBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([
          {
            company_id: "c1",
            company_name: "ACME s.r.o.",
            default_email: "acme@x.cz",
            contacts: [],
            emailable: true,
            skip_reason: null,
          },
        ]);
      }
      const r = routes(url, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderAt("/app/emails");

    await user.click(await screen.findByTestId(testIds.emails.campaigns.newButton));
    expect(await screen.findByRole("heading", { name: /^Hromadný e-mail$/i })).toBeInTheDocument();
    await screen.findByText(/ACME s\.r\.o\./);
    // Opened from Kampaně there is no list to inherit from: whole portfolio.
    expect(resolveBodies[0]).toEqual({ unowned: false });

    // Obor is a free-text "contains" filter, re-resolved once typing pauses.
    await user.type(screen.getByTestId(testIds.emails.bulkWizard.industryFilter), "stroj");
    await waitFor(() => expect(resolveBodies).toHaveLength(2));
    expect(resolveBodies[1]).toMatchObject({ industry: "stroj" });

    // The owner select writes both fields: Nezabrané clears the owner id.
    await user.selectOptions(screen.getByTestId(testIds.emails.bulkWizard.ownerFilter), "unowned");
    await waitFor(() => expect(resolveBodies).toHaveLength(3));
    expect(resolveBodies[2]).toMatchObject({
      unowned: true,
      owner_user_id: null,
      industry: "stroj",
    });
  });

  it("preselects every contact address; header and row checkboxes toggle whole sets", async () => {
    const routes = baseRoutes(VERIFIED_SMTP);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/companies/bulk-email/recipients")) {
        return jsonResponse([
          {
            company_id: "c1",
            company_name: "ACME s.r.o.",
            default_email: "info@acme.cz",
            contacts: [
              { id: "p1", first_name: "Jan", last_name: "Novák", email: "jan@acme.cz" },
              { id: "p2", first_name: "Eva", last_name: "Malá", email: "eva@acme.cz" },
            ],
            emailable: true,
            skip_reason: null,
          },
          {
            company_id: "c2",
            company_name: "Solo s.r.o.",
            default_email: "solo@x.cz",
            contacts: [],
            emailable: true,
            skip_reason: null,
          },
        ]);
      }
      const r = routes(url, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderAt("/app/emails");
    await user.click(await screen.findByTestId(testIds.emails.campaigns.newButton));
    await screen.findByText(/ACME s\.r\.o\./);

    // Contacts only for ACME (the generic info@ stays unticked), the lone
    // company address for Solo: 3 of 4.
    expect(screen.getByTestId(testIds.emails.bulkWizard.recipientsTotal)).toHaveTextContent(
      "Vybráno 3 z 4 příjemců",
    );
    expect(screen.getByText("2 z 3 příjemců")).toBeInTheDocument();
    expect(screen.getByText("1 příjemce")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /další \(3\)/i })).toBeEnabled();

    // Partial → everything, everything → nothing.
    const all = screen.getByTestId(testIds.emails.bulkWizard.selectAll) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await user.click(all);
    expect(screen.getByRole("button", { name: /další \(4\)/i })).toBeEnabled();
    expect(all.checked).toBe(true);
    await user.click(all);
    expect(screen.getByRole("button", { name: /další \(0\)/i })).toBeDisabled();

    // A row checkbox ticks every address of that company.
    await user.click(screen.getByTestId(testIds.emails.bulkWizard.companyCheckbox("c1")));
    expect(screen.getByRole("button", { name: /další \(3\)/i })).toBeEnabled();
    expect(screen.getByText("3 příjemci")).toBeInTheDocument();
  });

  it("redirects the old /app/email-campaigns bookmark to Kampaně", async () => {
    const routes = baseRoutes(VERIFIED_SMTP);
    fetchMock.mockImplementation(async (input, init) => {
      const r = routes(input as string, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });
    renderAt("/app/email-campaigns");
    expect(await screen.findByRole("heading", { level: 1, name: "Kampaně" })).toBeInTheDocument();
  });

  it("gates the Kampaně button behind verified SMTP too", async () => {
    const routes = baseRoutes({ configured: false });
    fetchMock.mockImplementation(async (input, init) => {
      const r = routes(input as string, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderAt("/app/emails");
    await user.click(await screen.findByTestId(testIds.emails.campaigns.newButton));
    expect(await screen.findByTestId(testIds.emails.campaigns.smtpPrompt)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Hromadný e-mail$/i })).toBeNull();
  });
});
