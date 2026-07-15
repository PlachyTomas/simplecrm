import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";

import { HomeWidgetByType } from "@/app/dashboard/HomeWidgetByType";
import type { HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";

function entryOf(type: string): HomeWidgetEntry {
  return {
    id: `w_${type}`,
    position: { x: 0, y: 0, w: 3, h: 2 },
    config: { type } as HomeWidgetEntry["config"],
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HomeWidgetByType", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/reports/kpi-summary")) {
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
            { stage_id: "s1", stage_name: "Kvalifikace", avg_days_in_stage: 7.5, deal_count: 2 },
          ],
        });
      }
      if (url.includes("/api/v1/reports/widgets/stale-deals")) {
        return jsonResponse({ items: [] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function renderWidget(
    entry: HomeWidgetEntry,
    overrides: Partial<React.ComponentProps<typeof HomeWidgetByType>> = {},
  ) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <AuthProvider initialToken="fake">
          <MemoryRouter>
            <HomeWidgetByType
              entry={entry}
              isEditMode={false}
              onRemove={vi.fn()}
              onConfigOpen={vi.fn()}
              onAction={vi.fn()}
              {...overrides}
            />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  it("renders a KPI tile from the shared summary", async () => {
    renderWidget(entryOf("kpi_open_deals"));
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    expect(screen.getByText("Otevřené obchody")).toBeInTheDocument();
  });

  it("renders the revenue KPI with the money format", async () => {
    renderWidget(entryOf("kpi_revenue_month"));
    await waitFor(() => expect(screen.getByText(/90\s?000/)).toBeInTheDocument());
    expect(screen.getByText("Výnosy tento měsíc")).toBeInTheDocument();
  });

  it("renders a quick-action tile that fires onAction", async () => {
    const onAction = vi.fn();
    renderWidget(entryOf("action_new_company"), { onAction });
    const tile = screen.getByTestId(testIds.dashboard.quickAction("action_new_company"));
    expect(tile).toHaveTextContent("Nová firma");
    await userEvent.click(tile);
    expect(onAction).toHaveBeenCalledWith("action_new_company");
  });

  it("does not fire quick actions in edit mode", async () => {
    const onAction = vi.fn();
    renderWidget(entryOf("action_new_deal"), { onAction, isEditMode: true });
    await userEvent.click(screen.getByTestId(testIds.dashboard.quickAction("action_new_deal")));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("renders the velocity list with the Czech decimal format", async () => {
    renderWidget(entryOf("velocity"));
    await waitFor(() => expect(screen.getByText("Kvalifikace")).toBeInTheDocument());
    expect(screen.getByText("Průměrné trvání obchodu")).toBeInTheDocument();
    expect(screen.getByText(/7,5 dní/)).toBeInTheDocument();
  });

  it("delegates reports types to the shared renderer with synthesized filters", async () => {
    renderWidget(entryOf("stale_deals"));
    // Frame label comes from the reports catalog.
    await waitFor(() => expect(screen.getByText("Stagnující obchody")).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([input]) =>
      String(typeof input === "string" ? input : (input as Request).url).includes("stale-deals"),
    );
    expect(call).toBeDefined();
    const url = String(typeof call![0] === "string" ? call![0] : (call![0] as Request).url);
    // Synthesized last_30_days range → absolute from/to params, no team/owner.
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);
    expect(url).toMatch(/to=\d{4}-\d{2}-\d{2}/);
    expect(url).not.toContain("team_id");
    expect(url).not.toContain("owner_user_id");
  });

  it("shows the edit-mode config gear on reports widgets", () => {
    renderWidget(entryOf("stale_deals"), { isEditMode: true });
    // The gear rides WidgetFrame's onConfigClick slot (no testid of its own).
    expect(screen.getByRole("button", { name: "Nastavení widgetu" })).toBeInTheDocument();
  });
});
