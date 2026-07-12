import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ME = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@ex.cz",
  name: "Admin",
  avatar_url: null,
  role: "admin",
  organization: {
    id: "00000000-0000-0000-0000-0000000000aa",
    name: "Example",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: new Date(Date.now() + 45 * 86400 * 1000).toISOString(),
  },
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    organization_id: ME.organization.id,
    company_id: "co1",
    stage_id: "st1",
    owner_user_id: null,
    primary_contact_id: null,
    name: "Velká zakázka",
    value: "42500.00",
    currency: "CZK",
    probability_override: null,
    expected_close_date: "2026-06-01",
    closed_at: null,
    lost_reason: null,
    created_at: "2026-04-01T08:00:00+00:00",
    updated_at: "2026-04-01T08:00:00+00:00",
    // Denormalized display fields (DealListItemOut) served by GET /deals.
    company_name: "Firma s.r.o.",
    company_email: null,
    stage_name: "Nový lead",
    owner_name: null,
    primary_contact_name: null,
    primary_contact_email: null,
    ...overrides,
  };
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

describe("Deals list + detail", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the deals list with currency-formatted values", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/deals?")) {
        return jsonResponse({
          items: [makeDeal({ name: "Velká zakázka", value: "42500.00" })],
          total: 1,
          limit: 50,
          offset: 0,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/deals");
    // The deal name is a button that opens the detail dialog (no standalone page).
    expect(await screen.findByRole("button", { name: /Velká zakázka/ })).toBeInTheDocument();
    // The cs-CZ currency formatter uses non-breaking spaces and "Kč" after the
    // value, with whole korunas (no haléře) per the shared @/lib/format.
    const moneyCell = await screen.findByText(/42\s?500\s?Kč/);
    expect(moneyCell).toBeInTheDocument();
  });

  it("redirects the legacy deal route to the list with the detail dialog open", async () => {
    const deal = makeDeal({ id: "open-deal", name: "Otevřený obchod" });
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/deals/${deal.id}`)) return jsonResponse(deal);
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [deal], total: 1, limit: 50, offset: 0 });
      // Detail dialog also loads company/contacts/users/board; return empties so
      // it renders without noise.
      if (url.includes("/api/v1/companies/")) return jsonResponse({ id: "co1", name: "Firma" });
      if (url.includes("/api/v1/contacts")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/users") || url.includes("/api/v1/teams"))
        return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/pipelines")) return jsonResponse({ stages: [] });
      if (url.includes("/api/v1/events")) return jsonResponse({ items: [], total: 0 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    // The retired /app/deals/:id route redirects to /app/deals?deal=:id and
    // opens the dialog (an h2, not a full page).
    renderAt(`/app/deals/${deal.id}`);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /Otevřený obchod/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Otevřeno/)).toBeInTheDocument();
  });

  it("gates the deal e-mail button behind SMTP with a link to Nastavení → Integrace", async () => {
    const deal = makeDeal({
      id: "gate-deal",
      name: "Dlouhý název obchodu který se nemá ořezávat",
    });
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/deals/${deal.id}`)) return jsonResponse(deal);
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [deal], total: 1, limit: 50, offset: 0 });
      if (url.includes("/api/v1/me/smtp")) return jsonResponse({ configured: false });
      if (url.includes("/api/v1/emails"))
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      if (url.includes("/api/v1/companies/"))
        return jsonResponse({ id: "co1", name: "Firma", email: "info@firma.cz" });
      if (url.includes("/api/v1/contacts")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/users") || url.includes("/api/v1/teams"))
        return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/pipelines")) return jsonResponse({ stages: [] });
      if (url.includes("/api/v1/events")) return jsonResponse({ items: [], total: 0 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt(`/app/deals/${deal.id}`);
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: /Dlouhý název obchodu/,
    });
    // #12: the deal name must wrap, not truncate.
    expect(heading.className).not.toContain("truncate");

    // #2: gated button is focusable (aria-disabled), not natively disabled.
    const mailButton = screen.getByRole("button", { name: /Poslat e-mail/ });
    expect(mailButton).toHaveAttribute("aria-disabled", "true");
    expect(mailButton).not.toBeDisabled();

    // Focusing reveals the popover with the fix-it link to the integrations page.
    fireEvent.focus(mailButton);
    expect(await screen.findByText(/Nejprve nastavte a ověřte SMTP/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Nastavení → Integrace/ });
    expect(link).toHaveAttribute("href", "/app/settings/integrations");
  });

  it("empty state points users at the Kanban for creating deals", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/deals");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /Zatím žádné obchody/ }),
      ).toBeInTheDocument(),
    );
  });
});
