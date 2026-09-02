import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ToastProvider } from "@/lib/toast";
import { testIds } from "@/lib/testids";

import { CalendarPage } from "@/app/calendar/CalendarPage";
import type { CalendarEventOut } from "@/app/events/useEvents";

/** `YYYY-MM-DD` for today in the runner's local timezone. */
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today at a fixed local hour, as an ISO instant — lands the event under
 * today's grid cell regardless of the runner's timezone offset. */
function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const TODAY = localToday();
/** The exclusive next UTC midnight — the DB CHECK forbids ends_at == starts_at. */
const TOMORROW_UTC = new Date(`${TODAY}T00:00:00.000Z`);
TOMORROW_UTC.setUTCDate(TOMORROW_UTC.getUTCDate() + 1);

const TIMED_EVENT: CalendarEventOut = {
  id: "e1",
  organization_id: "o1",
  deal_id: "d1",
  deal_name: "Web pro Acme",
  company_id: null,
  company_name: null,
  owner_user_id: "u1",
  title: "Schůzka",
  description: null,
  location: null,
  starts_at: todayAt(10),
  ends_at: todayAt(11),
  all_day: false,
  reminders: [],
  google_event_id: null,
  google_sync_status: "not_synced",
  meet_url: "https://meet.google.com/abc-defg-hij",
  meet_requested: true,
  labels: [],
  attendees: [
    { id: "k1", kind: "contact", name: "Jana Malá", email: "jana@acme.cz" },
    { id: "u2", kind: "user", name: "Petr Novák", email: "petr@firma.cz" },
  ],
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const ALL_DAY_EVENT: CalendarEventOut = {
  id: "e2",
  organization_id: "o1",
  deal_id: null,
  deal_name: null,
  company_id: null,
  company_name: null,
  owner_user_id: "u1",
  title: "Konference",
  description: null,
  location: null,
  starts_at: `${TODAY}T00:00:00.000Z`,
  ends_at: TOMORROW_UTC.toISOString(),
  all_day: true,
  reminders: [],
  google_event_id: null,
  google_sync_status: "not_synced",
  meet_url: null,
  meet_requested: false,
  labels: [],
  attendees: [],
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const LABELS = [
  { id: "l1", organization_id: "o1", name: "Hovor", color: "#0EA5E9", usage_count: 0 },
];

const ORG_USERS = {
  items: [
    {
      id: "u2",
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

// Timed event listed first — the row order assertions only pass if the
// component itself sorts all-day events to the top.
let events: CalendarEventOut[] = [];

function installFetchMock() {
  fetchMock.mockReset();
  events = [TIMED_EVENT, ALL_DAY_EVENT];
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/v1/integrations/google-calendar")) {
      return jsonResponse({ connected: false, sync_broken: false });
    }
    if (url.includes("/api/v1/events")) {
      return jsonResponse({
        items: events,
        total: events.length,
        limit: 200,
        offset: 0,
      });
    }
    if (url.endsWith("/api/v1/event-labels")) {
      return jsonResponse(LABELS);
    }
    if (url.includes("/api/v1/users")) {
      return jsonResponse(ORG_USERS);
    }
    if (url.includes("/api/v1/contacts")) {
      return jsonResponse(CONTACTS_PAGE);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("CalendarPage day panel", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("lists the all-day event before the timed one, with a Celý den label", async () => {
    wrap(<CalendarPage />);
    const dayPanel = await screen.findByLabelText("Detail vybraného dne");

    const rows = await within(dayPanel).findAllByTestId(/^calendar-day-event-row-/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("data-testid", testIds.calendar.dayEventRow("e2"));
    expect(rows[1]).toHaveAttribute("data-testid", testIds.calendar.dayEventRow("e1"));
    expect(rows[0]).toHaveTextContent("Celý den");
    expect(rows[1]).not.toHaveTextContent("Celý den");
  });

  it("shows the attendee count and a Meet link on the timed event's row", async () => {
    wrap(<CalendarPage />);
    const dayPanel = await screen.findByLabelText("Detail vybraného dne");
    const row = await within(dayPanel).findByTestId(testIds.calendar.dayEventRow("e1"));

    expect(within(row).getByText("2 účastníci")).toBeInTheDocument();
    const meetLink = within(row).getByRole("link", { name: "Připojit se přes Google Meet" });
    expect(meetLink).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    expect(meetLink).toHaveAttribute("target", "_blank");
    expect(meetLink).toHaveAttribute("rel", "noreferrer");
  });

  it("clicking the row opens the event for edit; the delete button stops the row click", async () => {
    wrap(<CalendarPage />);
    const dayPanel = await screen.findByLabelText("Detail vybraného dne");
    const row = await within(dayPanel).findByTestId(testIds.calendar.dayEventRow("e1"));

    await userEvent.click(within(row).getByRole("button", { name: "Smazat událost Schůzka" }));
    expect(screen.getByTestId(testIds.confirmDialog.confirm)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId(testIds.confirmDialog.cancel));
    expect(screen.queryByRole("heading", { name: "Upravit událost" })).not.toBeInTheDocument();

    await userEvent.click(row);
    expect(await screen.findByRole("heading", { name: "Upravit událost" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Schůzka")).toBeInTheDocument();
  });
});

describe("CalendarPage all-day bucketing", () => {
  const originalTz = process.env.TZ;

  beforeEach(installFetchMock);

  afterEach(() => {
    process.env.TZ = originalTz;
    globalThis.fetch = originalFetch;
  });

  it("shows an all-day event on its UTC date west of Greenwich", async () => {
    process.env.TZ = "America/New_York";
    const today = localToday();
    const tomorrow = new Date(`${today}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    // Its UTC midnight falls on the previous local day here — a local-day
    // bucket would file it under yesterday and the panel would look empty.
    events = [
      {
        ...ALL_DAY_EVENT,
        starts_at: `${today}T00:00:00.000Z`,
        ends_at: tomorrow.toISOString(),
      },
    ];

    wrap(<CalendarPage />);
    const dayPanel = await screen.findByLabelText("Detail vybraného dne");

    expect(
      await within(dayPanel).findByTestId(testIds.calendar.dayEventRow("e2")),
    ).toBeInTheDocument();
  });
});
