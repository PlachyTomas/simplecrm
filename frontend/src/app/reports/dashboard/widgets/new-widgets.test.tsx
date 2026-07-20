import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";

import type { GlobalFilters, WidgetEntry } from "@/app/reports/dashboard/types";
import { WidgetByType } from "@/app/reports/dashboard/widgets/WidgetByType";

function entryOf(type: string): WidgetEntry {
  return {
    id: `w_${type}`,
    position: { x: 0, y: 0, w: 3, h: 2 },
    config: { type } as WidgetEntry["config"],
  };
}

const filters: GlobalFilters = {
  dateRange: { preset: "last_30_days" },
  teamId: null,
  ownerUserId: null,
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("new report widgets", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function renderWidget(entry: WidgetEntry) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <AuthProvider initialToken="fake">
          <MemoryRouter>
            <WidgetByType
              entry={entry}
              globalFilters={filters}
              isEditMode={false}
              onRemove={vi.fn()}
            />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  it("renders the weighted pipeline KPI with the unweighted hint", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        value: "120000.00",
        open_value: "340000.00",
        currency: "CZK",
        comparison: null,
      }),
    );
    renderWidget(entryOf("weighted_pipeline"));
    await waitFor(() => expect(screen.getByText(/120\s?000/)).toBeInTheDocument());
    expect(screen.getByText("Vážená hodnota pipeline")).toBeInTheDocument();
    expect(screen.getByText(/340\s?000/)).toBeInTheDocument();
  });

  it("renders forecast buckets, hiding zero overflow rows", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        buckets: [
          {
            kind: "overdue",
            year_month: null,
            count: 1,
            value: "200.00",
            weighted_value: "100.00",
          },
          { kind: "month", year_month: "2026-07", count: 0, value: "0", weighted_value: "0" },
          {
            kind: "month",
            year_month: "2026-08",
            count: 1,
            value: "500.00",
            weighted_value: "250.00",
          },
          { kind: "month", year_month: "2026-09", count: 0, value: "0", weighted_value: "0" },
          { kind: "month", year_month: "2026-10", count: 0, value: "0", weighted_value: "0" },
          { kind: "month", year_month: "2026-11", count: 0, value: "0", weighted_value: "0" },
          { kind: "month", year_month: "2026-12", count: 0, value: "0", weighted_value: "0" },
          { kind: "later", year_month: null, count: 0, value: "0", weighted_value: "0" },
          { kind: "no_date", year_month: null, count: 1, value: "40.00", weighted_value: "10.00" },
        ],
        currency: "CZK",
        total_value: "740.00",
        total_weighted_value: "360.00",
      }),
    );
    renderWidget(entryOf("sales_forecast"));
    await waitFor(() => expect(screen.getByText("Po termínu")).toBeInTheDocument());
    expect(screen.getByText("Odhad prodeje")).toBeInTheDocument();
    expect(screen.getByText("srpen 2026")).toBeInTheDocument();
    expect(screen.getByText("Bez termínu")).toBeInTheDocument();
    // "Později" has zero deals → hidden.
    expect(screen.queryByText("Později")).not.toBeInTheDocument();
  });

  it("shows the forecast empty state when there are no open deals", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        buckets: [
          { kind: "overdue", year_month: null, count: 0, value: "0", weighted_value: "0" },
          { kind: "month", year_month: "2026-07", count: 0, value: "0", weighted_value: "0" },
          { kind: "later", year_month: null, count: 0, value: "0", weighted_value: "0" },
          { kind: "no_date", year_month: null, count: 0, value: "0", weighted_value: "0" },
        ],
        currency: "CZK",
        total_value: "0",
        total_weighted_value: "0",
      }),
    );
    renderWidget(entryOf("sales_forecast"));
    await waitFor(() =>
      expect(screen.getByText("Žádné otevřené obchody k předpovědi.")).toBeInTheDocument(),
    );
  });

  it("shows a fill-in-dates nudge when no open deal has a close date", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        buckets: [
          { kind: "overdue", year_month: null, count: 0, value: "0", weighted_value: "0" },
          { kind: "month", year_month: "2026-07", count: 0, value: "0", weighted_value: "0" },
          { kind: "later", year_month: null, count: 0, value: "0", weighted_value: "0" },
          { kind: "no_date", year_month: null, count: 3, value: "900.00", weighted_value: "90.00" },
        ],
        currency: "CZK",
        total_value: "900.00",
        total_weighted_value: "90.00",
      }),
    );
    renderWidget(entryOf("sales_forecast"));
    await waitFor(() =>
      expect(screen.getByText(/nemají předpokládané datum uzavření/)).toBeInTheDocument(),
    );
    // No zero-month bars rendered as chart rows.
    expect(screen.queryByText("červenec 2026")).not.toBeInTheDocument();
  });

  it("renders won vs paid with the paid share hint", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        won_count: 2,
        paid_count: 1,
        won_value: "700.00",
        paid_value: "300.00",
        unpaid_value: "400.00",
        paid_pct: 42.857,
        currency: "CZK",
      }),
    );
    renderWidget(entryOf("won_vs_paid"));
    await waitFor(() => expect(screen.getByText(/1 z 2 obchodů zaplaceno/)).toBeInTheDocument());
    expect(screen.getByText("Vyhráno vs. zaplaceno")).toBeInTheDocument();
  });

  it("shows the won-vs-paid empty state when nothing was won", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        won_count: 0,
        paid_count: 0,
        won_value: "0",
        paid_value: "0",
        unpaid_value: "0",
        paid_pct: null,
        currency: "CZK",
      }),
    );
    renderWidget(entryOf("won_vs_paid"));
    await waitFor(() =>
      expect(screen.getByText("V tomto období nejsou žádné vyhrané obchody.")).toBeInTheDocument(),
    );
  });
});
