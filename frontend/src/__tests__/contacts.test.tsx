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

const CONTACTS = [
  {
    id: "c1",
    organization_id: ME.organization.id,
    company_id: null,
    first_name: "Jan",
    last_name: "Novák",
    position: "CFO",
    email: "jan@example.cz",
    phone: "+420 602 000 000",
    linkedin_url: null,
    note: null,
    created_at: "2026-04-01T08:00:00+00:00",
    updated_at: "2026-04-01T08:00:00+00:00",
  },
  {
    id: "c2",
    organization_id: ME.organization.id,
    company_id: null,
    first_name: "Jana",
    last_name: "Svobodová",
    position: null,
    email: null,
    phone: null,
    linkedin_url: null,
    note: "Připomenout za dva týdny.",
    created_at: "2026-04-02T08:00:00+00:00",
    updated_at: "2026-04-02T08:00:00+00:00",
  },
];

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

describe("Contacts split-view", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the contact list and shows the 'select a contact' empty state", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/contacts");

    expect(await screen.findByText(/Jan Novák/)).toBeInTheDocument();
    expect(screen.getByText(/Jana Svobodová/)).toBeInTheDocument();
    expect(screen.getByText(/Vyberte kontakt/i)).toBeInTheDocument();
  });

  it("loads a contact into the detail panel when a list row is clicked", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      if (url.endsWith("/api/v1/contacts/c2")) return jsonResponse(CONTACTS[1]);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/contacts");
    const user = userEvent.setup();
    const row = await screen.findByRole("button", { name: /Jana Svobodová/ });
    await user.click(row);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: /Jana Svobodová/ })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Připomenout za dva týdny/)).toBeInTheDocument();
  });

  it("creates a contact through the modal and closes", async () => {
    const created = {
      ...CONTACTS[0],
      id: "new-contact-id",
      first_name: "Petr",
      last_name: "Svoboda",
      email: "petr@example.cz",
    };
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      if (url.endsWith("/api/v1/contacts") && method === "POST") {
        return jsonResponse(created, 201);
      }
      if (url.endsWith(`/api/v1/contacts/${created.id}`)) return jsonResponse(created);
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    renderAt("/app/contacts");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /přidat kontakt/i }));

    await user.type(screen.getByRole("textbox", { name: /jméno/i }), "Petr");
    await user.type(screen.getByRole("textbox", { name: /příjmení/i }), "Svoboda");
    await user.click(screen.getByRole("button", { name: /uložit kontakt/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /přidat kontakt/i })).toBeNull(),
    );
  });
});
