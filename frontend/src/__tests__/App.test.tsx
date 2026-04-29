import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

function renderAt(initialPath: string, options: { token?: string | null } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken={options.token ?? null}>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("App routing", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("renders the landing stub at /", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/CRM pro prodej/i);
  });

  it("shows the Google login CTA on /login", () => {
    renderAt("/login");
    const cta = screen.getByRole("link", { name: /přihlásit se přes google/i });
    expect(cta).toHaveAttribute("href", expect.stringContaining("/api/v1/auth/google/login"));
  });

  it("redirects /app to /login when unauthenticated and the refresh attempt fails", async () => {
    // No initialToken AND no refresh cookie. AuthProvider attempts
    // POST /auth/refresh on cold-load; with no refresh cookie the backend
    // 401s, AuthProvider settles with `accessToken=null`, and ProtectedRoute
    // redirects to /login.
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 401, headers: { "content-type": "application/json" } }),
    );
    renderAt("/app");
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /přihlásit se přes google/i })).toBeInTheDocument(),
    );
  });

  it("renders the authed shell after /auth/me succeeds", async () => {
    const me = {
      id: "00000000-0000-0000-0000-000000000001",
      email: "test@alza.cz",
      name: "Testovací Uživatel",
      avatar_url: null,
      role: "admin",
      organization: {
        id: "00000000-0000-0000-0000-0000000000aa",
        name: "Alza s.r.o.",
        ico: "27082440",
        locale: "cs-CZ",
        currency: "CZK",
        trial_ends_at: "2027-01-01T12:00:00+00:00",
      },
    };
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me"))
        return new Response(JSON.stringify(me), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.endsWith("/api/v1/reports/kpi-summary"))
        return new Response(
          JSON.stringify({
            currency: "CZK",
            open_deal_count: 0,
            open_pipeline_value: "0.00",
            won_this_month_count: 0,
            won_this_month_value: "0.00",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderAt("/app", { token: "fake-token" });
    await waitFor(() =>
      expect(
        // First name only per B3 ("Vítejte zpět, {firstName}").
        screen.getByRole("heading", { name: /^Vítejte zpět, Testovací$/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Alza s\.r\.o\./)).toBeInTheDocument();
  });

  it("renders the trial gate when /auth/me returns 402", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: {
            detail: "Trial expired",
            trial_ends_at: "2026-03-17T00:00:00+00:00",
            organization_id: "00000000-0000-0000-0000-0000000000aa",
          },
        }),
        { status: 402, headers: { "content-type": "application/json" } },
      ),
    );
    renderAt("/app", { token: "fake-token" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        /Vaše zkušební doba skončila/i,
      ),
    );
    expect(screen.getByRole("button", { name: /přejít na předplatné/i })).toBeInTheDocument();
  });

  it("hydrates the session via /auth/refresh on cold-load (no in-memory token)", async () => {
    // Cold-load with no initialToken: AuthProvider should POST /auth/refresh,
    // get a fresh access token, then `useCurrentUser` runs and renders the shell.
    const refreshed = "fresh-access-token";
    const me = {
      id: "00000000-0000-0000-0000-000000000099",
      email: "refreshed@alza.cz",
      name: "Refreshed User",
      avatar_url: null,
      role: "admin",
      organization: {
        id: "00000000-0000-0000-0000-0000000000aa",
        name: "Alza s.r.o.",
        ico: "27082440",
        locale: "cs-CZ",
        currency: "CZK",
        trial_ends_at: "2027-01-01T12:00:00+00:00",
      },
    };
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/refresh"))
        return new Response(JSON.stringify({ access_token: refreshed }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.endsWith("/api/v1/auth/me"))
        return new Response(JSON.stringify(me), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.endsWith("/api/v1/reports/kpi-summary"))
        return new Response(
          JSON.stringify({
            currency: "CZK",
            open_deal_count: 0,
            open_pipeline_value: "0.00",
            won_this_month_count: 0,
            won_this_month_value: "0.00",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderAt("/app");
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /^Vítejte zpět, Refreshed$/i }),
      ).toBeInTheDocument(),
    );
  });

  it("redirects /app to /login when /auth/me returns 401", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 401, headers: { "content-type": "application/json" } }),
    );
    renderAt("/app", { token: "fake-token" });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /přihlásit se přes google/i })).toBeInTheDocument(),
    );
  });

  it("renders the onboarding modal when the org has no ico and the user is admin", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          email: "first@example.cz",
          name: "První Admin",
          avatar_url: null,
          role: "admin",
          organization: {
            id: "00000000-0000-0000-0000-0000000000aa",
            name: "Example",
            ico: null,
            locale: "cs-CZ",
            currency: "CZK",
            trial_ends_at: "2027-01-01T12:00:00+00:00",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    renderAt("/app", { token: "fake-token" });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /dokončete nastavení firmy/i }),
      ).toBeInTheDocument(),
    );
  });

  it("does not show onboarding for a salesperson with a placeholder org", async () => {
    const me = {
      id: "00000000-0000-0000-0000-000000000002",
      email: "sales@example.cz",
      name: "Obchodník",
      avatar_url: null,
      role: "salesperson",
      organization: {
        id: "00000000-0000-0000-0000-0000000000aa",
        name: "Example",
        ico: null,
        locale: "cs-CZ",
        currency: "CZK",
        trial_ends_at: "2027-01-01T12:00:00+00:00",
      },
    };
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me"))
        return new Response(JSON.stringify(me), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (url.endsWith("/api/v1/reports/kpi-summary"))
        return new Response(
          JSON.stringify({
            currency: "CZK",
            open_deal_count: 0,
            open_pipeline_value: "0.00",
            won_this_month_count: 0,
            won_this_month_value: "0.00",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderAt("/app", { token: "fake-token" });
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: /Vítejte zpět, Obchodník/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole("heading", { name: /dokončete nastavení/i })).toBeNull();
  });
});
