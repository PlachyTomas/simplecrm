import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const COMPANY_ID = "11111111-1111-1111-1111-111111111111";
const CONTACT_ID = "22222222-2222-2222-2222-222222222222";

const ME = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "eva@ex.cz",
  name: "Eva",
  avatar_url: null,
  role: "admin",
  organization: {
    id: ORG_ID,
    name: "Example s.r.o.",
    ico: "12345678",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: "2027-01-01T12:00:00+00:00",
  },
};

const CONTACT = {
  id: CONTACT_ID,
  organization_id: ORG_ID,
  company_id: COMPANY_ID,
  first_name: "Jana",
  last_name: "Malá",
  position: "Nákup",
  email: "jana@ostravasteel.cz",
  phone: null,
  linkedin_url: null,
  note: null,
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
};

const COMPANY = {
  id: COMPANY_ID,
  organization_id: ORG_ID,
  name: "Ostrava Steel",
  ico: "12345670",
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
  last_order_at: null,
  ownership_expires_at: "2027-05-01T00:00:00+00:00",
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
  main_contact_id: null,
  main_contact: null,
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderContacts() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter initialEntries={[`/app/contacts/${CONTACT_ID}`]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("EditContactModal", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;
  let mutations: Array<[string, string, unknown]>;

  beforeEach(() => {
    mutations = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      const path = new URL(url, "http://localhost").pathname;
      if (method !== "GET") {
        mutations.push([method, path, init?.body ? JSON.parse(init.body as string) : null]);
        return jsonResponse(CONTACT);
      }
      if (path === "/api/v1/auth/me") return jsonResponse(ME);
      if (path === `/api/v1/contacts/${CONTACT_ID}`) return jsonResponse(CONTACT);
      if (path === "/api/v1/contacts")
        return jsonResponse({ items: [CONTACT], total: 1, limit: 50, offset: 0 });
      if (path === `/api/v1/companies/${COMPANY_ID}`) return jsonResponse(COMPANY);
      return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("opens prefilled from the detail panel and submits only the changed fields", async () => {
    renderContacts();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("contacts-edit-button"));
    const firstName = await screen.findByTestId("contacts-edit-modal-first-name");
    expect(firstName).toHaveValue("Jana");
    expect(screen.getByTestId("contacts-edit-modal-last-name")).toHaveValue("Malá");

    const phone = screen.getByTestId("contacts-edit-modal-phone");
    await user.type(phone, "1234 567 890");
    const position = screen.getByTestId("contacts-edit-modal-position");
    await user.clear(position);
    await user.type(position, "Vedoucí nákupu");
    await user.click(screen.getByTestId("contacts-edit-modal-submit"));

    await waitFor(() => expect(mutations).toHaveLength(1));
    const [method, path, body] = mutations[0] as [string, string, unknown];
    expect(method).toBe("PUT");
    expect(path).toBe(`/api/v1/contacts/${CONTACT_ID}`);
    expect(body).toEqual({ phone: "1234 567 890", position: "Vedoucí nákupu" });
  });

  it("clears an optional field by sending null", async () => {
    renderContacts();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("contacts-edit-button"));
    const position = await screen.findByTestId("contacts-edit-modal-position");
    await user.clear(position);
    await user.click(screen.getByTestId("contacts-edit-modal-submit"));

    await waitFor(() => expect(mutations).toHaveLength(1));
    const [method, path, body] = mutations[0] as [string, string, unknown];
    expect(method).toBe("PUT");
    expect(path).toBe(`/api/v1/contacts/${CONTACT_ID}`);
    expect(body).toEqual({ position: null });
  });
});
