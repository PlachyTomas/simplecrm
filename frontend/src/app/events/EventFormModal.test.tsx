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
  labels: [],
};

const LABELS = [
  { id: "l1", organization_id: "o1", name: "Hovor", color: "#0EA5E9", usage_count: 3 },
  { id: "l2", organization_id: "o1", name: "Schůzka", color: "#6366F1", usage_count: 1 },
];

/** A day that is never "today", so the slot defaults to a fixed 09:00–10:00. */
const FIXED_DAY = "2030-01-15";

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

const fetchMock = vi.fn<typeof fetch>();
const originalFetch = globalThis.fetch;

function installFetchMock() {
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
    if (url.endsWith("/api/v1/event-labels") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { name: string; color: string };
      return jsonResponse({ id: "l3", organization_id: "o1", ...body, usage_count: 0 }, 201);
    }
    if (url.endsWith("/api/v1/event-labels")) {
      return jsonResponse(LABELS);
    }
    if (url.endsWith("/api/v1/events") && init?.method === "POST") {
      return jsonResponse(CREATED_EVENT, 201);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function lastPostBody(path: string) {
  const posts = fetchMock.mock.calls.filter(
    ([input, init]) => init?.method === "POST" && String(input).endsWith(path),
  );
  const post = posts[posts.length - 1];
  return post ? (JSON.parse(String(post[1]!.body)) as Record<string, unknown>) : undefined;
}

describe("EventFormModal deal picker", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("create mode without dealId shows an optional picker and creates with the picked deal", async () => {
    const onClose = vi.fn();
    wrap(<EventFormModal open onClose={onClose} />);

    const input = screen.getByTestId(testIds.events.dealPicker.input);
    // The deal is optional now — nothing marks the picker as required.
    expect(input).not.toHaveAttribute("aria-required");

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

  it("creates a deal-less event when no deal is picked", async () => {
    const onClose = vi.fn();
    wrap(<EventFormModal open onClose={onClose} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Název" }), "Schůzka");
    await userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post).toBeDefined();
    // Explicit null, not an omitted key: the event is deliberately unattached.
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({
      deal_id: null,
      title: "Schůzka",
    });
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

/**
 * `initialDate` pins the slot to a fixed 09:00–10:00 (a non-today day skips
 * the "next full hour" default), so these assertions never depend on the
 * wall clock or the runner's timezone.
 */
function openFixedSlotForm(onClose = vi.fn()) {
  wrap(
    <EventFormModal
      open
      onClose={onClose}
      dealId="d9"
      dealName="Velká zakázka"
      initialDate={FIXED_DAY}
    />,
  );
  return {
    onClose,
    start: screen.getByTestId(testIds.events.timeStart),
    end: screen.getByTestId(testIds.events.timeEnd),
    title: screen.getByRole("textbox", { name: "Název" }),
  };
}

describe("EventFormModal time comboboxes", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("suggests quarter hours, with the end window opening one step after the start", async () => {
    const { start, end } = openFixedSlotForm();
    expect(start).toHaveValue("09:00");
    expect(end).toHaveValue("10:00");

    await userEvent.click(start);
    expect(screen.getByTestId(testIds.events.timeOption("00:00"))).toBeInTheDocument();
    expect(screen.getByTestId(testIds.events.timeOption("23:45"))).toBeInTheDocument();

    await userEvent.click(end);
    // Nothing at or before the start is offered, and each row carries the
    // localized slot length.
    expect(screen.queryByTestId(testIds.events.timeOption("09:00"))).not.toBeInTheDocument();
    expect(screen.getByTestId(testIds.events.timeOption("09:30"))).toHaveTextContent("30 min");
    expect(screen.getByTestId(testIds.events.timeOption("10:00"))).toHaveTextContent("1 h");
    expect(screen.getByTestId(testIds.events.timeOption("10:30"))).toHaveTextContent("1,5 h");
  });

  it("shifts the end when the start moves, and leaves the start alone when the end moves", async () => {
    const { start, end } = openFixedSlotForm();

    await userEvent.click(start);
    await userEvent.click(screen.getByTestId(testIds.events.timeOption("11:00")));
    expect(start).toHaveValue("11:00");
    expect(end).toHaveValue("12:00");

    await userEvent.click(end);
    await userEvent.click(screen.getByTestId(testIds.events.timeOption("13:00")));
    expect(end).toHaveValue("13:00");
    expect(start).toHaveValue("11:00");
  });

  it("clamps a shifted end to 23:59 instead of crossing midnight", async () => {
    const { start, end } = openFixedSlotForm();
    await userEvent.click(start);
    await userEvent.click(screen.getByTestId(testIds.events.timeOption("23:30")));
    expect(end).toHaveValue("23:59");
  });

  it("loose-parses free typing on Enter and on blur, and reverts nonsense", async () => {
    const { start, end, title } = openFixedSlotForm();

    await userEvent.clear(start);
    await userEvent.type(start, "9.30{Enter}");
    expect(start).toHaveValue("09:30");
    // Typing a start shifts the end exactly like picking one does.
    expect(end).toHaveValue("10:30");

    await userEvent.clear(end);
    await userEvent.type(end, "1415");
    await userEvent.click(title);
    expect(end).toHaveValue("14:15");

    await userEvent.clear(start);
    await userEvent.type(start, "schůzka{Enter}");
    expect(start).toHaveValue("09:30");
  });

  it("keeps an off-grid time as both the value and a suggestion", async () => {
    const { start } = openFixedSlotForm();
    await userEvent.clear(start);
    await userEvent.type(start, "9:37{Enter}");
    expect(start).toHaveValue("09:37");

    await userEvent.click(start);
    expect(screen.getByTestId(testIds.events.timeOption("09:37"))).toBeInTheDocument();
  });
});

describe("EventFormModal labels", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("attaches an existing label and sends its id", async () => {
    const { onClose } = openFixedSlotForm();

    await userEvent.click(screen.getByTestId(testIds.events.labelPicker.input));
    await userEvent.click(await screen.findByTestId(testIds.events.labelPicker.option("l1")));
    expect(screen.getByTestId(testIds.events.labelPicker.remove("l1"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({ label_ids: ["l1"] });
  });

  it("creates a label inline with the next palette color, then selects it", async () => {
    const { onClose } = openFixedSlotForm();

    await userEvent.type(screen.getByTestId(testIds.events.labelPicker.input), "Prezentace");
    const create = await screen.findByTestId(testIds.events.labelPicker.create);
    expect(create).toHaveTextContent("Prezentace");
    await userEvent.click(create);

    // Two labels exist, so the round-robin lands on the third palette entry.
    await waitFor(() =>
      expect(lastPostBody("/api/v1/event-labels")).toEqual({
        name: "Prezentace",
        color: "#10B981",
      }),
    );
    expect(await screen.findByTestId(testIds.events.labelPicker.remove("l3"))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({ label_ids: ["l3"] });
  });

  it("offers no create row for a name the org already has", async () => {
    openFixedSlotForm();
    await userEvent.type(screen.getByTestId(testIds.events.labelPicker.input), "hovor");
    expect(await screen.findByTestId(testIds.events.labelPicker.option("l1"))).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.events.labelPicker.create)).not.toBeInTheDocument();
  });

  it("removing a chip clears the label from the payload", async () => {
    const { onClose } = openFixedSlotForm();

    await userEvent.click(screen.getByTestId(testIds.events.labelPicker.input));
    await userEvent.click(await screen.findByTestId(testIds.events.labelPicker.option("l2")));
    await userEvent.click(screen.getByTestId(testIds.events.labelPicker.remove("l2")));
    expect(screen.queryByTestId(testIds.events.labelPicker.remove("l2"))).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({ label_ids: [] });
  });
});
