import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const RESULTS = {
  companies: [{ id: "co1", name: "Brno IT", subtitle: "10000001" }],
  contacts: [{ id: "c1", name: "Jan Novák", subtitle: "Brno IT" }],
  deals: [{ id: "d1", name: "Refresh hardwaru", subtitle: "Brno IT" }],
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderApp(path = "/app") {
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

describe("Global search", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  const COMPANY = {
    id: "co1",
    organization_id: ME.organization.id,
    name: "Brno IT",
    ico: "10000001",
    dic: null,
    address_street: null,
    address_city: null,
    address_zip: null,
    legal_form: null,
    website: null,
    email: null,
    phone: null,
    industry: null,
    note: null,
    owner_user_id: null,
    main_contact_id: null,
    main_contact: null,
    ownership_expires_at: new Date().toISOString(),
    ares_synced_at: null,
    registered_on: null,
    last_order_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const CONTACT = {
    id: "c1",
    organization_id: ME.organization.id,
    company_id: "co1",
    company_name: "Brno IT",
    first_name: "Jan",
    last_name: "Novák",
    position: null,
    email: null,
    phone: null,
    linkedin_url: null,
    note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  function mockSearch(results: unknown = RESULTS) {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/search?")) return jsonResponse(results);
      // The two navigation targets need real rows — the detail pages render
      // their fields directly off the response.
      if (url.includes("/api/v1/companies/co1")) return jsonResponse(COMPANY);
      if (url.includes("/api/v1/contacts/c1")) return jsonResponse(CONTACT);
      // Everything else the shell pulls in — empty pages keep the dropdown
      // the only thing under test.
      return jsonResponse({ items: [], total: 0, limit: 25, offset: 0 });
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("holds the query until the minimum length, then groups the hits by entity", async () => {
    mockSearch();
    renderApp();
    const user = userEvent.setup();
    const input = await screen.findByTestId("global-search-input");

    await user.type(input, "B");
    // One character is below the minimum — nothing is asked of the server.
    await waitFor(() => expect(searchCalls()).toHaveLength(0));

    await user.type(input, "rno");
    const panel = await screen.findByTestId("global-search-panel");
    // One row per entity. "Brno IT" is also the *subtitle* of the contact and
    // deal hits, so the rows are matched by testid rather than by text.
    expect(await screen.findByTestId("global-search-option-co1")).toHaveTextContent("Brno IT");
    expect(screen.getByTestId("global-search-option-c1")).toHaveTextContent("Jan Novák");
    expect(screen.getByTestId("global-search-option-d1")).toHaveTextContent("Refresh hardwaru");
    // Group headings, one per entity type — scoped to the dropdown because the
    // sidebar nav carries the same words.
    expect(within(panel).getByText("Firmy")).toBeInTheDocument();
    expect(within(panel).getByText("Kontakty")).toBeInTheDocument();
    expect(within(panel).getByText("Obchody")).toBeInTheDocument();
    await waitFor(() => expect(searchCalls().length).toBeGreaterThan(0));
    expect(searchCalls()[0]).toContain("q=Brno");
  });

  it("navigates to the company detail when a hit is clicked", async () => {
    mockSearch();
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByTestId("global-search-input"), "Brno");

    await user.click(await screen.findByTestId("global-search-option-co1"));

    // The company detail page issues its own fetch for the clicked row.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([i]) => {
          const u = typeof i === "string" ? i : (i as Request).url;
          return u.includes("/api/v1/companies/co1");
        }),
      ).toBe(true),
    );
    // Dropdown closes behind the navigation.
    expect(screen.queryByTestId("global-search-panel")).toBeNull();
  });

  it("opens the highlighted hit on Enter after arrowing down", async () => {
    mockSearch();
    renderApp();
    const user = userEvent.setup();
    const input = await screen.findByTestId("global-search-input");
    await user.type(input, "Brno");
    await screen.findByTestId("global-search-panel");

    // Two ArrowDowns lands on the contact (companies → contacts).
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([i]) => {
          const u = typeof i === "string" ? i : (i as Request).url;
          return u.includes("/api/v1/contacts/c1");
        }),
      ).toBe(true),
    );
  });

  it("shows the empty state when nothing matches", async () => {
    mockSearch({ companies: [], contacts: [], deals: [] });
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByTestId("global-search-input"), "zzzz");

    expect(await screen.findByText("Nic nenalezeno")).toBeInTheDocument();
  });

  function searchCalls(): string[] {
    return fetchMock.mock.calls
      .map(([i]) => (typeof i === "string" ? i : (i as Request).url))
      .filter((u: string) => u.includes("/api/v1/search?"));
  }
});
