import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const ADMIN_ID = "00000000-0000-0000-0000-000000000001";
const SALES_ID = "00000000-0000-0000-0000-000000000002";
const COMPANY_ID = "11111111-1111-1111-1111-111111111111";

function meResponse(role: "admin" | "salesperson") {
  return {
    id: role === "admin" ? ADMIN_ID : SALES_ID,
    email: "eva@ex.cz",
    name: "Eva",
    avatar_url: null,
    role,
    organization: {
      id: ORG_ID,
      name: "Example s.r.o.",
      ico: "12345678",
      locale: "cs-CZ",
      currency: "CZK",
      trial_ends_at: "2027-01-01T12:00:00+00:00",
    },
  };
}

const USERS_PAGE = {
  items: [
    {
      id: ADMIN_ID,
      email: "eva@ex.cz",
      name: "Eva",
      avatar_url: null,
      role: "admin",
      team_id: null,
      can_invite: true,
      is_active: true,
      max_owned_companies: null,
      last_login_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
    },
    {
      id: SALES_ID,
      email: "petr@ex.cz",
      name: "Petr",
      avatar_url: null,
      role: "salesperson",
      team_id: null,
      can_invite: false,
      is_active: true,
      max_owned_companies: null,
      last_login_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
    },
  ],
  total: 2,
  limit: 100,
  offset: 0,
};

const COMPANY = {
  id: COMPANY_ID,
  organization_id: ORG_ID,
  name: "Ostrava Steel",
  ico: "12345670",
  dic: "CZ12345670",
  address_street: "Dlouhá 1",
  address_city: "Ostrava",
  address_zip: "70200",
  legal_form: "s.r.o.",
  website: null,
  email: null,
  phone: null,
  industry: "Výroba",
  note: null,
  owner_user_id: ADMIN_ID,
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

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter initialEntries={[`/app/companies/${COMPANY_ID}`]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("EditCompanyModal", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;
  /** Captured mutation requests: [method, path, parsed body]. */
  let mutations: Array<[string, string, unknown]>;

  function installFetch(role: "admin" | "salesperson") {
    mutations = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      const path = new URL(url, "http://localhost").pathname;
      if (method !== "GET") {
        mutations.push([method, path, init?.body ? JSON.parse(init.body as string) : null]);
        if (path.endsWith("/reassign") || path.endsWith("/free") || method === "PUT") {
          return jsonResponse(COMPANY);
        }
      }
      if (path === "/api/v1/auth/me") return jsonResponse(meResponse(role));
      if (path === `/api/v1/companies/${COMPANY_ID}`) return jsonResponse(COMPANY);
      if (path === "/api/v1/users") return jsonResponse(USERS_PAGE);
      return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("opens prefilled from the header and submits only the changed fields", async () => {
    installFetch("admin");
    renderDetail();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("companies-edit-button"));
    const nameInput = await screen.findByTestId("companies-edit-modal-name");
    expect(nameInput).toHaveValue("Ostrava Steel");
    expect(screen.getByTestId("companies-edit-modal-ico")).toHaveValue("12345670");

    const phoneInput = screen.getByTestId("companies-edit-modal-phone");
    await user.type(phoneInput, "1234 567 890");
    await user.click(screen.getByTestId("companies-edit-modal-submit"));

    await waitFor(() => expect(mutations).toHaveLength(1));
    const [method, path, body] = mutations[0] as [string, string, unknown];
    expect(method).toBe("PUT");
    expect(path).toBe(`/api/v1/companies/${COMPANY_ID}`);
    expect(body).toEqual({ phone: "1234 567 890" });
  });

  it("reassigns ownership through the reassign endpoint when the owner changes", async () => {
    installFetch("admin");
    renderDetail();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("companies-edit-button"));
    const ownerSelect = await screen.findByTestId("companies-edit-modal-owner");
    await user.selectOptions(ownerSelect, SALES_ID);
    await user.click(screen.getByTestId("companies-edit-modal-submit"));

    await waitFor(() => expect(mutations).toHaveLength(1));
    const [method, path, body] = mutations[0] as [string, string, unknown];
    expect(method).toBe("POST");
    expect(path).toBe(`/api/v1/companies/${COMPANY_ID}/reassign`);
    expect(body).toEqual({ new_owner_user_id: SALES_ID });
  });

  it("releases to the shared pool through the free endpoint", async () => {
    installFetch("admin");
    renderDetail();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("companies-edit-button"));
    const ownerSelect = await screen.findByTestId("companies-edit-modal-owner");
    await user.selectOptions(ownerSelect, "");
    await user.click(screen.getByTestId("companies-edit-modal-submit"));

    await waitFor(() => expect(mutations).toHaveLength(1));
    const [method, path] = mutations[0] as [string, string, unknown];
    expect(method).toBe("POST");
    expect(path).toBe(`/api/v1/companies/${COMPANY_ID}/free`);
  });

  it("hides the owner control from salespeople", async () => {
    installFetch("salesperson");
    renderDetail();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("companies-edit-button"));
    await screen.findByTestId("companies-edit-modal-name");
    expect(screen.queryByTestId("companies-edit-modal-owner")).not.toBeInTheDocument();
  });
});
