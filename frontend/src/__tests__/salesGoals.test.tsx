/**
 * Sales goals (gap-analysis #5B): the Settings section and the dashboard
 * widget both read `/api/v1/sales-goals`, so these tests pin that they show
 * the same numbers, and that the write controls follow the backend's
 * admin-or-manager gate.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { GlobalFilters, WidgetEntry } from "@/app/reports/dashboard/types";
import { WidgetByType } from "@/app/reports/dashboard/widgets/WidgetByType";
import { testIds } from "@/lib/testids";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";
const USER_ID = "00000000-0000-0000-0000-000000000001";
const REP_ID = "00000000-0000-0000-0000-000000000002";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildMe(role: string) {
  return {
    id: USER_ID,
    email: "admin@ex.cz",
    name: "Admin",
    avatar_url: null,
    role,
    can_invite: true,
    is_super_admin: false,
    organization: {
      id: ORG_ID,
      name: "Example",
      ico: "27082440",
      locale: "cs-CZ",
      currency: "CZK",
      trial_ends_at: new Date(Date.now() + 45 * 86400 * 1000).toISOString(),
      show_leaderboard_to_salespeople: false,
      ownership_window_days: 365,
      deal_rotting_days: 14,
    },
  };
}

function goal(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "g1",
    user_id: null,
    user_name: null,
    period_month: "2026-07-01",
    metric: "won_value",
    target_value: "100000.00",
    actual_value: "40000.00",
    progress_pct: 40,
    currency: "CZK",
    created_at: "2026-07-01T08:00:00+00:00",
    updated_at: "2026-07-01T08:00:00+00:00",
    ...over,
  };
}

interface SetupOpts {
  role?: string;
  goals?: unknown[];
}

function setupFetch(opts: SetupOpts = {}) {
  const posts: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = init?.method ?? "GET";
    if (url.includes("/api/v1/auth/me")) return jsonResponse(buildMe(opts.role ?? "admin"));
    if (url.includes("/api/v1/sales-goals")) {
      if (method !== "GET") {
        posts.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
        return jsonResponse(goal(), method === "POST" ? 201 : 200);
      }
      return jsonResponse({ items: opts.goals ?? [] });
    }
    if (url.includes("/api/v1/users")) {
      return jsonResponse({
        items: [
          { id: USER_ID, name: "Admin", email: "admin@ex.cz", role: "admin", is_active: true },
          {
            id: REP_ID,
            name: "Eva Nováková",
            email: "eva@ex.cz",
            role: "salesperson",
            is_active: true,
          },
        ],
        total: 2,
      });
    }
    if (url.includes("/api/v1/pipeline")) return jsonResponse({ stages: [] });
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, posts };
}

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter initialEntries={["/app/settings/sales-goals"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Settings → sales goals", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists this month's goals with their progress", async () => {
    setupFetch({
      goals: [
        goal(),
        goal({
          id: "g2",
          user_id: REP_ID,
          user_name: "Eva Nováková",
          metric: "won_count",
          target_value: "8",
          actual_value: "10",
          progress_pct: 125,
        }),
      ],
    });
    renderSettings();

    await screen.findByTestId(testIds.settings.salesGoals.row("g1"));
    const orgRow = screen.getByTestId(testIds.settings.salesGoals.row("g1"));
    expect(orgRow.textContent).toMatch(/Celá firma/);
    expect(orgRow.textContent).toMatch(/40\s*%/);

    const repRow = screen.getByTestId(testIds.settings.salesGoals.row("g2"));
    expect(repRow.textContent).toMatch(/Eva Nováková/);
    // won_count renders as a plain number, not money.
    expect(repRow.textContent).toMatch(/10/);
    expect(repRow.textContent).toMatch(/125\s*%/);
  });

  it("creates a goal through the inline editor", async () => {
    const { posts } = setupFetch({ goals: [] });
    renderSettings();

    fireEvent.click(await screen.findByTestId(testIds.settings.salesGoals.add));
    fireEvent.change(await screen.findByTestId(testIds.settings.salesGoals.userSelect), {
      target: { value: REP_ID },
    });
    fireEvent.change(screen.getByTestId(testIds.settings.salesGoals.metricSelect), {
      target: { value: "won_count" },
    });
    fireEvent.change(screen.getByTestId(testIds.settings.salesGoals.targetInput), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByTestId(testIds.settings.salesGoals.save));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.method).toBe("POST");
    expect(posts[0]?.body).toMatchObject({
      user_id: REP_ID,
      metric: "won_count",
      target_value: "12",
    });
    // Normalized to the first of the month before it ever leaves the client.
    expect((posts[0]?.body as { period_month: string }).period_month).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("refuses a non-positive target without firing a request", async () => {
    const { posts } = setupFetch({ goals: [] });
    renderSettings();

    fireEvent.click(await screen.findByTestId(testIds.settings.salesGoals.add));
    fireEvent.change(await screen.findByTestId(testIds.settings.salesGoals.targetInput), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId(testIds.settings.salesGoals.save));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(posts).toHaveLength(0);
  });

  it("hides the write controls from a salesperson (matching the backend gate)", async () => {
    setupFetch({ role: "salesperson", goals: [goal()] });
    renderSettings();

    await screen.findByTestId(testIds.settings.salesGoals.row("g1"));
    expect(screen.queryByTestId(testIds.settings.salesGoals.add)).toBeNull();
    expect(screen.queryByTestId(testIds.settings.salesGoals.edit("g1"))).toBeNull();
    expect(screen.queryByTestId(testIds.settings.salesGoals.remove("g1"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The dashboard widget
// ---------------------------------------------------------------------------

const filters: GlobalFilters = {
  dateRange: { preset: "last_30_days" },
  teamId: null,
  ownerUserId: null,
};

function widgetEntry(config: Record<string, unknown>): WidgetEntry {
  return {
    id: "w_sales_goal",
    position: { x: 0, y: 0, w: 4, h: 3 },
    config: { type: "sales_goal", ...config } as WidgetEntry["config"],
  };
}

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

describe("sales_goal widget", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows progress toward the org-wide goal", async () => {
    setupFetch({ goals: [goal()] });
    renderWidget(widgetEntry({ scope: "organization", metric: "won_value" }));

    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText(/Celá firma/)).toBeTruthy();
  });

  it("renders an empty state with a link to Settings when no goal is set", async () => {
    setupFetch({ goals: [] });
    renderWidget(widgetEntry({ scope: "mine", metric: "won_value" }));

    const link = await screen.findByRole("link");
    expect(link.getAttribute("href")).toBe("/app/settings/sales-goals");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("picks the viewer's own goal for scope=mine", async () => {
    setupFetch({
      goals: [
        goal(),
        goal({ id: "g-mine", user_id: USER_ID, user_name: "Admin", progress_pct: 90 }),
      ],
    });
    renderWidget(widgetEntry({ scope: "mine", metric: "won_value" }));

    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("90");
  });

  it("falls back to the only goal in scope when its metric differs from the config", async () => {
    // `metric` is a tie-breaker, not a filter — a default-config widget must
    // not show an empty state next to a goal that plainly exists.
    setupFetch({
      goals: [
        goal({
          id: "g-count",
          metric: "won_count",
          target_value: "4",
          actual_value: "3",
          progress_pct: 75,
        }),
      ],
    });
    renderWidget(widgetEntry({ scope: "organization", metric: "won_value" }));

    const bar = await screen.findByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("75");
    expect(screen.getByText(/Počet vyhraných obchodů/)).toBeTruthy();
  });

  it("caps the bar at 100% but keeps the over-achievement number", async () => {
    setupFetch({
      goals: [goal({ progress_pct: 300, actual_value: "300000.00" })],
    });
    renderWidget(widgetEntry({ scope: "organization", metric: "won_value" }));

    const bar = await screen.findByRole("progressbar");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("100%");
    expect(bar.getAttribute("aria-valuenow")).toBe("300");
  });
});
