import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildMe(role: string, canInvite: boolean) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "user@example.cz",
    name: "Test User",
    avatar_url: null,
    role,
    can_invite: canInvite,
    is_super_admin: false,
    organization: {
      id: "00000000-0000-0000-0000-0000000000aa",
      name: "Example s.r.o.",
      ico: "27082440",
      locale: "cs-CZ",
      currency: "CZK",
      trial_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      show_leaderboard_to_salespeople: false,
      ownership_window_days: 365,
    },
  };
}

function setupFetch(role = "admin", canInvite = true) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(buildMe(role, canInvite));
    if (url.includes("/api/v1/pipeline")) return jsonResponse({ stages: [] });
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake-token">
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Settings navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the grouped home list on the index route (mobile default)", async () => {
    setupFetch();
    renderAt("/app/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Nastavení" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Vzhled/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fakturace/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Import z CSV/ })).toBeInTheDocument();
  });

  it("redirects legacy ?tab= deep links and keeps other params", async () => {
    setupFetch();
    renderAt("/app/settings?tab=integrations&gcal=connected");
    expect(await screen.findByRole("heading", { level: 1, name: "Integrace" })).toBeInTheDocument();
  });

  it("redirects /app/nastaveni/predplatne to the billing section", async () => {
    setupFetch();
    renderAt("/app/nastaveni/predplatne");
    expect(await screen.findByRole("heading", { level: 1, name: "Fakturace" })).toBeInTheDocument();
  });

  it("bounces non-admins from admin sections to their default", async () => {
    setupFetch("salesperson", false);
    renderAt("/app/settings/users");
    expect(await screen.findByRole("heading", { level: 1, name: "Vzhled" })).toBeInTheDocument();
  });

  it("bounces unknown slugs to the default section", async () => {
    setupFetch();
    renderAt("/app/settings/does-not-exist");
    expect(await screen.findByRole("heading", { level: 1, name: "Pipeline" })).toBeInTheDocument();
  });

  it("hides admin sections from the salesperson home list", async () => {
    setupFetch("salesperson", false);
    renderAt("/app/settings");
    await screen.findByRole("heading", { level: 1, name: "Nastavení" });
    expect(screen.queryByRole("link", { name: /Uživatelé/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Import z CSV/ })).not.toBeInTheDocument();
  });
});
