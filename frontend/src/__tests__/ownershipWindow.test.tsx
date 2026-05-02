import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

const ORG_ID = "00000000-0000-0000-0000-0000000000aa";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildMe(windowDays: number) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@example.cz",
    name: "Admin",
    avatar_url: null,
    role: "admin",
    can_invite: true,
    is_super_admin: false,
    organization: {
      id: ORG_ID,
      name: "Example s.r.o.",
      ico: "27082440",
      locale: "cs-CZ",
      currency: "CZK",
      trial_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      show_leaderboard_to_salespeople: false,
      ownership_window_days: windowDays,
    },
  };
}

const PIPELINE = {
  stages: [
    { id: "s1", name: "Lead", position: 1, type: "open", color: "#000" },
    { id: "s2", name: "Won", position: 2, type: "won", color: "#000" },
    { id: "s3", name: "Lost", position: 3, type: "lost", color: "#000" },
  ],
};

interface SetupOpts {
  windowDays?: number;
  putFails?: boolean;
}

function setupFetch(opts: SetupOpts = {}) {
  const windowDays = opts.windowDays ?? 365;
  const calls: Array<{ url: string; method?: string; body: unknown }> = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/v1/auth/me")) return jsonResponse(buildMe(windowDays));
    if (url.includes("/api/v1/pipeline")) return jsonResponse(PIPELINE);
    if (url.endsWith("/api/v1/organizations/current") && method === "PUT") {
      const body = init?.body ? JSON.parse(init.body as string) : null;
      calls.push({ url, method, body });
      if (opts.putFails) return new Response("err", { status: 500 });
      const next = body?.ownership_window_days ?? windowDays;
      return jsonResponse({
        id: ORG_ID,
        name: "Example s.r.o.",
        ico: "27082440",
        dic: null,
        address_street: null,
        address_city: null,
        address_zip: null,
        legal_form: null,
        locale: "cs-CZ",
        currency: "CZK",
        trial_ends_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        stripe_customer_id: null,
        show_leaderboard_to_salespeople: false,
        ownership_window_days: next,
      });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake-token">
        <MemoryRouter initialEntries={["/app/settings"]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Ownership-window setting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the current org's ownership_window_days as the input value", async () => {
    setupFetch({ windowDays: 90 });
    renderSettings();
    fireEvent.click(await screen.findByRole("tab", { name: /^Oprávnění$/ }));
    const input = await screen.findByLabelText(/^Doba držení firem/i);
    expect((input as HTMLInputElement).value).toBe("90");
  });

  it("submits a valid new value and PUT body matches", async () => {
    const { calls } = setupFetch({ windowDays: 365 });
    renderSettings();
    fireEvent.click(await screen.findByRole("tab", { name: /^Oprávnění$/ }));
    const input = await screen.findByLabelText(/^Doba držení firem/i);
    fireEvent.change(input, { target: { value: "180" } });
    const saveBtn = screen
      .getAllByRole("button", { name: /^Uložit$/ })
      .find((b) => !b.hasAttribute("disabled"));
    expect(saveBtn).toBeDefined();
    fireEvent.click(saveBtn!);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ ownership_window_days: 180 });
  });

  it("rejects out-of-bounds values without firing PUT", async () => {
    const { calls } = setupFetch({ windowDays: 365 });
    renderSettings();
    fireEvent.click(await screen.findByRole("tab", { name: /^Oprávnění$/ }));
    const input = await screen.findByLabelText(/^Doba držení firem/i);
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/Hodnota musí být/i),
    );
    expect(calls).toHaveLength(0);
  });

  it("disables Uložit when the value matches the current setting (no-op)", async () => {
    setupFetch({ windowDays: 365 });
    renderSettings();
    fireEvent.click(await screen.findByRole("tab", { name: /^Oprávnění$/ }));
    await screen.findByLabelText(/^Doba držení firem/i);
    // The form's Save button should be disabled when input value === initial.
    const form = screen.getByLabelText(/^Doba držení firem/i).closest("form")!;
    const saveBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.disabled).toBe(true);
  });
});
