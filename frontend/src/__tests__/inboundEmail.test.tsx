import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmailHistorySection } from "@/app/emails/EmailHistorySection";
import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";
import { ToastProvider } from "@/lib/toast";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const OUTBOUND = {
  id: "out-1",
  subject: "Nabídka spolupráce",
  direction: "outbound",
  from_email: null,
  to_emails: ["petr@zakaznik.cz"],
  cc_emails: [],
  bcc_emails: [],
  status: "sent",
  error: null,
  opened_at: "2026-07-25T10:05:00+00:00",
  open_count: 2,
  clicked_at: null,
  click_count: 0,
  sent_at: "2026-07-25T10:00:00+00:00",
  created_at: "2026-07-25T10:00:00+00:00",
};

const INBOUND = {
  id: "in-1",
  subject: "Re: Nabídka spolupráce",
  direction: "inbound",
  from_email: "petr@zakaznik.cz",
  // Original recipients of the captured mail — the user's own mailbox, which
  // is exactly why the row must not render them as "To".
  to_emails: ["jan@vasefirma.cz"],
  cc_emails: [],
  bcc_emails: [],
  status: "sent",
  error: null,
  opened_at: null,
  open_count: 0,
  clicked_at: null,
  click_count: 0,
  // The mail was written days before we captured it — a user BCCing an old
  // thread. The row must date it by the message, not by our capture time.
  sent_at: "2026-07-20T12:00:00+00:00",
  created_at: "2026-07-25T11:00:00+00:00",
};

describe("EmailHistorySection — inbound rows", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    // Newest first, exactly as the backend orders it (created_at desc).
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse({ id: "1", role: "admin" });
      if (url.includes("/api/v1/emails"))
        return jsonResponse({ items: [INBOUND, OUTBOUND], total: 2, limit: 50, offset: 0 });
      throw new Error(`Unexpected: ${url}`);
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("marks an inbound row as received, shows the sender, and hides tracking chips", async () => {
    renderWithProviders(
      <EmailHistorySection companyId="c-1" locale="cs" onReply={() => undefined} />,
    );

    const inboundRow = await screen.findByTestId(testIds.emails.history.row("in-1"));
    expect(
      within(inboundRow).getByTestId(testIds.emails.history.inboundBadge("in-1")),
    ).toHaveTextContent("Přijato");
    // Correspondent shown as From, never the captured To (our own mailbox).
    expect(within(inboundRow).getByText(/Od: petr@zakaznik\.cz/)).toBeInTheDocument();
    expect(within(inboundRow).queryByText(/jan@vasefirma\.cz/)).not.toBeInTheDocument();
    // Nothing to track on a received mail — no open/click pills.
    expect(within(inboundRow).queryByText(/Otevřeno/)).not.toBeInTheDocument();
    expect(within(inboundRow).queryByText(/Prokliknuto/)).not.toBeInTheDocument();
    // Dated by the message's own Date header (sent_at), not by when the
    // capture endpoint stored it (created_at, five days later here).
    expect(within(inboundRow).getByText(/20\. 7\. 2026/)).toBeInTheDocument();
    expect(within(inboundRow).queryByText(/25\. 7\. 2026/)).not.toBeInTheDocument();

    const outboundRow = screen.getByTestId(testIds.emails.history.row("out-1"));
    expect(within(outboundRow).getByText("Odesláno")).toBeInTheDocument();
    expect(within(outboundRow).getByText("Otevřeno 2×")).toBeInTheDocument();
    expect(within(outboundRow).getByText(/Komu: petr@zakaznik\.cz/)).toBeInTheDocument();
    expect(
      within(outboundRow).queryByTestId(testIds.emails.history.inboundBadge("out-1")),
    ).not.toBeInTheDocument();

    // Server order (chronological, newest first) is rendered as-is.
    const rows = screen.getAllByTestId(/^email-history-row-/);
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      testIds.emails.history.row("in-1"),
      testIds.emails.history.row("out-1"),
    ]);
  });
});
