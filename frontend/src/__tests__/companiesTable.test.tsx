import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${Math.random().toString(36).slice(2, 8)}`,
    organization_id: ME.organization.id,
    name: "Alza.cz a.s.",
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
    created_at: "2026-04-10T08:00:00+00:00",
    updated_at: "2026-04-10T08:00:00+00:00",
    ...overrides,
  };
}

function renderAt(path: string, token: string | null = "fake") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken={token}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Companies table: search + sorting + tabs", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("debounces search input and passes it to the backend", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/companies?")) {
        const u = new URL(url, "http://test");
        const search = u.searchParams.get("search") ?? "";
        const items =
          search === ""
            ? [makeCompany({ name: "Alza.cz a.s." }), makeCompany({ name: "Rohlík.cz" })]
            : search.toLowerCase().includes("alza")
              ? [makeCompany({ name: "Alza.cz a.s." })]
              : [];
        return jsonResponse({ items, total: items.length, limit: 25, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/companies");
    expect(await screen.findByText(/alza\.cz a\.s\./i)).toBeInTheDocument();
    expect(screen.getByText(/rohlík\.cz/i)).toBeInTheDocument();

    const user = userEvent.setup();
    const search = screen.getByRole("searchbox", { name: /hledat firmu/i });
    await user.type(search, "Alza");

    await waitFor(() => expect(screen.queryByText(/rohlík\.cz/i)).not.toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByText(/alza\.cz a\.s\./i)).toBeInTheDocument();

    // Confirm the last fetch carried the search param.
    const lastCall = fetchMock.mock.calls.at(-1);
    const lastUrl =
      typeof lastCall?.[0] === "string" ? lastCall[0] : (lastCall?.[0] as Request).url;
    expect(lastUrl).toContain("search=Alza");
  });

  it("shows the empty state with a 'no match' message when search returns nothing", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/companies?")) {
        return jsonResponse({ items: [], total: 0, limit: 25, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/companies");
    const user = userEvent.setup();
    const search = await screen.findByRole("searchbox", { name: /hledat firmu/i });
    await user.type(search, "xyz");
    await waitFor(() =>
      expect(screen.getByText(/Žádná firma tomu neodpovídá/i)).toBeInTheDocument(),
    );
  });

  it("renders tabbed detail page and switches to Poznámky", async () => {
    const company = makeCompany({
      id: "fixed-detail-id",
      name: "Alza.cz a.s.",
      note: "Interní poznámka pro prodej.",
    });
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/companies/${company.id}`)) return jsonResponse(company);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt(`/app/companies/${company.id}`);
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /alza\.cz/i })).toBeInTheDocument(),
    );

    // Overview tab is the default — DIČ row visible.
    expect(screen.getByText(/DIČ/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /^Poznámky$/ }));
    expect(await screen.findByText(/Interní poznámka pro prodej/i)).toBeInTheDocument();
  });
});
