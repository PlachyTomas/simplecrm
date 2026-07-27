/**
 * Deal rotting on the pipeline board (gap-analysis #5A).
 *
 * The board ships a raw `days_since_last_move` per card (NULL for closed
 * deals); the org's `deal_rotting_days` decides where the badge appears.
 * These tests pin both halves: the predicate, and that a stale card gets the
 * badge while a fresh one next to it doesn't.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { isCriticallyRotting, isRotting } from "@/app/pipeline/rotting";
import { testIds } from "@/lib/testids";

describe("isRotting", () => {
  it("flags a deal at or past the threshold", () => {
    expect(isRotting(14, 14)).toBe(true);
    expect(isRotting(200, 14)).toBe(true);
  });

  it("leaves a fresh deal alone", () => {
    expect(isRotting(13, 14)).toBe(false);
    expect(isRotting(0, 14)).toBe(false);
  });

  it("treats a threshold of 0 as the feature being switched off", () => {
    expect(isRotting(999, 0)).toBe(false);
  });

  it("never flags a closed deal — the API sends null for those", () => {
    expect(isRotting(null, 14)).toBe(false);
    expect(isRotting(undefined, 14)).toBe(false);
  });

  it("escalates at twice the threshold", () => {
    expect(isCriticallyRotting(27, 14)).toBe(false);
    expect(isCriticallyRotting(28, 14)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rendering on the board
// ---------------------------------------------------------------------------

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";

function buildMe(rottingDays: number | undefined) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@ex.cz",
    name: "Admin",
    avatar_url: null,
    role: "admin",
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
      ...(rottingDays === undefined ? {} : { deal_rotting_days: rottingDays }),
    },
  };
}

function deal(id: string, name: string, days: number | null, extra: object = {}) {
  return {
    id,
    organization_id: ORG_ID,
    company_id: "c",
    stage_id: "s1",
    owner_user_id: null,
    primary_contact_id: null,
    name,
    company_name: "Firma s.r.o.",
    value: "100.00",
    currency: "CZK",
    probability_override: null,
    expected_close_date: null,
    closed_at: null,
    lost_reason: null,
    is_paid: false,
    paid_at: null,
    days_since_last_move: days,
    created_at: "2026-04-01T08:00:00+00:00",
    updated_at: "2026-04-01T08:00:00+00:00",
    ...extra,
  };
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
      deal_count: 3,
      total_value: "300.00",
      currency: "CZK",
      deals: [
        deal("d-fresh", "Čerstvý obchod", 3),
        deal("d-stale", "Stagnující obchod", 20),
        deal("d-dead", "Zapomenutý obchod", 112),
      ],
    },
    {
      id: "s2",
      name: "Vyhráno",
      color: "#E040FB",
      position: 1,
      stage_type: "won",
      default_probability: 100,
      deal_count: 1,
      total_value: "100.00",
      currency: "CZK",
      // Closed deals carry null — the server refuses to rot a finished deal.
      deals: [
        deal("d-won", "Vyhraný obchod", null, {
          stage_id: "s2",
          closed_at: "2026-07-01T08:00:00+00:00",
        }),
      ],
    },
  ],
};

function renderBoard(rottingDays: number | undefined) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const body = (payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    if (url.includes("/api/v1/auth/me")) return body(buildMe(rottingDays));
    if (url.includes("/api/v1/pipelines/default/board")) return body(BOARD);
    if (url.includes("/api/v1/users")) return body({ items: [], total: 0 });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter initialEntries={["/app/pipeline"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Pipeline rotting badge", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("badges the stale cards and leaves the fresh one clean", async () => {
    renderBoard(14);
    await waitFor(() => expect(screen.getAllByText("Stagnující obchod").length).toBeGreaterThan(0));

    // Desktop + mobile card variants both render, hence getAllBy*.
    expect(screen.getAllByTestId(testIds.pipeline.rottingBadge("d-stale")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByTestId(testIds.pipeline.rottingBadge("d-dead")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByTestId(testIds.pipeline.rottingBadge("d-fresh"))).toBeNull();
  });

  it("never badges a closed (won) deal", async () => {
    renderBoard(14);
    await waitFor(() => expect(screen.getAllByText("Stagnující obchod").length).toBeGreaterThan(0));
    expect(screen.queryByTestId(testIds.pipeline.rottingBadge("d-won"))).toBeNull();
  });

  it("escalates from warning to danger past 2× the threshold", async () => {
    renderBoard(14);
    await waitFor(() => expect(screen.getAllByText("Stagnující obchod").length).toBeGreaterThan(0));
    const warn = screen.getAllByTestId(testIds.pipeline.rottingBadge("d-stale"))[0]!;
    const danger = screen.getAllByTestId(testIds.pipeline.rottingBadge("d-dead"))[0]!;
    expect(warn.className).toContain("text-warning");
    expect(danger.className).toContain("text-danger");
  });

  it("shows the day count in the badge", async () => {
    renderBoard(14);
    await waitFor(() => expect(screen.getAllByText("Stagnující obchod").length).toBeGreaterThan(0));
    const badge = screen.getAllByTestId(testIds.pipeline.rottingBadge("d-dead"))[0]!;
    expect(badge.textContent).toContain("112");
    expect(badge.textContent).toMatch(/bez pohybu/);
  });

  it("hides every badge when the org sets the threshold to 0", async () => {
    renderBoard(0);
    await waitFor(() => expect(screen.getAllByText("Stagnující obchod").length).toBeGreaterThan(0));
    expect(screen.queryByTestId(testIds.pipeline.rottingBadge("d-stale"))).toBeNull();
    expect(screen.queryByTestId(testIds.pipeline.rottingBadge("d-dead"))).toBeNull();
  });

  it("falls back to the server default when /auth/me carries no threshold", async () => {
    // A stale payload must not silently switch the indicator off.
    renderBoard(undefined);
    await waitFor(() => expect(screen.getAllByText("Stagnující obchod").length).toBeGreaterThan(0));
    expect(screen.getAllByTestId(testIds.pipeline.rottingBadge("d-stale")).length).toBeGreaterThan(
      0,
    );
  });
});
