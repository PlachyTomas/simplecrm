import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const USER_ID = "00000000-0000-0000-0000-000000000001";
const PLAN_TRIAL = "00000000-0000-0000-0000-0000000000c0";
const PLAN_MONTHLY = "00000000-0000-0000-0000-0000000000c1";
const PLAN_ANNUAL = "00000000-0000-0000-0000-0000000000c2";
const PLAN_ENTERPRISE = "00000000-0000-0000-0000-0000000000c3";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ME = {
  id: USER_ID,
  email: "admin@example.cz",
  name: "Admin",
  avatar_url: null,
  role: "admin",
  can_invite: true,
  organization: {
    id: ORG_ID,
    name: "Example s.r.o.",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
  },
};

const PLANS_PUBLIC = [
  {
    id: PLAN_MONTHLY,
    code: "monthly",
    display_name_cs: "Měsíční",
    description_cs: null,
    billing_interval: "monthly",
    price_per_user_minor: 9900,
    currency: "CZK",
    is_public: true,
    is_active: true,
    sort_order: 10,
    trial_days: null,
    monthly_equivalent_minor: 9900,
    savings_minor: null,
    savings_percent: null,
  },
  {
    id: PLAN_ANNUAL,
    code: "annual",
    display_name_cs: "Roční",
    description_cs: null,
    billing_interval: "annual",
    price_per_user_minor: 99800,
    currency: "CZK",
    is_public: true,
    is_active: true,
    sort_order: 20,
    trial_days: null,
    monthly_equivalent_minor: 8317,
    savings_minor: 18900,
    savings_percent: 16,
  },
];

const BILLING_SETTINGS = {
  is_vat_payer: false,
  vat_rate_percent: "21.00",
  contact_email: "podpora@simplecrm.cz",
};

const PIPELINE = {
  stages: [
    { id: "s1", name: "Lead", position: 1, type: "open", color: "#000" },
    { id: "s2", name: "Won", position: 2, type: "won", color: "#000" },
    { id: "s3", name: "Lost", position: 3, type: "lost", color: "#000" },
  ],
};

interface VariantOpts {
  status: "trialing" | "pending_activation" | "active" | "past_due" | "canceled";
  planCode: "trial" | "monthly" | "annual" | "enterprise";
  isComp?: boolean;
  effectiveMinor?: number;
  userCount?: number;
}

function buildSubscription(opts: VariantOpts) {
  const planMap: Record<string, { id: string; display: string; interval: string }> = {
    trial: { id: PLAN_TRIAL, display: "Zkušební verze (30 dní)", interval: "trial" },
    monthly: { id: PLAN_MONTHLY, display: "Měsíční", interval: "monthly" },
    annual: { id: PLAN_ANNUAL, display: "Roční", interval: "annual" },
    enterprise: { id: PLAN_ENTERPRISE, display: "Enterprise", interval: "custom" },
  };
  const p = planMap[opts.planCode];
  return {
    id: "sub-1",
    organization_id: ORG_ID,
    plan: {
      id: p.id,
      code: opts.planCode,
      display_name_cs: p.display,
      description_cs: null,
      billing_interval: p.interval,
      price_per_user_minor: opts.effectiveMinor ?? 9900,
      currency: "CZK",
      is_public: opts.planCode !== "trial" && opts.planCode !== "enterprise",
      is_active: true,
      sort_order: 10,
      trial_days: opts.planCode === "trial" ? 30 : null,
    },
    status: opts.status,
    started_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    current_period_starts_at: new Date(Date.now() - 86400 * 1000).toISOString(),
    current_period_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    canceled_at: null,
    override_price_per_user_minor: null,
    is_comp: !!opts.isComp,
    comp_reason: opts.isComp ? "Internal partner" : null,
    notes: null,
    effective_price_per_user_minor: opts.effectiveMinor ?? 9900,
    access_status: "active",
  };
}

interface SetupOpts extends VariantOpts {
  choosePlanFails?: boolean;
}

function setupFetch(opts: SetupOpts) {
  const userCount = opts.userCount ?? 8;
  const sub = buildSubscription(opts);
  const summary = {
    organization_id: ORG_ID,
    user_count: userCount,
    effective_price_per_user_minor: opts.effectiveMinor ?? 9900,
    monthly_total_minor: userCount * 9900,
    monthly_total_with_vat_minor: userCount * 9900,
    annual_total_minor: userCount * 99800,
    annual_total_with_vat_minor: userCount * 99800,
    savings_minor: userCount * 18900,
    savings_percent: 16,
    is_vat_payer: false,
    vat_rate_percent: "21.00",
  };
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
    if (url.endsWith("/api/v1/plans/public")) return jsonResponse(PLANS_PUBLIC);
    if (url.endsWith("/api/v1/plans/billing-settings/public"))
      return jsonResponse(BILLING_SETTINGS);
    if (url.endsWith("/api/v1/organizations/current/subscription"))
      return jsonResponse(sub);
    if (url.endsWith("/api/v1/organizations/current/billing-summary"))
      return jsonResponse(summary);
    if (url.includes("/api/v1/pipeline")) return jsonResponse(PIPELINE);
    if (url.endsWith("/api/v1/organizations/current/subscription/choose-plan")) {
      calls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      if (opts.choosePlanFails) return new Response("err", { status: 500 });
      return jsonResponse({ ok: true });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function renderBillingTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake-token">
        <MemoryRouter initialEntries={["/app/nastaveni/predplatne"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Billing settings page", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("trialing → status pill + Změnit plán button; Účtování hidden (no bill yet)", async () => {
    setupFetch({ status: "trialing", planCode: "trial", userCount: 8 });
    renderBillingTab();
    // Pill says exactly "Zkušební verze"; plan name says "Zkušební verze (30 dní)".
    await waitFor(() =>
      expect(screen.getByText(/^Zkušební verze$/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Zkušební verze \(30 dní\)$/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Změnit plán$/i }),
    ).toBeInTheDocument();
    // Účtování only renders for active / past_due — there's no current bill
    // for trialing, pending, or canceled orgs.
    expect(screen.queryByRole("heading", { name: /^Účtování$/ })).toBeNull();
  });

  it("active monthly (standard) → Aktivní pill + Kontaktujte podporu, NOT self-service", async () => {
    setupFetch({ status: "active", planCode: "monthly", userCount: 8 });
    renderBillingTab();
    await waitFor(() =>
      expect(screen.getByText(/^Aktivní$/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /^Změnit plán$/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: /^Kontaktujte podporu$/i }),
    ).toHaveAttribute("href", expect.stringContaining("mailto:"));
    // Účtování shows projection (monthly active).
    expect(screen.getByText(/Pokud byste platili ročně/i)).toBeInTheDocument();
  });

  it("active annual → Aktivní pill + savings caption (no projection link)", async () => {
    setupFetch({ status: "active", planCode: "annual", userCount: 8 });
    renderBillingTab();
    await waitFor(() =>
      expect(screen.getByText(/^Aktivní$/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Šetříte/i)).toBeInTheDocument();
    expect(screen.queryByText(/Pokud byste platili ročně/i)).toBeNull();
  });

  it("comp → Komplementární pill + speciální podmínky line, no actions", async () => {
    setupFetch({ status: "active", planCode: "monthly", isComp: true });
    renderBillingTab();
    // "Komplementární" appears twice — once as the plan name, once as the pill.
    await waitFor(() =>
      expect(screen.getAllByText(/^Komplementární$/).length).toBeGreaterThanOrEqual(2),
    );
    expect(
      screen.getByText(/Vaše organizace má speciální podmínky/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Změnit plán$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Kontaktujte podporu$/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Účtování$/ })).toBeNull();
  });

  it("enterprise → Aktivní · Enterprise pill + Kontaktovat obchod, hides Účtování", async () => {
    setupFetch({ status: "active", planCode: "enterprise", effectiveMinor: 19900 });
    renderBillingTab();
    await waitFor(() =>
      expect(screen.getByText(/Aktivní · Enterprise/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("link", { name: /^Kontaktovat obchod$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Účtování$/ })).toBeNull();
  });

  it("past_due → Po splatnosti pill + Změnit plán button", async () => {
    setupFetch({ status: "past_due", planCode: "monthly" });
    renderBillingTab();
    await waitFor(() =>
      expect(screen.getByText(/Po splatnosti/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /^Změnit plán$/i }),
    ).toBeInTheDocument();
  });

  it("pending_activation → Čeká na platbu pill, no action button", async () => {
    setupFetch({ status: "pending_activation", planCode: "annual" });
    renderBillingTab();
    await waitFor(() =>
      expect(screen.getByText(/Čeká na platbu/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /^Změnit plán$/i })).toBeNull();
    expect(
      screen.getByText(/Po připsání platby vás aktivujeme do 24 hodin/i),
    ).toBeInTheDocument();
  });

  it("Faktury placeholder always renders", async () => {
    setupFetch({ status: "trialing", planCode: "trial" });
    renderBillingTab();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /^Faktury$/ })).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Faktury budou dostupné po první platbě\./i),
    ).toBeInTheDocument();
  });

  it("Účtování → Přejít na roční opens modal with annual pre-selected → POSTs choose-plan", async () => {
    // The "Přejít na roční" link is part of the Účtování card, which only
    // renders for active/past_due orgs. Active monthly is the natural case
    // — past_due triggers the same flow.
    const { calls } = setupFetch({ status: "past_due", planCode: "monthly", userCount: 8 });
    renderBillingTab();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^Přejít na roční$/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Přejít na roční$/i }));
    // Modal opens with annual pre-selected.
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /Vyberte plán/i })).toBeInTheDocument(),
    );
    const annualCard = screen.getByRole("radio", { name: /Roční/i });
    expect(annualCard).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Vybrat plán$/i }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ plan_code: "annual" });
  });

  it("Změnit plán modal opens without preselect from the main button", async () => {
    setupFetch({ status: "trialing", planCode: "trial" });
    renderBillingTab();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Změnit plán$/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /^Změnit plán$/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: /Vyberte plán/i })).toBeInTheDocument(),
    );
    const monthly = screen.getByRole("radio", { name: /Měsíční/i });
    const annual = screen.getByRole("radio", { name: /Roční/i });
    expect(monthly).toHaveAttribute("aria-checked", "false");
    expect(annual).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /^Vybrat plán$/i })).toBeDisabled();
  });
});
