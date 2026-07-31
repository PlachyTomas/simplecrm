import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    organization_id: ME.organization.id,
    company_id: "co1",
    stage_id: "st1",
    owner_user_id: null,
    primary_contact_id: null,
    name: "Velká zakázka",
    value: "42500.00",
    currency: "CZK",
    probability_override: null,
    expected_close_date: "2026-06-01",
    closed_at: null,
    lost_reason: null,
    created_at: "2026-04-01T08:00:00+00:00",
    updated_at: "2026-04-01T08:00:00+00:00",
    // Denormalized display fields (DealListItemOut) served by GET /deals.
    company_name: "Firma s.r.o.",
    company_email: null,
    stage_name: "Nový lead",
    owner_name: null,
    primary_contact_name: null,
    primary_contact_email: null,
    ...overrides,
  };
}

/** GET /activities response for the deal-detail Průběh section. */
function activitiesPage(items: unknown[], total = items.length) {
  return { items, total, limit: 20, offset: 0 };
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

describe("Deals list + detail", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the deals list with currency-formatted values", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/deals?")) {
        return jsonResponse({
          items: [makeDeal({ name: "Velká zakázka", value: "42500.00" })],
          total: 1,
          limit: 50,
          offset: 0,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/deals");
    // The deal name is a button that opens the detail dialog (no standalone page).
    expect(await screen.findByRole("button", { name: /Velká zakázka/ })).toBeInTheDocument();
    // The cs-CZ currency formatter uses non-breaking spaces and "Kč" after the
    // value, with whole korunas (no haléře) per the shared @/lib/format.
    const moneyCell = await screen.findByText(/42\s?500\s?Kč/);
    expect(moneyCell).toBeInTheDocument();
  });

  it("redirects the legacy deal route to the list with the detail dialog open", async () => {
    const deal = makeDeal({ id: "open-deal", name: "Otevřený obchod" });
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/deals/${deal.id}`)) return jsonResponse(deal);
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [deal], total: 1, limit: 50, offset: 0 });
      // Detail dialog also loads company/contacts/users/board; return empties so
      // it renders without noise.
      if (url.includes("/api/v1/companies/")) return jsonResponse({ id: "co1", name: "Firma" });
      if (url.includes("/api/v1/contacts")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/users") || url.includes("/api/v1/teams"))
        return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/pipelines")) return jsonResponse({ stages: [] });
      if (url.includes("/api/v1/events")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/activities")) return jsonResponse(activitiesPage([]));
      throw new Error(`Unexpected fetch: ${url}`);
    });

    // The retired /app/deals/:id route redirects to /app/deals?deal=:id and
    // opens the dialog (an h2, not a full page).
    renderAt(`/app/deals/${deal.id}`);
    const heading = await screen.findByRole("heading", { level: 2, name: /Otevřený obchod/ });
    // The status chip sits next to the title in the header, not in the <dl>.
    expect(heading.parentElement).toHaveTextContent(/Otevřeno/);
    // Name and Value duplicate the header, so they leave the info grid.
    const fieldLabels = Array.from(document.querySelectorAll("dl dt")).map((n) => n.textContent);
    expect(fieldLabels).toContain("Firma");
    expect(fieldLabels).not.toContain("Název");
    expect(fieldLabels).not.toContain("Hodnota");
  });

  it("shows the deal timeline first and pages it with Načíst další", async () => {
    const deal = makeDeal({ id: "timeline-deal", name: "Obchod s průběhem" });
    const activities = Array.from({ length: 21 }, (_, i) => ({
      id: `a${i}`,
      organization_id: ME.organization.id,
      user_id: null,
      user_name: "Eva Nováková",
      entity_type: "deal",
      entity_id: deal.id,
      activity_type: i === 0 ? "deal_created" : "note",
      payload: i === 0 ? {} : { body: `Poznámka ${i}` },
      created_at: "2026-04-01T08:00:00+00:00",
    }));
    const limits: string[] = [];
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/deals/${deal.id}`)) return jsonResponse(deal);
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [deal], total: 1, limit: 50, offset: 0 });
      if (url.includes("/api/v1/activities")) {
        const limit = Number(new URL(url, "http://x").searchParams.get("limit"));
        limits.push(String(limit));
        return jsonResponse(activitiesPage(activities.slice(0, limit), activities.length));
      }
      if (url.includes("/api/v1/companies/")) return jsonResponse({ id: "co1", name: "Firma" });
      if (url.includes("/api/v1/contacts")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/users") || url.includes("/api/v1/teams"))
        return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/pipelines")) return jsonResponse({ stages: [] });
      if (url.includes("/api/v1/events")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/emails")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/me/smtp")) return jsonResponse({ configured: false });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt(`/app/deals/${deal.id}`);
    const user = userEvent.setup();

    expect(await screen.findByText("Průběh")).toBeInTheDocument();
    // First page = 4 of 21 rows (viewport-fit densification), pager offered.
    await waitFor(() => expect(screen.getAllByText("Poznámka").length).toBe(3));
    expect(limits).toContain("4");

    await user.click(screen.getByTestId("deals-detail-timeline-load-more"));
    await waitFor(() => expect(limits).toContain("19"));
    // 19 of 21 still leaves two — page once more to drain them.
    await user.click(screen.getByTestId("deals-detail-timeline-load-more"));
    await waitFor(() => expect(limits).toContain("34"));
    // Everything fits now — the pager disappears instead of looping.
    await waitFor(() =>
      expect(screen.queryByTestId("deals-detail-timeline-load-more")).not.toBeInTheDocument(),
    );
  });

  it("deletes through the styled confirm dialog, not window.confirm", async () => {
    const deal = makeDeal({ id: "del-deal", name: "Obchod ke smazání" });
    const confirmSpy = vi.spyOn(window, "confirm");
    const deletes: string[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/deals/${deal.id}`)) {
        if (init?.method === "DELETE") {
          deletes.push(url);
          return new Response(null, { status: 204 });
        }
        return jsonResponse(deal);
      }
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [deal], total: 1, limit: 50, offset: 0 });
      if (url.includes("/api/v1/activities")) return jsonResponse(activitiesPage([]));
      if (url.includes("/api/v1/companies/")) return jsonResponse({ id: "co1", name: "Firma" });
      if (url.includes("/api/v1/contacts")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/users") || url.includes("/api/v1/teams"))
        return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/pipelines")) return jsonResponse({ stages: [] });
      if (url.includes("/api/v1/events")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/emails")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/me/smtp")) return jsonResponse({ configured: false });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt(`/app/deals/${deal.id}`);
    const user = userEvent.setup();

    await user.click(await screen.findByTestId("deals-detail-delete-button"));
    expect(await screen.findByText("Smazat obchod?")).toBeInTheDocument();
    expect(screen.getByText(/Obchod „Obchod ke smazání“/)).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    // Cancel is a real escape hatch — nothing is sent.
    await user.click(screen.getByTestId("confirm-dialog-cancel"));
    await waitFor(() => expect(screen.queryByText("Smazat obchod?")).not.toBeInTheDocument());
    expect(deletes).toEqual([]);

    await user.click(screen.getByTestId("deals-detail-delete-button"));
    await user.click(await screen.findByTestId("confirm-dialog-confirm"));
    await waitFor(() => expect(deletes.length).toBe(1));
    confirmSpy.mockRestore();
  });

  it("edits the standing deal description and keeps it distinct from timeline notes", async () => {
    const deal = makeDeal({ id: "note-deal", name: "Obchod s popisem", note: null });
    const puts: unknown[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/deals/${deal.id}`)) {
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          puts.push(body);
          return jsonResponse({ ...deal, ...body });
        }
        return jsonResponse(puts.length ? { ...deal, ...(puts.at(-1) as object) } : deal);
      }
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [deal], total: 1, limit: 50, offset: 0 });
      if (url.includes("/api/v1/activities")) return jsonResponse(activitiesPage([]));
      if (url.includes("/api/v1/companies/")) return jsonResponse({ id: "co1", name: "Firma" });
      if (url.includes("/api/v1/contacts")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/users") || url.includes("/api/v1/teams"))
        return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/pipelines")) return jsonResponse({ stages: [] });
      if (url.includes("/api/v1/events")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/emails")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/me/smtp")) return jsonResponse({ configured: false });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt(`/app/deals/${deal.id}`);
    const user = userEvent.setup();

    // The description is the closing full-width row of the info grid, and its
    // subtitle still sends running commentary to the timeline instead.
    expect(await screen.findByText(/Popis obchodu/)).toBeInTheDocument();
    expect(screen.getByText(/K tomuto obchodu zatím není žádný popis/)).toBeInTheDocument();
    // The two-line explainer moved into edit mode (viewport-fit) — it must
    // NOT render in the resting empty state anymore.
    expect(screen.queryByText(/Průběžné poznámky z hovorů/)).not.toBeInTheDocument();

    await user.click(screen.getByTestId("deals-detail-note-edit"));
    await user.type(screen.getByTestId("deals-detail-note-input"), "Region: Morava");
    await user.click(screen.getByTestId("deals-detail-note-save"));

    await waitFor(() => expect(puts).toEqual([{ note: "Region: Morava" }]));
    // It saves through the deal itself, not POST /deals/{id}/notes.
    expect(urlsMatching(fetchMock, "/notes")).toEqual([]);
    expect(await screen.findByText("Region: Morava")).toBeInTheDocument();
  });

  it("gates the deal e-mail button behind SMTP with a link to Nastavení → Integrace", async () => {
    const deal = makeDeal({
      id: "gate-deal",
      name: "Dlouhý název obchodu který se nemá ořezávat",
    });
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.endsWith(`/api/v1/deals/${deal.id}`)) return jsonResponse(deal);
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [deal], total: 1, limit: 50, offset: 0 });
      if (url.includes("/api/v1/me/smtp")) return jsonResponse({ configured: false });
      if (url.includes("/api/v1/emails"))
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      if (url.includes("/api/v1/activities")) return jsonResponse(activitiesPage([]));
      if (url.includes("/api/v1/companies/"))
        return jsonResponse({ id: "co1", name: "Firma", email: "info@firma.cz" });
      if (url.includes("/api/v1/contacts")) return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/users") || url.includes("/api/v1/teams"))
        return jsonResponse({ items: [], total: 0 });
      if (url.includes("/api/v1/pipelines")) return jsonResponse({ stages: [] });
      if (url.includes("/api/v1/events")) return jsonResponse({ items: [], total: 0 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt(`/app/deals/${deal.id}`);
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: /Dlouhý název obchodu/,
    });
    // #12: the deal name must wrap, not truncate.
    expect(heading.className).not.toContain("truncate");

    // #2: gated button is focusable (aria-disabled), not natively disabled.
    const mailButton = screen.getByRole("button", { name: /Poslat e-mail/ });
    expect(mailButton).toHaveAttribute("aria-disabled", "true");
    expect(mailButton).not.toBeDisabled();

    // Focusing reveals the popover with the fix-it link to the integrations page.
    fireEvent.focus(mailButton);
    expect(await screen.findByText(/Nejprve nastavte a ověřte SMTP/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Nastavení → Integrace/ });
    expect(link).toHaveAttribute("href", "/app/settings/integrations");
  });

  it("empty state points users at the Kanban for creating deals", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/deals?"))
        return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAt("/app/deals");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /Zatím žádné obchody/ }),
      ).toBeInTheDocument(),
    );
  });
});

const BOARD = {
  stages: [
    { id: "st1", name: "Nový lead", position: 0, color: null, deals: [] },
    { id: "st2", name: "Nabídka", position: 1, color: null, deals: [] },
  ],
};

const USERS = {
  items: [{ id: "u1", name: "Eva Nováková", email: "eva@ex.cz", role: "salesperson" }],
  total: 1,
  limit: 100,
  offset: 0,
};

/** URL that the Nth matching call was made with, or undefined. */
function urlsMatching(mock: ReturnType<typeof vi.fn>, needle: string): string[] {
  return mock.mock.calls
    .map(([i]) => (typeof i === "string" ? i : (i as Request).url))
    .filter((u: string) => u.includes(needle));
}

describe("Deals list — server-side search, filters and sort", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  /** Answers every request the list page makes; deals responses are recorded. */
  function mockList(deals = [makeDeal()]) {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (url.includes("/api/v1/pipelines")) return jsonResponse(BOARD);
      if (url.includes("/api/v1/users")) return jsonResponse(USERS);
      if (url.includes("/api/v1/deals/export.csv")) {
        return new Response("name\n", {
          status: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="simplecrm-deals-2026-07-27.csv"',
          },
        });
      }
      if (url.includes("/api/v1/deals?")) {
        return jsonResponse({ items: deals, total: deals.length, limit: 25, offset: 0 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends the debounced search term to the server", async () => {
    mockList();
    renderAt("/app/deals");
    const user = userEvent.setup();
    await user.type(await screen.findByTestId("deals-search-input"), "Brno");

    await waitFor(() => expect(urlsMatching(fetchMock, "search=Brno").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  });

  it("seeds the search box from the URL so a deep link keeps its filter", async () => {
    mockList();
    renderAt("/app/deals?q=Brno");
    expect(await screen.findByTestId("deals-search-input")).toHaveValue("Brno");
    await waitFor(() => expect(urlsMatching(fetchMock, "search=Brno").length).toBeGreaterThan(0));
  });

  it("sends stage_id, owner_user_id and status when the filters are used", async () => {
    mockList();
    renderAt("/app/deals");
    const user = userEvent.setup();

    // The stage/owner options come from the board + users queries — wait for
    // them to land before driving the selects.
    await screen.findByRole("option", { name: "Nabídka" });
    await user.selectOptions(screen.getByTestId("deals-stage-filter"), "st2");
    await waitFor(() => expect(urlsMatching(fetchMock, "stage_id=st2").length).toBeGreaterThan(0));

    await screen.findByRole("option", { name: "Eva Nováková" });
    await user.selectOptions(screen.getByTestId("deals-owner-filter"), "u1");
    await waitFor(() =>
      expect(urlsMatching(fetchMock, "owner_user_id=u1").length).toBeGreaterThan(0),
    );

    await user.selectOptions(screen.getByTestId("deals-status-filter"), "won");
    await waitFor(() => expect(urlsMatching(fetchMock, "status=won").length).toBeGreaterThan(0));
  });

  it("sorts server-side and flips direction on a second click", async () => {
    mockList();
    renderAt("/app/deals");
    const user = userEvent.setup();

    const valueHeader = await screen.findByTestId("deals-sort-value");
    await user.click(valueHeader);
    await waitFor(() =>
      expect(urlsMatching(fetchMock, "sort=value&order=asc").length).toBeGreaterThan(0),
    );

    await user.click(screen.getByTestId("deals-sort-value"));
    await waitFor(() =>
      expect(urlsMatching(fetchMock, "sort=value&order=desc").length).toBeGreaterThan(0),
    );
  });

  it("shows the filtered-empty state (not the onboarding one) when filters match nothing", async () => {
    mockList([]);
    renderAt("/app/deals?status=won");
    expect(
      await screen.findByRole("heading", { level: 2, name: /Žádný obchod neodpovídá filtrům/ }),
    ).toBeInTheDocument();
  });

  it("downloads a CSV carrying the active filters", async () => {
    const createUrl = vi.fn(() => "blob:deals");
    const revokeUrl = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }),
    );
    mockList();

    renderAt("/app/deals?status=won");
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("deals-export-csv"));

    await waitFor(() => {
      const exportCalls = urlsMatching(fetchMock, "/api/v1/deals/export.csv");
      expect(exportCalls.length).toBe(1);
      expect(exportCalls[0]).toContain("status=won");
    });
    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
