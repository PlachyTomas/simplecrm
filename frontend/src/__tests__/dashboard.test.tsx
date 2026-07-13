import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";

const ME = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@ex.cz",
  name: "Admin",
  avatar_url: null,
  role: "admin",
  can_invite: false,
  organization: {
    id: "00000000-0000-0000-0000-0000000000aa",
    name: "Example",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: new Date(Date.now() + 45 * 86400 * 1000).toISOString(),
  },
};

/** A default-shaped home layout: 4 KPI tiles, a quick action, velocity. */
const HOME_CONFIG = {
  version: 1,
  widgets: [
    {
      id: "default_kpi_open_deals",
      position: { x: 0, y: 0, w: 3, h: 2 },
      config: { type: "kpi_open_deals" },
    },
    {
      id: "default_kpi_pipeline_value",
      position: { x: 3, y: 0, w: 3, h: 2 },
      config: { type: "kpi_pipeline_value" },
    },
    {
      id: "default_kpi_won_month",
      position: { x: 6, y: 0, w: 3, h: 2 },
      config: { type: "kpi_won_month" },
    },
    {
      id: "default_kpi_revenue_month",
      position: { x: 9, y: 0, w: 3, h: 2 },
      config: { type: "kpi_revenue_month" },
    },
    {
      id: "default_action_new_deal",
      position: { x: 0, y: 2, w: 3, h: 1 },
      config: { type: "action_new_deal" },
    },
    {
      id: "default_velocity",
      position: { x: 0, y: 3, w: 6, h: 4 },
      config: { type: "velocity" },
    },
  ],
  mobileOrder: [],
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

describe("Dashboard widgets", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // Force the <768px path: the mobile stack avoids react-grid-layout,
    // whose container measurement needs ResizeObserver (absent in jsdom).
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 767px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it("renders the persisted widget layout with KPI values and velocity", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith("/api/v1/users/me/home-dashboard")) return jsonResponse(HOME_CONFIG);
      if (url.endsWith("/api/v1/reports/kpi-summary")) {
        return jsonResponse({
          currency: "CZK",
          open_deal_count: 7,
          open_pipeline_value: "125000.00",
          won_this_month_count: 3,
          won_this_month_value: "90000.00",
        });
      }
      if (url.includes("/api/v1/reports/pipeline-velocity")) {
        return jsonResponse({
          from_date: "2026-06-13",
          to_date: "2026-07-13",
          stages: [
            {
              stage_id: "00000000-0000-0000-0000-0000000000cc",
              stage_name: "Vyhráno",
              avg_days_in_stage: 7.5,
              deal_count: 2,
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /Vítejte zpět/i })).toBeInTheDocument(),
    );

    // KPI tiles with Intl-formatted values.
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    expect(screen.getByText(/125\s?000/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/90\s?000/)).toBeInTheDocument();

    // Quick action tile.
    expect(
      screen.getByTestId(testIds.dashboard.quickAction("action_new_deal")),
    ).toBeInTheDocument();

    // Velocity widget with the Czech decimal comma.
    await waitFor(() => expect(screen.getByText(/Průměrné trvání/i)).toBeInTheDocument());
    expect(screen.getByText(/7,5 dní/)).toBeInTheDocument();

    // Edit entry point.
    expect(screen.getByTestId(testIds.dashboard.editLayout)).toBeInTheDocument();
  });
});
