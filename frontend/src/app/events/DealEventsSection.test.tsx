import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ToastProvider } from "@/lib/toast";

import { DealEventsSection } from "@/app/events/DealEventsSection";
import type { CalendarEventOut } from "@/app/events/useEvents";

const TIMED_EVENT: CalendarEventOut = {
  id: "e1",
  organization_id: "o1",
  deal_id: "d1",
  deal_name: "Web pro Acme",
  company_id: "c1",
  company_name: "Acme s.r.o.",
  owner_user_id: "u1",
  title: "Schůzka",
  description: null,
  location: null,
  starts_at: "2030-05-01T10:00:00.000Z",
  ends_at: "2030-05-01T11:00:00.000Z",
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
  deal_id: "d1",
  deal_name: "Web pro Acme",
  company_id: "c1",
  company_name: "Acme s.r.o.",
  owner_user_id: "u1",
  title: "Workshop",
  description: null,
  location: null,
  starts_at: "2030-05-02T00:00:00.000Z",
  ends_at: "2030-05-03T00:00:00.000Z",
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
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("/api/v1/integrations/google-calendar")) {
      return jsonResponse({ connected: false, sync_broken: false });
    }
    if (url.includes("/api/v1/events")) {
      return jsonResponse({ items: [TIMED_EVENT, ALL_DAY_EVENT], total: 2, limit: 200, offset: 0 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("DealEventsSection", () => {
  beforeEach(installFetchMock);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("shows attendee count and a Meet link for a timed event, and the all-day label for an all-day one", async () => {
    wrap(<DealEventsSection dealId="d1" dealName="Web pro Acme" locale="cs-CZ" />);

    await userEvent.click(await screen.findByRole("button", { name: /Události/ }));

    expect(await screen.findByText("2 účastníci")).toBeInTheDocument();
    const meetLink = screen.getByRole("link", { name: "Připojit se přes Google Meet" });
    expect(meetLink).toHaveAttribute("href", "https://meet.google.com/abc-defg-hij");
    expect(meetLink).toHaveAttribute("target", "_blank");
    expect(meetLink).toHaveAttribute("rel", "noreferrer");

    // The all-day row shows the label instead of a time range; the timed
    // row's own text never picks it up.
    const allDayRow = screen.getByText("Workshop").closest("li");
    const timedRow = screen.getByText("Schůzka").closest("li");
    expect(allDayRow).toHaveTextContent("Celý den");
    expect(timedRow).not.toHaveTextContent("Celý den");
  });
});
