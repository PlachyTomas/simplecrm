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

const EMPTY_LIST = { items: [], total: 0, limit: 50, offset: 0 };

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
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

describe("AddCompanyModal", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("prefills form from ARES lookup on IČO blur and saves on submit", async () => {
    const created = {
      id: "11111111-1111-1111-1111-111111111111",
      organization_id: ME_RESPONSE.organization.id,
      name: "Alza.cz a.s.",
      ico: "27082440",
      dic: "CZ27082440",
      address_street: "Jankovcova 1522/53",
      address_city: "Praha",
      address_zip: "17000",
      legal_form: "121",
      website: null,
      note: null,
      owner_user_id: null,
      last_order_at: null,
      ownership_expires_at: "2027-05-01T00:00:00+00:00",
      created_at: "2026-04-18T08:00:00+00:00",
      updated_at: "2026-04-18T08:00:00+00:00",
    };

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
      if (url.includes("/api/v1/companies/lookup-registry")) {
        return jsonResponse({
          name: "Alza.cz a.s.",
          ico: "27082440",
          dic: "CZ27082440",
          address_street: "Jankovcova 1522/53",
          address_city: "Praha",
          address_zip: "17000",
          legal_form: "121",
          registered_on: "1994-09-26",
        });
      }
      if (url.includes("/api/v1/companies?")) return jsonResponse(EMPTY_LIST);
      if (url.endsWith("/api/v1/companies") && method === "POST") {
        return jsonResponse(created, 201);
      }
      if (url.endsWith(`/api/v1/companies/${created.id}`)) return jsonResponse(created);
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const user = userEvent.setup();
    renderAt("/app/companies");

    await user.click(await screen.findByRole("button", { name: /přidat firmu/i }));
    const icoInput = await screen.findByRole("textbox", { name: /ičo/i });
    await user.type(icoInput, "27082440");
    // Blur to trigger the lookup.
    await user.tab();

    await waitFor(() => expect(screen.getByText(/Údaje doplněny z ARES\./)).toBeInTheDocument());
    expect((screen.getByRole("textbox", { name: /název firmy/i }) as HTMLInputElement).value).toBe(
      "Alza.cz a.s.",
    );
    expect((screen.getByRole("textbox", { name: /ulice/i }) as HTMLInputElement).value).toBe(
      "Jankovcova 1522/53",
    );

    await user.click(screen.getByRole("button", { name: /uložit firmu/i }));

    // On success the modal closes and we're navigated to the detail page.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /přidat firmu/i })).toBeNull());
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: /Alza\.cz a\.s\./i }),
      ).toBeInTheDocument(),
    );
  });

  it("shows a Czech 'not found' hint when lookup 404s and still lets you save", async () => {
    const created = {
      id: "22222222-2222-2222-2222-222222222222",
      organization_id: ME_RESPONSE.organization.id,
      name: "Manuální s.r.o.",
      ico: "99999999",
      dic: null,
      address_street: null,
      address_city: null,
      address_zip: null,
      legal_form: null,
      website: null,
      note: null,
      owner_user_id: null,
      last_order_at: null,
      ownership_expires_at: "2027-05-01T00:00:00+00:00",
      created_at: "2026-04-18T08:00:00+00:00",
      updated_at: "2026-04-18T08:00:00+00:00",
    };

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
      if (url.includes("/api/v1/companies/lookup-registry")) {
        return jsonResponse({ detail: "not found" }, 404);
      }
      if (url.includes("/api/v1/companies?")) return jsonResponse(EMPTY_LIST);
      if (url.endsWith("/api/v1/companies") && method === "POST") {
        return jsonResponse(created, 201);
      }
      if (url.endsWith(`/api/v1/companies/${created.id}`)) return jsonResponse(created);
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const user = userEvent.setup();
    renderAt("/app/companies");
    await user.click(await screen.findByRole("button", { name: /přidat firmu/i }));

    const icoInput = await screen.findByRole("textbox", { name: /ičo/i });
    await user.type(icoInput, "99999999");
    await user.tab();
    await waitFor(() => expect(screen.getByText(/nebylo v ARES nalezeno/i)).toBeInTheDocument());

    // Name is still editable; save should still succeed.
    await user.type(screen.getByRole("textbox", { name: /název firmy/i }), "Manuální s.r.o.");
    await user.click(screen.getByRole("button", { name: /uložit firmu/i }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /přidat firmu/i })).toBeNull());
  });

  it("shows a retry button when lookup returns 429", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
      if (url.includes("/api/v1/companies/lookup-registry")) {
        return jsonResponse({ detail: "Too many" }, 429);
      }
      if (url.includes("/api/v1/companies?")) return jsonResponse(EMPTY_LIST);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const user = userEvent.setup();
    renderAt("/app/companies");
    await user.click(await screen.findByRole("button", { name: /přidat firmu/i }));

    const icoInput = await screen.findByRole("textbox", { name: /ičo/i });
    await user.type(icoInput, "27082440");
    await user.tab();

    await waitFor(() => expect(screen.getByText(/Příliš mnoho vyhledávání/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /zkusit znovu/i })).toBeInTheDocument();
  });
});
