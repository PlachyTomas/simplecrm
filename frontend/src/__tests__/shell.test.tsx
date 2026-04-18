import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ME_RESPONSE = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@ex.cz",
  name: "Admin",
  avatar_url: null,
  role: "admin",
  organization: {
    id: "00000000-0000-0000-0000-0000000000aa",
    name: "Example s.r.o.",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    // 45 days ahead so the trial-badge class is neutral.
    trial_ends_at: new Date(Date.now() + 45 * 86400 * 1000).toISOString(),
  },
};

const EMPTY_LIST = { items: [], total: 0, limit: 50, offset: 0 };

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderAt(path: string, token: string | null = "fake") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken={token}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Responsive app shell", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME_RESPONSE);
      if (
        url.includes("/api/v1/companies?") ||
        url.includes("/api/v1/contacts?") ||
        url.includes("/api/v1/deals?")
      )
        return jsonResponse(EMPTY_LIST);
      if (url.includes("/api/v1/pipelines/default/board")) {
        return jsonResponse({
          id: "p",
          name: "Výchozí",
          is_default: true,
          currency: "CZK",
          stages: [],
        });
      }
      if (url.endsWith("/api/v1/pipelines/default")) {
        return jsonResponse({
          id: "p",
          name: "Výchozí",
          is_default: true,
          stages: [],
        });
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
      throw new Error(`Unexpected fetch: ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders desktop sidebar with primary destinations", async () => {
    renderAt("/app");
    const sidebar = await screen.findByRole("navigation", { name: /hlavní navigace/i });
    for (const label of ["Přehled", "Pipeline", "Firmy", "Kontakty", "Obchody"]) {
      expect(
        within(sidebar).getByRole("link", { name: new RegExp(label, "i") }),
      ).toBeInTheDocument();
    }
    expect(within(sidebar).getByRole("button", { name: /odhlásit se/i })).toBeInTheDocument();
  });

  it("renders mobile bottom tab bar", async () => {
    renderAt("/app");
    const tabBar = await screen.findByRole("navigation", { name: /spodní navigace/i });
    for (const label of ["Přehled", "Pipeline", "Firmy", "Kontakty", "Více"]) {
      expect(
        within(tabBar).getByRole("link", { name: new RegExp(label, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("renders the Nastavení pipeline page for admins", async () => {
    renderAt("/app/settings");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: /^Nastavení pipeline$/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /přidat fázi/i })).toBeInTheDocument();
  });

  it("renders the Více menu at /app/more", async () => {
    renderAt("/app/more");
    const main = await screen.findByRole("main");
    await waitFor(() =>
      expect(within(main).getByRole("heading", { level: 1, name: /^Více$/ })).toBeInTheDocument(),
    );
    expect(within(main).getByRole("link", { name: /obchody/i })).toHaveAttribute(
      "href",
      "/app/deals",
    );
    expect(within(main).getByRole("button", { name: /odhlásit se/i })).toBeInTheDocument();
  });
});
