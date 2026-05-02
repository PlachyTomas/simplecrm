import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const PLAN_ID = "00000000-0000-0000-0000-0000000000c1";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function meWithTrialEndingIn(daysFromNow: number) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@ex.cz",
    name: "Admin",
    avatar_url: null,
    role: "admin",
    organization: {
      id: ORG_ID,
      name: "Example s.r.o.",
      ico: "27082440",
      locale: "cs-CZ",
      currency: "CZK",
      trial_ends_at: new Date(Date.now() + daysFromNow * 86400 * 1000).toISOString(),
    },
  };
}

function trialingSubscription(endsAt: string) {
  return {
    id: "00000000-0000-0000-0000-0000000000bb",
    organization_id: ORG_ID,
    plan: {
      id: PLAN_ID,
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
    started_at: new Date().toISOString(),
    current_period_starts_at: null,
    current_period_ends_at: endsAt,
    canceled_at: null,
    override_price_per_user_minor: null,
    is_comp: false,
    comp_reason: null,
    notes: null,
    effective_price_per_user_minor: 9900,
    access_status: "trialing",
  };
}

function activeSubscription() {
  const sub = trialingSubscription(new Date(Date.now() + 30 * 86400 * 1000).toISOString());
  return { ...sub, status: "active", access_status: "active" };
}

const EMPTY_LIST = { items: [], total: 0, limit: 50, offset: 0 };

function renderShell(meDays: number, sub: ReturnType<typeof trialingSubscription> | null) {
  const me = meWithTrialEndingIn(meDays);
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(me);
    if (url.endsWith("/api/v1/organizations/current/subscription")) {
      if (!sub) return new Response("{}", { status: 404 });
      return jsonResponse(sub);
    }
    if (
      url.includes("/api/v1/companies?") ||
      url.includes("/api/v1/contacts?") ||
      url.includes("/api/v1/deals?")
    ) {
      return jsonResponse(EMPTY_LIST);
    }
    if (url.endsWith("/api/v1/reports/kpi-summary")) {
      return jsonResponse({
        currency: "CZK",
        open_deal_count: 0,
        open_pipeline_value: "0.00",
        won_this_month_count: 0,
        won_this_month_value: "0.00",
      });
    }
    if (url.includes("/api/v1/reports/leaderboard")) {
      return jsonResponse({ rows: [], currency: "CZK" });
    }
    if (url.includes("/api/v1/reports/pipeline-velocity")) {
      return jsonResponse({ stages: [], currency: "CZK" });
    }
    return jsonResponse({});
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter initialEntries={["/app"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Trial countdown badge (F3)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it(">7 days: tertiary text, no upgrade CTA", async () => {
    const endsAt = new Date(Date.now() + 20 * 86400 * 1000).toISOString();
    renderShell(20, trialingSubscription(endsAt));
    const badge = await screen.findByTestId("trial-badge");
    expect(badge).toHaveClass("text-text-tertiary");
    expect(screen.queryByRole("link", { name: /Vybrat plán/i })).toBeNull();
  });

  it("≤7 days: warning color + Vybrat plán link to /app/settings", async () => {
    const endsAt = new Date(Date.now() + 5 * 86400 * 1000).toISOString();
    renderShell(5, trialingSubscription(endsAt));
    const cta = await screen.findByRole("link", { name: /Vybrat plán/i });
    expect(cta).toHaveAttribute("href", "/app/settings");
    expect(cta).toHaveClass("font-medium");
    const badge = screen.getByTestId("trial-badge");
    expect(badge).toHaveClass("text-warning");
  });

  it("≤3 days: danger color + bolder Vybrat plán link", async () => {
    const endsAt = new Date(Date.now() + 2 * 86400 * 1000).toISOString();
    renderShell(2, trialingSubscription(endsAt));
    const cta = await screen.findByRole("link", { name: /Vybrat plán/i });
    expect(cta).toHaveClass("font-semibold");
    const badge = screen.getByTestId("trial-badge");
    expect(badge).toHaveClass("text-danger");
  });

  it("hides the badge when subscription is not trialing", async () => {
    renderShell(20, activeSubscription());
    // Wait for the shell to render and the subscription fetch to resolve;
    // once access_status='active' settles, the badge is removed.
    await waitFor(() => expect(screen.getByText(/Example s\.r\.o\./)).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("trial-badge")).toBeNull());
    expect(screen.queryByRole("link", { name: /Vybrat plán/i })).toBeNull();
  });
});
