import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
        <ToastProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const COMPOSED = {
  id: "out-1",
  subject: "Nabídka spolupráce",
  direction: "outbound",
  campaign_id: null,
  from_email: null,
  to_emails: ["petr@zakaznik.cz"],
  cc_emails: [],
  bcc_emails: [],
  status: "sent",
  error: null,
  opened_at: null,
  open_count: 0,
  clicked_at: null,
  click_count: 0,
  sent_at: "2026-09-01T10:00:00+00:00",
  created_at: "2026-09-01T10:00:00+00:00",
};

const FROM_CAMPAIGN = {
  ...COMPOSED,
  id: "camp-row-1",
  subject: "Podzimní akce pro Acme",
  campaign_id: "campaign-1",
  sent_at: "2026-09-02T10:00:00+00:00",
  created_at: "2026-09-02T10:00:00+00:00",
};

describe("EmailHistorySection — campaign rows and parked composer", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse({ id: "1", role: "admin" });
      if (url.includes("/api/v1/emails"))
        return jsonResponse({ items: [FROM_CAMPAIGN, COMPOSED], total: 2, limit: 50, offset: 0 });
      throw new Error(`Unexpected: ${url}`);
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("badges rows mirrored from a bulk campaign and links them to the campaign history", async () => {
    renderWithProviders(<EmailHistorySection companyId="c-1" locale="cs" />);

    const campaignRow = await screen.findByTestId(testIds.emails.history.row("camp-row-1"));
    const badge = within(campaignRow).getByTestId(
      testIds.emails.history.campaignBadge("camp-row-1"),
    );
    expect(badge).toHaveTextContent("Hromadný e-mail");
    expect(badge).toHaveAttribute("href", "/app/email-campaigns");

    const composedRow = screen.getByTestId(testIds.emails.history.row("out-1"));
    expect(
      within(composedRow).queryByTestId(testIds.emails.history.campaignBadge("out-1")),
    ).not.toBeInTheDocument();
  });

  it("offers Reply only when a handler is wired (the composer is parked otherwise)", async () => {
    renderWithProviders(<EmailHistorySection companyId="c-1" locale="cs" />);
    await screen.findByTestId(testIds.emails.history.row("out-1"));
    expect(screen.queryByRole("button", { name: /Odpovědět/ })).not.toBeInTheDocument();
  });
});
