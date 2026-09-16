import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";

import { DealCardPreview } from "@/app/pipeline/DealCardPreview";

const DEAL_ID = "deal-1";

function iso(daysFromNow: number): string {
  // Fixed base so the fixtures don't drift with the clock.
  return new Date(Date.UTC(2026, 7, 12, 9, 0) + daysFromNow * 86_400_000).toISOString();
}

function event(id: string, title: string, daysFromNow: number) {
  return {
    id,
    title,
    starts_at: iso(daysFromNow),
    ends_at: iso(daysFromNow),
    organization_id: "org",
    deal_id: DEAL_ID,
    deal_name: "Deal",
    owner_user_id: null,
    description: null,
    location: null,
    google_event_id: null,
    google_sync_status: "not_synced",
    labels: [],
    created_at: iso(-10),
    updated_at: iso(-10),
  };
}

function action(id: string, label: { name: string; color: string } | null, body: string) {
  return {
    id,
    organization_id: "org",
    entity_type: "deal",
    entity_id: DEAL_ID,
    user_id: "u1",
    user_name: "Jan Novák",
    activity_type: "manual_action",
    payload: { deal_name: "Deal", note: body },
    created_at: iso(-1),
    occurred_at: iso(-3),
    label: label ? { id: `label-${id}`, ...label } : null,
    can_edit: true,
  };
}

describe("DealCardPreview", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;
  let note: string | null = null;
  let events: ReturnType<typeof event>[] = [];
  let activities: ReturnType<typeof action>[] = [];

  beforeEach(() => {
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 9, 0)));
    note = null;
    events = [];
    activities = [];
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const body = url.includes("/api/v1/events")
        ? { items: events, total: events.length, limit: 50, offset: 0 }
        : url.includes("/api/v1/activities")
          ? { items: activities, total: activities.length, limit: 50, offset: 0 }
          : url.includes(`/api/v1/deals/${DEAL_ID}`)
            ? { id: DEAL_ID, name: "Deal", note }
            : null;
      if (body === null) throw new Error(`Unexpected fetch: ${url}`);
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  function renderPreview() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider initialToken="fake">
          <DealCardPreview dealId={DEAL_ID} anchor={{ left: 0, top: 0 }} tooltipId="tip" />
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  it("shows only the nearest future event", async () => {
    events = [
      event("far", "Za týden", 7),
      event("past", "Minulý týden", -7),
      event("near", "Zítra", 1),
    ];
    renderPreview();

    expect(await screen.findByText("Zítra")).toBeInTheDocument();
    expect(screen.queryByText("Za týden")).not.toBeInTheDocument();
    // Past events belong to "Poslední akce", not to the events line.
    expect(screen.queryByText("Minulý týden")).not.toBeInTheDocument();
  });

  it("drops the events section when nothing is upcoming", async () => {
    events = [event("past", "Minulý týden", -7)];
    note = "Něco k obchodu";
    renderPreview();

    await screen.findByText("Něco k obchodu");
    expect(screen.queryByText("Minulý týden")).not.toBeInTheDocument();
  });

  it("shows the deal's own note", async () => {
    note = "Rámcová smlouva na 3 roky, fakturace čtvrtletně.";
    renderPreview();

    expect(await screen.findByText(note)).toBeInTheDocument();
  });

  it("shows the last action as its kind chip plus body, not the generic type label", async () => {
    activities = [action("a1", { name: "Hovor", color: "#6366F1" }, "Domluveno na nabídce XY")];
    renderPreview();

    expect(await screen.findByText("Hovor")).toBeInTheDocument();
    expect(screen.getByText("Domluveno na nabídce XY")).toBeInTheDocument();
    expect(screen.queryByText("Akce")).not.toBeInTheDocument();
  });

  it("falls back to the type label when the action has no kind", async () => {
    activities = [action("a1", null, "Domluveno na nabídce XY")];
    renderPreview();

    expect(await screen.findByText("Akce")).toBeInTheDocument();
    expect(screen.getByText("Domluveno na nabídce XY")).toBeInTheDocument();
  });

  it("dates the last action by when it happened, not when it was written", async () => {
    activities = [action("a1", { name: "Hovor", color: "#6366F1" }, "Domluveno")];
    renderPreview();

    await screen.findByText("Hovor");
    // occurred_at = 9. 8., created_at = 11. 8. (fixture offsets -3 / -1 days).
    expect(screen.getByText(/^9\.\s?8\.\s?2026$/)).toBeInTheDocument();
    expect(screen.queryByText(/^11\.\s?8\.\s?2026$/)).not.toBeInTheDocument();
  });

  it("stays on the empty message when the deal has no note", async () => {
    note = "   ";
    renderPreview();

    // Whitespace is not a note — the section must not appear as a blank block.
    expect(await screen.findByText(/Žádné události ani poznámky/)).toBeInTheDocument();
  });
});
