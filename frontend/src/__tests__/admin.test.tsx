import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const SUPER_USER_ID = "00000000-0000-0000-0000-000000000001";
const PLAN_TRIAL = "00000000-0000-0000-0000-0000000000c0";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ME_SUPER = {
  id: SUPER_USER_ID,
  email: "super@example.cz",
  name: "Super",
  avatar_url: null,
  role: "admin",
  can_invite: true,
  is_super_admin: true,
  organization: {
    id: ORG_ID,
    name: "Example s.r.o.",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  },
};

const ME_REGULAR = {
  ...ME_SUPER,
  is_super_admin: false,
};

const TRIAL_SUB = {
  id: "sub-1",
  organization_id: ORG_ID,
  plan: {
    id: PLAN_TRIAL,
    code: "trial",
    display_name_cs: "Zkušební verze (30 dní)",
    description_cs: null,
    billing_interval: "trial",
    price_per_user_minor: 0,
    currency: "CZK",
    is_public: false,
    is_active: true,
    sort_order: 0,
    trial_days: 30,
  },
  status: "trialing",
  started_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  current_period_starts_at: null,
  current_period_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  canceled_at: null,
  override_price_per_user_minor: null,
  is_comp: false,
  comp_reason: null,
  notes: null,
  effective_price_per_user_minor: 9900,
  access_status: "trialing",
};

const ORG_LIST = {
  items: [
    {
      id: ORG_ID,
      name: "Example s.r.o.",
      plan_code: "trial",
      plan_display: "Zkušební verze (30 dní)",
      status: "trialing",
      is_comp: false,
      user_count: 8,
      trial_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      current_period_ends_at: null,
      last_activity_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    },
    {
      id: "00000000-0000-0000-0000-0000000000bb",
      name: "Foo Corp.",
      plan_code: "monthly",
      plan_display: "Měsíční",
      status: "active",
      is_comp: false,
      user_count: 12,
      trial_ends_at: new Date(Date.now() - 60 * 86400 * 1000).toISOString(),
      current_period_ends_at: new Date(Date.now() + 15 * 86400 * 1000).toISOString(),
      last_activity_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    },
  ],
  total: 2,
};

const BILLING_SETTINGS = {
  is_vat_payer: false,
  vat_rate_percent: "21.00",
  seller_iban: null,
  seller_ico: null,
  contact_email: "podpora@simplecrm.cz",
  updated_at: new Date().toISOString(),
};

interface SetupOpts {
  superAdmin?: boolean;
  searchEcho?: string[];
  activateFails?: boolean;
}

function setupFetch(opts: SetupOpts = {}) {
  const me = opts.superAdmin === false ? ME_REGULAR : ME_SUPER;
  const calls: Array<{ url: string; method?: string; body: unknown }> = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(me);
    if (url.startsWith("http://localhost:8000/api/v1/admin/organizations?")) {
      const u = new URL(url);
      const q = u.searchParams.get("q");
      if (q && opts.searchEcho) {
        opts.searchEcho.push(q);
      }
      return jsonResponse(ORG_LIST);
    }
    if (url.endsWith(`/api/v1/admin/organizations/${ORG_ID}`)) {
      return jsonResponse(TRIAL_SUB);
    }
    if (url.endsWith(`/api/v1/admin/organizations/${ORG_ID}/activity?limit=50&offset=0`)) {
      return jsonResponse({ items: [], total: 0 });
    }
    if (url.endsWith("/api/v1/admin/billing-settings") && method === "GET") {
      return jsonResponse(BILLING_SETTINGS);
    }
    if (url.endsWith("/api/v1/admin/billing-settings") && method === "PUT") {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      return jsonResponse({ ...BILLING_SETTINGS, ...body });
    }
    if (
      url.endsWith(`/api/v1/admin/organizations/${ORG_ID}/subscription/activate`) &&
      method === "POST"
    ) {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      if (opts.activateFails) return new Response("err", { status: 422 });
      return jsonResponse(TRIAL_SUB);
    }
    if (
      url.endsWith(`/api/v1/admin/organizations/${ORG_ID}/subscription/extend-trial`) &&
      method === "POST"
    ) {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      return jsonResponse(TRIAL_SUB);
    }
    if (
      url.endsWith(`/api/v1/admin/organizations/${ORG_ID}/subscription/cancel`) &&
      method === "POST"
    ) {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      return jsonResponse({ ...TRIAL_SUB, status: "canceled" });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake-token">
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Admin surface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("non-super-admin → /admin redirects (Admin heading never appears)", async () => {
    setupFetch({ superAdmin: false });
    renderAt("/admin");
    // Wait for the AppShell's sidebar to render (signals the redirect to /app
    // landed). The Admin h1 must NOT appear.
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", { name: /^Přehled$/ }).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByRole("heading", { level: 1, name: /^Admin$/ })).toBeNull();
  });

  it("super-admin → /admin renders the org list with both seeded rows", async () => {
    setupFetch();
    renderAt("/admin");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /^Admin$/ })).toBeInTheDocument(),
    );
    // The list query is async — wait for the rows to settle.
    await waitFor(() =>
      expect(screen.getByText(/^Example s\.r\.o\.$/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Foo Corp\.$/)).toBeInTheDocument();
  });

  it("search input → backend receives the q query param (debounced)", async () => {
    const echoes: string[] = [];
    setupFetch({ searchEcho: echoes });
    renderAt("/admin");
    await screen.findByRole("heading", { level: 1, name: /^Admin$/ });
    const input = screen.getByPlaceholderText(/Hledat organizaci/i);
    fireEvent.change(input, { target: { value: "Example" } });
    await waitFor(() => expect(echoes.length).toBeGreaterThan(0), { timeout: 1500 });
    expect(echoes[echoes.length - 1]).toBe("Example");
  });

  it("clicking a row opens the drawer with subscription details", async () => {
    setupFetch();
    renderAt("/admin");
    const row = await screen.findByText(/^Example s\.r\.o\.$/);
    fireEvent.click(row);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 3, name: /^Historie změn$/ }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { level: 2, name: /^Zkušební verze \(30 dní\)$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Aktivovat předplatné$/ }),
    ).toBeInTheDocument();
  });

  it("Aktivovat modal → submit fires POST with the right body", async () => {
    const { calls } = setupFetch();
    renderAt("/admin");
    fireEvent.click(await screen.findByText(/^Example s\.r\.o\.$/));
    await screen.findByRole("button", { name: /^Aktivovat předplatné$/ });
    fireEvent.click(screen.getByRole("button", { name: /^Aktivovat předplatné$/ }));
    const dialog = await screen.findByRole("dialog", {
      name: /^Aktivovat předplatné$/,
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Aktivovat$/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith("/subscription/activate"))).toBe(true),
    );
    const activateCall = calls.find((c) => c.url.endsWith("/subscription/activate"));
    expect(activateCall?.body).toEqual({ plan_code: "monthly" });
  });

  it("Zrušit předplatné modal blocks submit until typed-name matches", async () => {
    const { calls } = setupFetch();
    renderAt("/admin");
    fireEvent.click(await screen.findByText(/^Example s\.r\.o\.$/));
    await screen.findByRole("button", { name: /^Zrušit předplatné$/ });
    fireEvent.click(screen.getByRole("button", { name: /^Zrušit předplatné$/ }));
    const dialog = await screen.findByRole("dialog", {
      name: /^Zrušit předplatné$/,
    });
    const submitBtn = within(dialog).getByRole("button", {
      name: /^Zrušit předplatné$/,
    });
    expect(submitBtn).toBeDisabled();
    const typeInput = within(dialog).getByPlaceholderText("Zkušební verze (30 dní)");
    fireEvent.change(typeInput, { target: { value: "wrong" } });
    expect(submitBtn).toBeDisabled();
    fireEvent.change(typeInput, { target: { value: "Zkušební verze (30 dní)" } });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith("/subscription/cancel"))).toBe(true),
    );
  });

  it("Nastavit Enterprise cenu → live `users × override` preview updates on price change", async () => {
    setupFetch();
    renderAt("/admin");
    fireEvent.click(await screen.findByText(/^Example s\.r\.o\.$/));
    await screen.findByRole("button", { name: /^Nastavit Enterprise cenu$/ });
    fireEvent.click(screen.getByRole("button", { name: /^Nastavit Enterprise cenu$/ }));
    const dialog = await screen.findByRole("dialog", {
      name: /^Nastavit Enterprise cenu$/,
    });
    const priceInput = within(dialog).getByLabelText(/Cena za uživatele/i);
    fireEvent.change(priceInput, { target: { value: "199" } });
    // The org list seeded user_count=8; preview should be 8 × 199 = 1 592 Kč.
    const preview = await within(dialog).findByTestId("enterprise-preview");
    expect(preview.textContent).toMatch(/1\s*592\s*Kč/);
    fireEvent.change(priceInput, { target: { value: "299" } });
    await waitFor(() => {
      expect(within(dialog).getByTestId("enterprise-preview").textContent).toMatch(
        /2\s*392\s*Kč/,
      );
    });
  });

  it("Prodloužit zkušební dobu → preview ends_at updates as days change", async () => {
    setupFetch();
    renderAt("/admin");
    fireEvent.click(await screen.findByText(/^Example s\.r\.o\.$/));
    await screen.findByRole("button", { name: /^Prodloužit zkušební dobu$/ });
    fireEvent.click(screen.getByRole("button", { name: /^Prodloužit zkušební dobu$/ }));
    const dialog = await screen.findByRole("dialog", {
      name: /^Prodloužit zkušební dobu$/,
    });
    const preview = await within(dialog).findByTestId("extend-preview");
    const before = preview.textContent;
    const daysInput = within(dialog).getByLabelText(/Počet dní/i);
    fireEvent.change(daysInput, { target: { value: "60" } });
    await waitFor(() => {
      const after = within(dialog).getByTestId("extend-preview").textContent;
      expect(after).not.toBe(before);
    });
  });

  it("Nastavení tab → toggle Jsem plátce DPH → PUT body reflects the new value", async () => {
    const { calls } = setupFetch();
    renderAt("/admin");
    fireEvent.click(
      await screen.findByRole("tab", { name: /^Nastavení$/ }),
    );
    const checkbox = await screen.findByLabelText(/Jsem plátce DPH/i);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: /^Uložit$/ }));
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith("/admin/billing-settings"))).toBe(true),
    );
    const putCall = calls.find(
      (c) => c.url.endsWith("/admin/billing-settings") && c.method === "PUT",
    );
    expect(putCall?.body).toMatchObject({ is_vat_payer: true });
  });

  it("AppShell user menu shows the gear icon for super-admins, hidden for regular", async () => {
    setupFetch({ superAdmin: true });
    renderAt("/app");
    // The gear is rendered inside AppShell's header — wait for the sidebar
    // first to confirm AppShell mounted.
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", { name: /^Přehled$/ }).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.getByTestId("admin-gear")).toBeInTheDocument();
  });

  it("AppShell hides the gear icon for non-super-admins", async () => {
    setupFetch({ superAdmin: false });
    renderAt("/app");
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", { name: /^Přehled$/ }).length,
      ).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId("admin-gear")).toBeNull();
  });
});
