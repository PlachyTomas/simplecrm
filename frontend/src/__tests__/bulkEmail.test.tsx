import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

  it("opens the wizard and advances past the recipient step when SMTP is verified", async () => {
    const routes = baseRoutes(VERIFIED_SMTP);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/companies/bulk-email/recipients")) {
        return jsonResponse([
          {
            company_id: "c1",
            company_name: "ACME s.r.o.",
            default_email: "acme@x.cz",
            contacts: [],
            emailable: true,
            skip_reason: null,
          },
          {
            company_id: "c2",
            company_name: "NoEmail s.r.o.",
            default_email: null,
            contacts: [],
            emailable: false,
            skip_reason: "no_email",
          },
        ]);
      }
      const r = routes(url, init);
      if (r) return r;
      throw new Error(`Unexpected fetch: ${String(input)}`);
    });

    const user = userEvent.setup();
    renderAt("/app/companies");

    await user.click(await screen.findByRole("button", { name: /hromadný e-mail/i }));
    // Wizard opens on the recipient step and auto-resolves from the Firmy filters.
    expect(await screen.findByRole("heading", { name: /^Hromadný e-mail$/i })).toBeInTheDocument();

    // Recipient step: matched company shown, skipped one greyed with reason.
    expect(await screen.findByText(/ACME s\.r\.o\./)).toBeInTheDocument();
    expect(screen.getByText(/bez e-mailu/i)).toBeInTheDocument();

    // Default recipient pre-selected → "Další (1)" enabled.
    const next = screen.getByRole("button", { name: /další \(1\)/i });
    expect(next).toBeEnabled();
    await user.click(next);

    // Step 3: compose.
    expect(await screen.findByPlaceholderText(/nová nabídka pro/i)).toBeInTheDocument();
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

    await user.selectOptions(
      screen.getByTestId(testIds.emails.bulkWizard.industryFilter),
      "Strojírenství",
    );
    await screen.findByText(/ACME s\.r\.o\./);
    expect(resolveBodies[1]).toMatchObject({ industry: "Strojírenství" });

    // The owner select writes both fields: Nezabrané clears the owner id.
    await user.selectOptions(screen.getByTestId(testIds.emails.bulkWizard.ownerFilter), "unowned");
    await screen.findByText(/ACME s\.r\.o\./);
    expect(resolveBodies[2]).toMatchObject({
      unowned: true,
      owner_user_id: null,
      industry: "Strojírenství",
    });
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
