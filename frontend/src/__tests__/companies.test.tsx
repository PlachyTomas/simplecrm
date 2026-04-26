import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

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

function makeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    organization_id: ME_RESPONSE.organization.id,
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
    created_at: "2026-04-15T08:00:00+00:00",
    updated_at: "2026-04-15T08:00:00+00:00",
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderAt(initialPath: string, options: { token?: string | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken={options.token ?? null}>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Companies screens", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders companies list rows at /app/companies", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
      if (url.includes("/api/v1/companies?")) {
        return jsonResponse({
          items: [
            makeCompany({ name: "Alza.cz a.s." }),
            makeCompany({
              id: "22222222-2222-2222-2222-222222222222",
              name: "Rohlík.cz",
              ico: "24253820",
            }),
          ],
          total: 2,
          limit: 50,
          offset: 0,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/companies", { token: "fake" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /^firmy$/i })).toBeInTheDocument(),
    );
    // jsdom renders both the desktop table AND the mobile card stack —
    // CSS `hidden md:table` doesn't actually mask in jsdom — so each
    // row appears twice. Just assert >=1 occurrence.
    expect((await screen.findAllByText(/alza\.cz a\.s\./i)).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/rohlík\.cz/i)).length).toBeGreaterThanOrEqual(1);
  });

  it("renders empty state when list is empty", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
      if (url.includes("/api/v1/companies?")) {
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/companies", { token: "fake" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Přidejte první firmu/i })).toBeInTheDocument(),
    );
  });

  it("navigates to the detail page when a row is clicked", async () => {
    const company = makeCompany({ ico: "27082440", address_city: "Praha" });
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
      if (url.includes("/api/v1/companies?")) {
        return jsonResponse({ items: [company], total: 1, limit: 50, offset: 0 });
      }
      if (url.endsWith(`/api/v1/companies/${company.id}`)) {
        return jsonResponse(company);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/companies", { token: "fake" });
    // jsdom renders both desktop and mobile lists — pick the first instance.
    const matches = await screen.findAllByText(/alza\.cz a\.s\./i);
    const user = userEvent.setup();
    await user.click(matches[0]);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /alza\.cz/i })).toBeInTheDocument(),
    );
    // IČO rendered in a mono label on the detail header.
    expect(screen.getAllByText(/27082440/).length).toBeGreaterThan(0);
  });
});
