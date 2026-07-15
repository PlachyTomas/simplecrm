import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ToastProvider } from "@/lib/toast";
import { testIds } from "@/lib/testids";

import { EventFormModal } from "@/app/events/EventFormModal";

const DEALS_PAGE = {
  items: [
    {
      id: "d1",
      name: "Web pro Acme",
      company_name: "Acme s.r.o.",
      stage_id: "s1",
      company_id: "c1",
      organization_id: "o1",
      value: "1000",
      currency: "CZK",
      stage_name: "Kvalifikace",
      is_paid: false,
      created_at: "2026-07-01T10:00:00Z",
    },
    {
      id: "d2",
      name: "Audit Beta",
      company_name: "Beta a.s.",
      stage_id: "s1",
      company_id: "c2",
      organization_id: "o1",
      value: "2000",
      currency: "CZK",
      stage_name: "Kvalifikace",
      is_paid: false,
      created_at: "2026-07-02T10:00:00Z",
    },
  ],
  total: 2,
  limit: 100,
  offset: 0,
};

const CREATED_EVENT = {
  id: "e1",
  deal_id: "d1",
  deal_name: "Web pro Acme",
  title: "Schůzka — Web pro Acme",
  starts_at: "2026-07-14T10:00:00Z",
  ends_at: "2026-07-14T11:00:00Z",
  location: null,
  description: null,
  google_sync_status: "not_synced",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <ToastProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("EventFormModal deal picker", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/integrations/google-calendar")) {
        return jsonResponse({ connected: false, sync_broken: false });
      }
      if (url.includes("/api/v1/deals?") || url.endsWith("/api/v1/deals")) {
        return jsonResponse(DEALS_PAGE);
      }
      if (url.endsWith("/api/v1/events") && init?.method === "POST") {
        return jsonResponse(CREATED_EVENT, 201);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("create mode without dealId shows the required picker and creates with the picked deal", async () => {
    const onClose = vi.fn();
    wrap(<EventFormModal open onClose={onClose} />);

    const input = screen.getByTestId(testIds.events.dealPicker.input);
    expect(input).toHaveAttribute("aria-required", "true");

    await userEvent.type(input, "acme");
    const option = await screen.findByTestId(testIds.events.dealPicker.option("d1"));
    expect(option).toHaveTextContent("Web pro Acme");
    // The non-matching deal stays hidden.
    expect(screen.queryByTestId(testIds.events.dealPicker.option("d2"))).not.toBeInTheDocument();
    await userEvent.click(option);

    // The picked deal supplies the default title.
    expect(screen.getByDisplayValue("Schůzka — Web pro Acme")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({
      deal_id: "d1",
      title: "Schůzka — Web pro Acme",
    });
  });

  it("blocks submit with a validation message until a deal is picked", async () => {
    wrap(<EventFormModal open onClose={vi.fn()} />);
    await userEvent.type(screen.getByTestId(testIds.events.dealPicker.input), "nic neodpovídá");
    // Give the title a value so only the deal is missing.
    await userEvent.type(screen.getByRole("textbox", { name: "Název" }), "Schůzka");
    await userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));
    expect(
      await screen.findByText("Vyberte obchod, ke kterému událost patří."),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("keeps the deal-locked create mode unchanged when dealId is passed", async () => {
    const onClose = vi.fn();
    wrap(<EventFormModal open onClose={onClose} dealId="d9" dealName="Velká zakázka" />);

    // No picker; the bound deal shows in the subtitle and the title defaults.
    expect(screen.queryByTestId(testIds.events.dealPicker.input)).not.toBeInTheDocument();
    expect(screen.getByText("Velká zakázka")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Schůzka — Velká zakázka")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({ deal_id: "d9" });
  });

  it("does not clobber a user-typed title when picking a deal", async () => {
    wrap(<EventFormModal open onClose={vi.fn()} />);
    const title = screen.getByRole("textbox", { name: "Název" });
    await userEvent.type(title, "Moje vlastní schůzka");
    await userEvent.type(screen.getByTestId(testIds.events.dealPicker.input), "beta");
    await userEvent.click(await screen.findByTestId(testIds.events.dealPicker.option("d2")));
    expect(screen.getByDisplayValue("Moje vlastní schůzka")).toBeInTheDocument();
  });
});
