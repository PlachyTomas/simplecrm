import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyActivityTab } from "@/app/companies/CompanyActivityTab";
import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeActivity(overrides: Record<string, unknown> = {}) {
  return {
    id: "act-1",
    organization_id: "org-1",
    entity_type: "deal",
    entity_id: "deal-1",
    user_id: "user-1",
    user_name: "Jan Novák",
    activity_type: "deal_created",
    payload: { deal_name: "Velký obchod" },
    created_at: "2026-08-01T09:00:00Z",
    occurred_at: "2026-08-01T09:00:00Z",
    label: null,
    can_edit: false,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter>{children}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("CompanyActivityTab", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders won in magenta and lost in danger, and nothing else", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/activities?")) {
        return jsonResponse({
          items: [
            makeActivity({
              id: "created-1",
              entity_id: "deal-created",
              activity_type: "deal_created",
              payload: { deal_name: "Nový zákazník", value: "50000" },
            }),
            makeActivity({
              id: "won-1",
              entity_id: "deal-won",
              activity_type: "deal_won",
              payload: { deal_name: "Vyhraný obchod", value: "120000", currency: "CZK" },
            }),
            makeActivity({
              id: "lost-1",
              entity_id: "deal-lost",
              activity_type: "deal_lost",
              payload: { deal_name: "Prohraný obchod", lost_reason: "Cena" },
            }),
            // Should never reach the company tab in practice (backend
            // filters via activity_types), but the row renderer must not
            // choke on — or display — anything outside the three kinds.
            makeActivity({
              id: "email-1",
              activity_type: "email_sent",
              payload: { deal_name: "Jiný obchod", subject: "Nabídka" },
            }),
          ],
          total: 4,
          limit: 50,
          offset: 0,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<CompanyActivityTab companyId="c1" />, { wrapper });

    const won = await screen.findByTestId(testIds.companies.activityRow("won-1"));
    expect(won.className).toContain("bg-win-subtle");
    const lost = screen.getByTestId(testIds.companies.activityRow("lost-1"));
    expect(lost.className).toContain("bg-danger-subtle");
    const created = screen.getByTestId(testIds.companies.activityRow("created-1"));
    // Neutral row: no win/danger wash.
    expect(created.className).not.toContain("bg-win-subtle");
    expect(created.className).not.toContain("bg-danger-subtle");

    expect(screen.queryByTestId(testIds.companies.activityRow("email-1"))).toBeNull();
    expect(screen.queryByText(/Nabídka/)).toBeNull();
  });

  it("requests exactly the three deal-lifecycle activity types", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/activities?")) {
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<CompanyActivityTab companyId="c1" />, { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const call = fetchMock.mock.calls.find(([i]) => {
      const u = typeof i === "string" ? i : (i as Request).url;
      return u.includes("/api/v1/activities?");
    });
    expect(call).toBeDefined();
    const url = new URL(
      (call![0] as string).startsWith("http")
        ? (call![0] as string)
        : `http://x${call![0] as string}`,
    );
    expect(url.searchParams.getAll("activity_types").sort()).toEqual(
      ["deal_created", "deal_lost", "deal_won"].sort(),
    );
    expect(url.searchParams.get("company_id")).toBe("c1");
  });

  it("shows the reworded empty state when there are no deal rows", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/activities?")) {
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<CompanyActivityTab companyId="c1" />, { wrapper });

    expect(
      await screen.findByText(/Zatím žádné obchody\. Až nějaký založíte nebo uzavřete/),
    ).toBeInTheDocument();
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/activities?")) {
        return jsonResponse({ detail: "boom" }, 500);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<CompanyActivityTab companyId="c1" />, { wrapper });

    expect(await screen.findByText(/Aktivity se nepodařilo načíst/)).toBeInTheDocument();
  });

  it("links the deal name to its deal detail route", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/activities?")) {
        return jsonResponse({
          items: [
            makeActivity({
              id: "won-1",
              entity_id: "deal-xyz",
              activity_type: "deal_won",
              payload: { deal_name: "Vyhraný obchod", value: "120000", currency: "CZK" },
            }),
          ],
          total: 1,
          limit: 50,
          offset: 0,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<CompanyActivityTab companyId="c1" />, { wrapper });

    const link = await screen.findByRole("link", { name: "Vyhraný obchod" });
    expect(link).toHaveAttribute("href", "/app/deals/deal-xyz");
  });
});
