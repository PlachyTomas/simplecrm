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
      company_id: "co-1",
    };
    const COMPANY = {
      id: "co-1",
      organization_id: ME.organization.id,
      name: "Asseco Central Europe",
      ico: "27074358",
      dic: null,
      address_street: null,
      address_city: null,
      address_zip: null,
      legal_form: null,
      website: null,
      note: null,
      owner_user_id: null,
      ownership_expires_at: new Date().toISOString(),
      ares_synced_at: null,
      registered_on: null,
      last_order_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/companies?")) {
        return jsonResponse({ items: [COMPANY], total: 1, limit: 25, offset: 0 });
      }
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
    await user.type(screen.getByPlaceholderText(/začněte psát název firmy/i), "Asseco");
    const companyOption = await screen.findByRole("button", { name: /Asseco Central Europe/i });
    await user.click(companyOption);
    await user.click(screen.getByRole("button", { name: /uložit kontakt/i }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /přidat kontakt/i })).toBeNull(),
    );
  });

  it("shows the company name in the list row when present", async () => {
    const withCompany = [
      { ...CONTACTS[0], company_id: "co-1", company_name: "Asseco Central Europe" },
    ];
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: withCompany, total: 1, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/contacts");
    expect(await screen.findByText(/Asseco Central Europe/)).toBeInTheDocument();
  });

  it("sends has_open_deals=true when the open-deals toggle is switched on", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/contacts");
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("contacts-open-deals-filter"));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([i]) => {
          const u = typeof i === "string" ? i : (i as Request).url;
          return u.includes("/api/v1/contacts?") && u.includes("has_open_deals=true");
        }),
      ).toBe(true),
    );
  });

  it("downloads a contacts CSV honouring the open-deals filter", async () => {
    const createUrl = vi.fn(() => "blob:contacts");
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }),
    );
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts/export.csv")) {
        return new Response("jm\u00e9no\n", {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="simplecrm-contacts-2026-07-27.csv"',
          },
        });
      }
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/contacts");
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("contacts-open-deals-filter"));
    await user.click(screen.getByTestId("contacts-export-csv"));

    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .map(([i]) => (typeof i === "string" ? i : (i as Request).url))
        .filter((u: string) => u.includes("/api/v1/contacts/export.csv"));
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain("has_open_deals=true");
    });
    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it("lets an admin delete a contact", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      if (url.endsWith("/api/v1/contacts/c1") && method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/api/v1/contacts/c1")) return jsonResponse(CONTACTS[0]);
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    renderAt("/app/contacts/c1");
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("contacts-delete-button"));
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([i, init]) => {
          const u = typeof i === "string" ? i : (i as Request).url;
          return u.endsWith("/api/v1/contacts/c1") && init?.method === "DELETE";
        }),
      ).toBe(true),
    );
    confirmSpy.mockRestore();
  });
  it("filters the list diacritic-insensitively in both directions", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/contacts");
    const user = userEvent.setup();
    const box = await screen.findByPlaceholderText(/jméno, e-mail, telefon/i);

    // Typed without diacritics, stored with them.
    await user.type(box, "svobodova");
    await waitFor(() => expect(screen.queryByText(/Jan Novák/)).toBeNull());
    expect(screen.getByText(/Jana Svobodová/)).toBeInTheDocument();

    // Typed with diacritics, matching a plain ASCII field (the e-mail) — the
    // fold has to run over the data as well as the query.
    await user.clear(box);
    await user.type(box, "Nověk");
    await waitFor(() => expect(screen.queryByText(/Jana Svobodová/)).toBeNull());
    expect(screen.queryByText(/Jan Novák/)).toBeNull();

    // And the accented query against the accented row it really belongs to.
    await user.clear(box);
    await user.type(box, "Novák");
    await waitFor(() => expect(screen.getByText(/Jan Novák/)).toBeInTheDocument());
    expect(screen.queryByText(/Jana Svobodová/)).toBeNull();
  });
  it("finds a contact by phone number regardless of spacing", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/contacts?")) {
        return jsonResponse({ items: CONTACTS, total: CONTACTS.length, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/contacts");
    const user = userEvent.setup();
    const box = await screen.findByPlaceholderText(/jméno, e-mail, telefon/i);

    // Jan Novák's number is stored as "+420 602 000 000"; typing it unspaced
    // has to find him anyway.
    await user.type(box, "602000000");
    await waitFor(() => expect(screen.queryByText(/Jana Svobodová/)).toBeNull());
    expect(screen.getByText(/Jan Novák/)).toBeInTheDocument();

    // The spacing the user actually sees on screen works too.
    await user.clear(box);
    await user.type(box, "602 000 000");
    await waitFor(() => expect(screen.getByText(/Jan Novák/)).toBeInTheDocument());
    expect(screen.queryByText(/Jana Svobodová/)).toBeNull();

    // ...as does the number with its country prefix.
    await user.clear(box);
    await user.type(box, "+420602000000");
    await waitFor(() => expect(screen.getByText(/Jan Novák/)).toBeInTheDocument());

    // A different number matches nobody.
    await user.clear(box);
    await user.type(box, "603111111");
    await waitFor(() => expect(screen.queryByText(/Jan Novák/)).toBeNull());
    expect(screen.queryByText(/Jana Svobodová/)).toBeNull();
  });
});
