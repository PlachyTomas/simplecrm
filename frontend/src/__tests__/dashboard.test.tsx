import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("Dashboard KPIs", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders four KPI cards with Intl-formatted values", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith("/api/v1/reports/kpi-summary")) {
        return jsonResponse({
          currency: "CZK",
          open_deal_count: 7,
          open_pipeline_value: "125000.00",
          won_this_month_count: 3,
          won_this_month_value: "90000.00",
        });
      }
      if (url.includes("/api/v1/reports/leaderboard")) {
        return jsonResponse({
          currency: "CZK",
          from_date: "2026-03-18",
          to_date: "2026-04-17",
          rows: [
            {
              user_id: "00000000-0000-0000-0000-000000000099",
              name: "Anna",
              won_count: 2,
              won_value: "45000.00",
            },
          ],
        });
      }
      if (url.includes("/api/v1/reports/pipeline-velocity")) {
        return jsonResponse({
          from_date: "2026-03-18",
          to_date: "2026-04-17",
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
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText(/125\s?000/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/90\s?000/)).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText(/Leaderboard \(30 dní\)/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Anna/)).toBeInTheDocument();
    expect(screen.getByText(/Průměrné trvání/i)).toBeInTheDocument();
    expect(screen.getByText(/7\.5 dní/)).toBeInTheDocument();
  });
});
