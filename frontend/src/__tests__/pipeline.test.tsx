import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const BOARD = {
  id: "p",
  name: "Výchozí",
  is_default: true,
  currency: "CZK",
  stages: [
    {
      id: "s1",
      name: "Nový lead",
      color: "#3D5AFE",
      position: 0,
      stage_type: "open",
      default_probability: 10,
      deal_count: 2,
      total_value: "350.00",
      currency: "CZK",
      deals: [
        {
          id: "d1",
          organization_id: ME.organization.id,
          company_id: "c",
          stage_id: "s1",
          owner_user_id: null,
          primary_contact_id: null,
          name: "První obchod",
          value: "100.00",
          currency: "CZK",
          probability_override: null,
          expected_close_date: null,
          closed_at: null,
          lost_reason: null,
          created_at: "2026-04-01T08:00:00+00:00",
          updated_at: "2026-04-01T08:00:00+00:00",
        },
        {
          id: "d2",
          organization_id: ME.organization.id,
          company_id: "c",
          stage_id: "s1",
          owner_user_id: null,
          primary_contact_id: null,
          name: "Druhý obchod",
          value: "250.00",
          currency: "CZK",
          probability_override: null,
          expected_close_date: null,
          closed_at: null,
          lost_reason: null,
          created_at: "2026-04-01T08:00:00+00:00",
          updated_at: "2026-04-01T08:00:00+00:00",
        },
      ],
    },
    {
      id: "s2",
      name: "Kontaktováno",
      color: "#5470FF",
      position: 1,
      stage_type: "open",
      default_probability: 25,
      deal_count: 0,
      total_value: "0.00",
      currency: "CZK",
      deals: [],
    },
  ],
};

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

describe("Pipeline Kanban", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders stage columns with totals and deal cards", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith("/api/v1/pipelines/default/board")) return jsonResponse(BOARD);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/pipeline");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /Pipeline/ })).toBeInTheDocument(),
    );

    const firstColumn = screen.getByRole("region", { name: /Fáze Nový lead/ });
    expect(within(firstColumn).getByText(/2 obchody/)).toBeInTheDocument();
    expect(within(firstColumn).getByText(/350,00/)).toBeInTheDocument();
    expect(within(firstColumn).getByText(/První obchod/)).toBeInTheDocument();
    expect(within(firstColumn).getByText(/Druhý obchod/)).toBeInTheDocument();

    const secondColumn = screen.getByRole("region", { name: /Fáze Kontaktováno/ });
    expect(within(secondColumn).getByText(/Zatím žádné obchody/)).toBeInTheDocument();
  });

  it("shows the Brzy hotové empty state when no deals are on the board", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith("/api/v1/pipelines/default/board")) {
        return jsonResponse({
          ...BOARD,
          stages: BOARD.stages.map((s) => ({
            ...s,
            deals: [],
            deal_count: 0,
            total_value: "0.00",
          })),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/pipeline");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /Přidejte první obchod/ }),
      ).toBeInTheDocument(),
    );
  });
});
