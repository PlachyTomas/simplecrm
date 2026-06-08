import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { TrialExpiredGate } from "@/auth/TrialExpiredGate";
import type { TrialExpiredPayload } from "@/lib/api";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const ME = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@example.cz",
  name: "Admin",
  avatar_url: null,
  role: "admin",
  organization: {
    id: ORG_ID,
    name: "Example s.r.o.",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  },
};

const PLANS_PUBLIC = [
  {
    id: "plan-monthly",
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
    id: "plan-annual",
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

const TRIALING_SUB = {
  id: "sub-1",
  organization_id: ORG_ID,
  plan: PLANS_PUBLIC[0],
  status: "trialing",
  started_at: new Date().toISOString(),
  current_period_starts_at: null,
  current_period_ends_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  canceled_at: null,
  override_price_per_user_minor: null,
  is_comp: false,
  comp_reason: null,
  notes: null,
  effective_price_per_user_minor: 9900,
  access_status: "trialing",
};

const ENTERPRISE_EXPIRED_SUB = {
  ...TRIALING_SUB,
  id: "sub-ent",
  status: "past_due",
  access_status: "gated",
  plan: {
    id: "plan-ent",
    code: "enterprise",
    display_name_cs: "Enterprise",
    description_cs: null,
    billing_interval: "custom",
    price_per_user_minor: null,
    currency: "CZK",
    is_public: false,
    is_active: true,
    sort_order: 30,
    trial_days: null,
  },
};

// Org with complete, valid billing (8-digit IČO + full address) so the
// default render satisfies isBillingFormValid and the billing gate is open.
const ORG_VALID_BILLING = {
  id: ORG_ID,
  name: "Example s.r.o.",
  ico: "27082440",
  dic: "CZ27082440",
  address_street: "Pražská 1",
  address_city: "Praha",
  address_zip: "11000",
  legal_form: "s.r.o.",
  billing_name: "Example s.r.o.",
  billing_email: "faktury@example.cz",
  billing_kind: "business",
  locale: "cs-CZ",
  currency: "CZK",
  trial_ends_at: new Date(Date.now() - 86400 * 1000).toISOString(),
  stripe_customer_id: null,
  show_leaderboard_to_salespeople: false,
  ownership_window_days: 30,
};

// Same org but with no address — isBillingFormValid is false, so the
// billing gate keeps the CTA disabled.
const ORG_INVALID_BILLING = {
  ...ORG_VALID_BILLING,
  ico: null,
  dic: null,
  address_street: null,
  address_city: null,
  address_zip: null,
  billing_name: null,
  billing_email: null,
  billing_kind: null,
};

interface MockOpts {
  userCount?: number;
  enterprise?: boolean;
  choosePlanFails?: boolean;
  invalidBilling?: boolean;
}

function setupFetch(opts: MockOpts = {}) {
  const userCount = opts.userCount ?? 8;
  const sub = opts.enterprise ? ENTERPRISE_EXPIRED_SUB : TRIALING_SUB;
  const org = opts.invalidBilling ? ORG_INVALID_BILLING : ORG_VALID_BILLING;
  const summary = {
    organization_id: ORG_ID,
    user_count: userCount,
    effective_price_per_user_minor: 9900,
    monthly_total_minor: userCount * 9900,
    monthly_total_with_vat_minor: userCount * 9900,
    annual_total_minor: userCount * 99800,
    annual_total_with_vat_minor: userCount * 99800,
    savings_minor: userCount * 18900,
    savings_percent: 16,
    is_vat_payer: false,
    vat_rate_percent: "21.00",
  };
  const choosePlanCalls: Array<{ url: string; body: unknown }> = [];
  const billingPutCalls: Array<{ url: string; body: unknown }> = [];
  // Shared, ordered timeline so tests can assert the PUT save happens
  // before the payment-init POST.
  const timeline: string[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
    if (url.endsWith("/api/v1/plans/public")) return jsonResponse(PLANS_PUBLIC);
    if (url.endsWith("/api/v1/plans/billing-settings/public"))
      return jsonResponse(BILLING_SETTINGS);
    if (url.endsWith("/api/v1/organizations/current/subscription")) return jsonResponse(sub);
    if (url.endsWith("/api/v1/organizations/current/billing-summary")) return jsonResponse(summary);
    if (url.endsWith("/api/v1/organizations/current")) {
      // GET prefills the form; PUT persists billing before payment-init.
      if (init?.method === "PUT") {
        billingPutCalls.push({
          url,
          body: init.body ? JSON.parse(init.body as string) : null,
        });
        timeline.push("billing-put");
        return jsonResponse({ ...org, ...JSON.parse((init.body as string) ?? "{}") });
      }
      return jsonResponse(org);
    }
    if (url.endsWith("/api/v1/payments/initial-payment-init")) {
      choosePlanCalls.push({
        url,
        body: init?.body ? JSON.parse(init.body as string) : null,
      });
      timeline.push("payment-init");
      if (opts.choosePlanFails) return new Response("err", { status: 500 });
      return jsonResponse({
        redirect_url: "https://payments.comgate.cz/client/instructions/index?id=TEST",
        charge_id: "00000000-0000-0000-0000-000000000001",
        amount_minor: 99000,
        currency: "CZK",
      });
    }
    if (url.endsWith("/api/v1/organizations/current/subscription/contact-enterprise")) {
      return jsonResponse({ ok: true });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, choosePlanCalls, billingPutCalls, timeline };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const PAYLOAD: TrialExpiredPayload = {
  code: "subscription_required",
  current_status: "canceled",
  is_comp: false,
  can_choose_plan: true,
  ends_at: new Date(Date.now() - 86400 * 1000).toISOString(),
};

function renderGate(payloadOverride?: Partial<TrialExpiredPayload>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake-token">
        <TrialExpiredGate payload={{ ...PAYLOAD, ...payloadOverride }} onExport={() => {}} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("TrialExpiredGate", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the chooser with both plans and a disabled primary CTA", async () => {
    setupFetch();
    renderGate();
    expect(
      screen.getByRole("heading", { name: /Vaše zkušební doba skončila\./i }),
    ).toBeInTheDocument();
    const monthlyCard = await screen.findByRole("radio", { name: /Měsíční/i });
    const annualCard = await screen.findByRole("radio", { name: /Roční/i });
    expect(monthlyCard).toHaveAttribute("aria-checked", "false");
    expect(annualCard).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /^Pokračovat na platbu$/i })).toBeDisabled();
  });

  it("enables the primary CTA after selecting annual + ticking recurring-payment consent", async () => {
    setupFetch({ userCount: 8 });
    renderGate();
    const annualCard = await screen.findByRole("radio", { name: /Roční/i });
    await waitFor(() =>
      expect(within(annualCard).getByText(/S Vašimi 8 uživateli ušetříte/i)).toBeInTheDocument(),
    );
    fireEvent.click(annualCard);
    expect(annualCard).toHaveAttribute("aria-checked", "true");
    // After selecting a plan the CTA is still gated on the consent checkbox.
    expect(screen.getByRole("button", { name: /^Pokračovat na platbu$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Souhlasím s opakovanými platbami/i }));
    // Billing prefills from the org query (valid by default) on a tick.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Pokračovat na platbu$/i })).toBeEnabled(),
    );
  });

  it("keeps the CTA disabled when the org has incomplete billing details", async () => {
    setupFetch({ userCount: 8, invalidBilling: true });
    renderGate();
    const annualCard = await screen.findByRole("radio", { name: /Roční/i });
    fireEvent.click(annualCard);
    fireEvent.click(screen.getByRole("checkbox", { name: /Souhlasím s opakovanými platbami/i }));
    // Plan + consent are satisfied, but billing is invalid (no address),
    // so the gate keeps the CTA disabled. Assert it stays disabled past
    // the tick the org query/hydration would resolve on.
    await waitFor(() => expect(screen.getByTestId("billing-address-street")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Pokračovat na platbu$/i })).toBeDisabled();
  });

  it("saves billing (PUT) before initiating payment when billing is valid", async () => {
    const { billingPutCalls, choosePlanCalls, timeline } = setupFetch({ userCount: 8 });
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, assign },
    });
    try {
      renderGate();
      const annualCard = await screen.findByRole("radio", { name: /Roční/i });
      fireEvent.click(annualCard);
      fireEvent.click(screen.getByRole("checkbox", { name: /Souhlasím s opakovanými platbami/i }));
      const cta = await screen.findByRole("button", { name: /^Pokračovat na platbu$/i });
      await waitFor(() => expect(cta).toBeEnabled());
      fireEvent.click(cta);
      // Billing is persisted, then the payment-init fires — in that order.
      await waitFor(() => expect(choosePlanCalls).toHaveLength(1));
      expect(billingPutCalls).toHaveLength(1);
      expect(billingPutCalls[0]?.body).toMatchObject({
        billing_kind: "business",
        ico: "27082440",
        address_street: "Pražská 1",
      });
      expect(timeline).toEqual(["billing-put", "payment-init"]);
      expect(choosePlanCalls[0]?.body).toEqual({ plan_code: "annual" });
    } finally {
      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    }
  });

  it("uses singular instrumental for N=1", async () => {
    setupFetch({ userCount: 1 });
    renderGate();
    const annualCard = await screen.findByRole("radio", { name: /Roční/i });
    await waitFor(() =>
      expect(within(annualCard).getByText(/S Vaším 1 uživatelem ušetříte/i)).toBeInTheDocument(),
    );
  });

  it("POSTs initial-payment-init and redirects to ComGate hosted page on 200", async () => {
    const { choosePlanCalls } = setupFetch({ userCount: 8 });
    // Spy on window.location.assign — the redirect away from the SPA.
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, assign },
    });
    try {
      renderGate();
      const annualCard = await screen.findByRole("radio", { name: /Roční/i });
      fireEvent.click(annualCard);
      fireEvent.click(screen.getByRole("checkbox", { name: /Souhlasím s opakovanými platbami/i }));
      const cta = await screen.findByRole("button", { name: /^Pokračovat na platbu$/i });
      await waitFor(() => expect(cta).toBeEnabled());
      fireEvent.click(cta);
      await waitFor(() => expect(choosePlanCalls).toHaveLength(1));
      expect(choosePlanCalls[0]?.body).toEqual({ plan_code: "annual" });
      await waitFor(() =>
        expect(assign).toHaveBeenCalledWith(
          "https://payments.comgate.cz/client/instructions/index?id=TEST",
        ),
      );
    } finally {
      Object.defineProperty(window, "location", {
        writable: true,
        value: originalLocation,
      });
    }
  });

  it("shows an error and keeps the chooser visible when initial-payment-init fails", async () => {
    setupFetch({ choosePlanFails: true });
    renderGate();
    const monthlyCard = await screen.findByRole("radio", { name: /Měsíční/i });
    fireEvent.click(monthlyCard);
    fireEvent.click(screen.getByRole("checkbox", { name: /Souhlasím s opakovanými platbami/i }));
    const cta = await screen.findByRole("button", { name: /^Pokračovat na platbu$/i });
    await waitFor(() => expect(cta).toBeEnabled());
    fireEvent.click(cta);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Platební brána není dostupná/i),
    );
    // Chooser still mounted.
    expect(screen.getByRole("radio", { name: /Měsíční/i })).toBeInTheDocument();
  });

  it("renders enterprise variant with no plan cards and a Kontaktovat obchod CTA", async () => {
    setupFetch({ enterprise: true });
    renderGate();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Kontaktovat obchod$/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("radio", { name: /Měsíční/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Roční/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Vaše enterprise předplatné skončilo/i)).toBeInTheDocument();
  });

  it("renders the magenta savings badge exactly once", async () => {
    setupFetch();
    const { container } = renderGate();
    await screen.findByRole("radio", { name: /Roční/i });
    const magenta = container.querySelectorAll(".bg-brand-accent");
    expect(magenta.length).toBe(1);
  });

  it("renders nothing when payload says is_comp=true (defensive)", async () => {
    setupFetch();
    const { container } = renderGate({ is_comp: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onExport when the ghost Exportovat data button is clicked", async () => {
    setupFetch();
    const onExport = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider initialToken="fake-token">
          <TrialExpiredGate payload={PAYLOAD} onExport={onExport} />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await screen.findByRole("radio", { name: /Měsíční/i });
    fireEvent.click(screen.getByRole("button", { name: /Exportovat data/i }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard selection on radio cards", async () => {
    setupFetch();
    renderGate();
    const annualCard = await screen.findByRole("radio", { name: /Roční/i });
    annualCard.focus();
    await userEvent.keyboard(" ");
    expect(annualCard).toHaveAttribute("aria-checked", "true");
  });
});
