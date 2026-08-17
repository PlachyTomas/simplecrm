import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ToastProvider } from "@/lib/toast";
import { testIds } from "@/lib/testids";

import { EventFormModal } from "@/app/events/EventFormModal";
import type { CalendarEventOut } from "@/app/events/useEvents";

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

const ORG_USERS = {
  items: [
    {
      id: "u1",
      email: "petr@firma.cz",
      name: "Petr Novák",
      role: "salesperson",
      can_invite: false,
      is_active: true,
      created_at: "2026-01-01T10:00:00Z",
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};

const CONTACTS_PAGE = {
  items: [
    {
      id: "k1",
      organization_id: "o1",
      company_id: "c1",
      company_name: "Acme s.r.o.",
      first_name: "Jana",
      last_name: "Malá",
      email: "jana@acme.cz",
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};

/** Only reachable through the company-scoped query — never on the general page. */
const COMPANY_CONTACTS = {
  items: [
    {
      id: "k9",
      organization_id: "o1",
      company_id: "c1",
      company_name: "Acme s.r.o.",
      first_name: "Karel",
      last_name: "Zeman",
      email: "karel@acme.cz",
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:00:00Z",
    },
  ],
  total: 1,
  limit: 100,
  offset: 0,
};

const ALL_DAY_EVENT: CalendarEventOut = {
  id: "e1",
  organization_id: "o1",
  deal_id: "d1",
  deal_name: "Web pro Acme",
  company_id: "c1",
  company_name: "Acme s.r.o.",
  owner_user_id: "u1",
  title: "Workshop",
  description: null,
  location: null,
  starts_at: "2030-03-04T00:00:00.000Z",
  ends_at: "2030-03-05T00:00:00.000Z",
  all_day: true,
  reminders: [{ method: "popup", minutes: 60 }],
  google_event_id: "g1",
  google_sync_status: "synced",
  meet_url: "https://meet.google.com/abc-defg-hij",
  labels: [],
  attendees: [{ id: "k1", kind: "contact", name: "Jana Malá", email: "jana@acme.cz" }],
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

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

let googleStatus = { connected: false, sync_broken: false };

/** Call before rendering — the modal reads the status once the modal opens. */
function setGoogleStatus(status: { connected: boolean; sync_broken: boolean }) {
  googleStatus = status;
}

function installFetchMock() {
  fetchMock.mockReset();
  googleStatus = { connected: false, sync_broken: false };
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/v1/integrations/google-calendar")) {
      return jsonResponse(googleStatus);
    }
    if (url.includes("/api/v1/deals?") || url.endsWith("/api/v1/deals")) {
      return jsonResponse(DEALS_PAGE);
    }
    if (url.includes("/api/v1/users")) {
      return jsonResponse(ORG_USERS);
    }
    if (url.includes("/api/v1/contacts")) {
      return jsonResponse(url.includes("company_id=") ? COMPANY_CONTACTS : CONTACTS_PAGE);
    }
    if (url.includes("/api/v1/events/") && init?.method === "PUT") {
      return jsonResponse(ALL_DAY_EVENT);
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

function lastBody(method: string, path: string) {
  const calls = fetchMock.mock.calls.filter(
    ([input, init]) => init?.method === method && String(input).endsWith(path),
  );
  const call = calls[calls.length - 1];
  return call ? (JSON.parse(String(call[1]!.body)) as Record<string, unknown>) : undefined;
}

function lastPostBody(path: string) {
  return lastBody("POST", path);
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
  const { unmount } = wrap(
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
    unmount,
    start: screen.getByTestId(testIds.events.timeStart),
    end: screen.getByTestId(testIds.events.timeEnd),
    title: screen.getByRole("textbox", { name: "Název" }),
  };
}

function submit() {
  return userEvent.click(screen.getByRole("button", { name: "Vytvořit událost" }));
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

describe("EventFormModal all-day", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("hides both time selects and submits a UTC-midnight day pair", async () => {
    const { onClose } = openFixedSlotForm();

    await userEvent.click(screen.getByTestId(testIds.events.allDayToggle));
    expect(screen.queryByTestId(testIds.events.timeStart)).not.toBeInTheDocument();
    expect(screen.queryByTestId(testIds.events.timeEnd)).not.toBeInTheDocument();

    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({
      all_day: true,
      starts_at: "2030-01-15T00:00:00.000Z",
      ends_at: "2030-01-16T00:00:00.000Z",
    });
  });

  it("keeps the timed slot when the toggle is off", async () => {
    const { onClose } = openFixedSlotForm();
    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({ all_day: false });
  });
});

describe("EventFormModal reminders", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds rows with the popup/30 preset, caps them at five, and submits the picks", async () => {
    const { onClose } = openFixedSlotForm();

    const add = screen.getByTestId(testIds.events.reminders.add);
    await userEvent.click(add);
    expect(screen.getByTestId(testIds.events.reminders.minutes(0))).toHaveValue("30");
    expect(screen.getByTestId(testIds.events.reminders.method(0))).toHaveValue("popup");

    await userEvent.click(add);
    await userEvent.selectOptions(screen.getByTestId(testIds.events.reminders.minutes(1)), "1440");
    await userEvent.selectOptions(screen.getByTestId(testIds.events.reminders.method(1)), "email");

    await userEvent.click(add);
    await userEvent.click(add);
    await userEvent.click(add);
    expect(screen.getByTestId(testIds.events.reminders.row(4))).toBeInTheDocument();
    // Six would exceed the backend's max_length=5.
    expect(add).toBeDisabled();

    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const reminders = lastPostBody("/api/v1/events")?.reminders;
    expect(reminders).toHaveLength(5);
    expect(reminders).toMatchObject([
      { method: "popup", minutes: 30 },
      { method: "email", minutes: 1440 },
      { method: "popup", minutes: 30 },
      { method: "popup", minutes: 30 },
      { method: "popup", minutes: 30 },
    ]);
  });

  it("authors a custom lead time and clamps it to Google's four-week bound", async () => {
    const { onClose } = openFixedSlotForm();

    await userEvent.click(screen.getByTestId(testIds.events.reminders.add));
    await userEvent.selectOptions(
      screen.getByTestId(testIds.events.reminders.minutes(0)),
      "custom",
    );
    const custom = screen.getByTestId(testIds.events.reminders.customMinutes(0));

    await userEvent.clear(custom);
    await userEvent.type(custom, "50000");
    expect(custom).toHaveValue(40320);

    await userEvent.clear(custom);
    await userEvent.type(custom, "90");
    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({
      reminders: [{ method: "popup", minutes: 90 }],
    });
  });

  it("keeps the custom flag on its own row when an earlier row is removed", async () => {
    const { onClose } = openFixedSlotForm();

    const add = screen.getByTestId(testIds.events.reminders.add);
    await userEvent.click(add);
    await userEvent.click(add);
    await userEvent.selectOptions(
      screen.getByTestId(testIds.events.reminders.minutes(0)),
      "custom",
    );
    expect(screen.getByTestId(testIds.events.reminders.customMinutes(0))).toBeInTheDocument();

    // Index-keyed rows would hand the custom flag down to the survivor.
    await userEvent.click(screen.getByTestId(testIds.events.reminders.remove(0)));
    expect(screen.queryByTestId(testIds.events.reminders.customMinutes(0))).not.toBeInTheDocument();
    expect(screen.getByTestId(testIds.events.reminders.minutes(0))).toHaveValue("30");

    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({
      reminders: [{ method: "popup", minutes: 30 }],
    });
  });

  it("removes a row and sends the shortened list", async () => {
    const { onClose } = openFixedSlotForm();

    const add = screen.getByTestId(testIds.events.reminders.add);
    await userEvent.click(add);
    await userEvent.click(add);
    await userEvent.selectOptions(screen.getByTestId(testIds.events.reminders.minutes(0)), "0");
    await userEvent.click(screen.getByTestId(testIds.events.reminders.remove(0)));
    expect(screen.queryByTestId(testIds.events.reminders.row(1))).not.toBeInTheDocument();

    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({
      reminders: [{ method: "popup", minutes: 30 }],
    });
  });
});

describe("EventFormModal attendees", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("splits picked teammates and contacts into their own id lists", async () => {
    const { onClose } = openFixedSlotForm();

    await userEvent.click(screen.getByTestId(testIds.events.attendeePicker.input));
    await userEvent.click(await screen.findByTestId(testIds.events.attendeePicker.option("u1")));
    await userEvent.click(await screen.findByTestId(testIds.events.attendeePicker.option("k1")));
    expect(screen.getByTestId(testIds.events.attendeePicker.chip("u1"))).toHaveTextContent(
      "Petr Novák",
    );
    expect(screen.getByTestId(testIds.events.attendeePicker.chip("k1"))).toHaveTextContent(
      "Jana Malá",
    );

    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({
      attendee_user_ids: ["u1"],
      attendee_contact_ids: ["k1"],
    });
  });

  it("offers the deal company's contacts first, including ones off the general page", async () => {
    wrap(
      <EventFormModal
        open
        onClose={vi.fn()}
        dealId="d9"
        dealName="Velká zakázka"
        companyId="c1"
        initialDate={FIXED_DAY}
      />,
    );

    await userEvent.click(screen.getByTestId(testIds.events.attendeePicker.input));
    // Beyond 100 contacts the general page needn't contain them at all.
    const scoped = await screen.findByTestId(testIds.events.attendeePicker.option("k9"));
    expect(scoped).toHaveTextContent("Karel Zeman");
    expect(screen.getAllByRole("option")[0]).toBe(scoped);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("company_id=c1"))).toBe(
      true,
    );
  });

  it("filters by name and drops a removed chip from the payload", async () => {
    const { onClose } = openFixedSlotForm();

    await userEvent.type(screen.getByTestId(testIds.events.attendeePicker.input), "mala");
    expect(
      await screen.findByTestId(testIds.events.attendeePicker.option("k1")),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(testIds.events.attendeePicker.option("u1")),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId(testIds.events.attendeePicker.option("k1")));
    await userEvent.click(screen.getByTestId(testIds.events.attendeePicker.remove("k1")));
    expect(screen.queryByTestId(testIds.events.attendeePicker.chip("k1"))).not.toBeInTheDocument();

    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({
      attendee_user_ids: [],
      attendee_contact_ids: [],
    });
  });
});

describe("EventFormModal Meet", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("offers the toggle on a healthy connection and requests a Meet link", async () => {
    setGoogleStatus({ connected: true, sync_broken: false });
    const { onClose } = openFixedSlotForm();

    await userEvent.click(await screen.findByTestId(testIds.events.meetToggle));
    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({ meet_requested: true });
  });

  it("locks the toggle off when the Google copy is switched off", async () => {
    setGoogleStatus({ connected: true, sync_broken: false });
    const { onClose } = openFixedSlotForm();

    await userEvent.click(await screen.findByTestId(testIds.events.meetToggle));
    await userEvent.click(screen.getByRole("checkbox", { name: /Přidat do Google kalendáře/ }));

    const meet = screen.getByTestId(testIds.events.meetToggle);
    expect(meet).toBeDisabled();
    expect(meet).not.toBeChecked();

    await submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastPostBody("/api/v1/events")).toMatchObject({
      add_to_google: false,
      meet_requested: false,
    });
  });

  it("locks the toggle on when the event already has a Meet link", async () => {
    setGoogleStatus({ connected: true, sync_broken: false });
    wrap(<EventFormModal open onClose={vi.fn()} event={ALL_DAY_EVENT} />);

    const meet = await screen.findByTestId(testIds.events.meetToggle);
    expect(meet).toBeChecked();
    // Google keeps the conference on update — the control must not pretend otherwise.
    expect(meet).toBeDisabled();
  });

  it("hides the toggle while Google is disconnected or the sync is broken", async () => {
    const { onClose, unmount } = openFixedSlotForm();

    await submit();
    // The round-trip settles the status query that gates the toggle.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByTestId(testIds.events.meetToggle)).not.toBeInTheDocument();
    expect(lastPostBody("/api/v1/events")).toMatchObject({ meet_requested: false });
    unmount();

    setGoogleStatus({ connected: true, sync_broken: true });
    openFixedSlotForm();
    expect(await screen.findByTestId(testIds.events.reconnectGoogle)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.events.meetToggle)).not.toBeInTheDocument();
  });
});

describe("EventFormModal edit prefill", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("prefills all-day, reminders, attendees and Meet, then replaces them on save", async () => {
    setGoogleStatus({ connected: true, sync_broken: false });
    const onClose = vi.fn();
    wrap(<EventFormModal open onClose={onClose} event={ALL_DAY_EVENT} />);

    expect(screen.getByTestId(testIds.events.allDayToggle)).toBeChecked();
    expect(screen.queryByTestId(testIds.events.timeStart)).not.toBeInTheDocument();
    expect(screen.getByTestId(testIds.events.reminders.minutes(0))).toHaveValue("60");
    expect(screen.getByTestId(testIds.events.attendeePicker.chip("k1"))).toHaveTextContent(
      "Jana Malá",
    );
    // `meet_requested` never comes back on the event — an existing link is the tell.
    expect(await screen.findByTestId(testIds.events.meetToggle)).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Uložit změny" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(lastBody("PUT", "/api/v1/events/e1")).toMatchObject({
      all_day: true,
      starts_at: "2030-03-04T00:00:00.000Z",
      ends_at: "2030-03-05T00:00:00.000Z",
      reminders: [{ method: "popup", minutes: 60 }],
      meet_requested: true,
      attendee_contact_ids: ["k1"],
      attendee_user_ids: [],
    });
  });
});
