import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";

const ME = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@ex.cz",
  name: "Admin",
  avatar_url: null,
  role: "admin",
  organization: {
    id: "00000000-0000-0000-0000-0000000000aa",
    name: "Example",
    ico: "27082440",
    locale: "cs-CZ",
    currency: "CZK",
    trial_ends_at: new Date(Date.now() + 45 * 86400 * 1000).toISOString(),
  },
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A `SentEmailListItemOut` row as served by GET /emails. */
function makeMail(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    organization_id: ME.organization.id,
    sender_user_id: ME.id,
    deal_id: "d1",
    company_id: "co1",
    direction: "outbound",
    from_email: null,
    to_emails: ["jan@acme.cz"],
    cc_emails: [],
    bcc_emails: [],
    subject: "Nabídka služeb",
    body: "Dobrý den,\nposílám nabídku.",
    attachment_filenames: [],
    status: "sent",
    error: null,
    message_id: "<m1@simplecrm.cz>",
    in_reply_to_message_id: null,
    thread_id: "t1",
    sent_at: "2026-07-30T09:00:00+00:00",
    created_at: "2026-07-30T09:00:00+00:00",
    opened_at: null,
    open_count: 0,
    clicked_at: null,
    click_count: 0,
    company_name: "Acme s.r.o.",
    deal_name: "Velká zakázka",
    sender_name: "Admin",
    ...overrides,
  };
}

function pageOf(items: unknown[]) {
  return { items, total: items.length, limit: 25, offset: 0 };
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Mail page", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /** Shared route table; per-test rows via `mails`. */
  function stubApi(mails: unknown[], detail?: unknown) {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse(ME);
      if (detail && /\/api\/v1\/emails\/[^?]+$/.test(url)) return jsonResponse(detail);
      if (url.includes("/api/v1/emails?")) return jsonResponse(pageOf(mails));
      if (url.includes("/api/v1/companies")) return jsonResponse(pageOf([]));
      if (url.includes("/api/v1/deals")) return jsonResponse(pageOf([]));
      if (url.endsWith("/api/v1/me/inbound-address"))
        return jsonResponse({ address: "bcc+tajny@in.simplecrm.cz" });
      throw new Error(`Unexpected fetch: ${url}`);
    });
  }

  it("lists captured mail with direction badge and entity names", async () => {
    stubApi([
      makeMail(),
      makeMail({
        id: "e2",
        direction: "inbound",
        from_email: "petr@klient.cz",
        subject: "Dotaz k nabídce",
        company_name: null,
        deal_name: null,
        company_id: null,
        deal_id: null,
      }),
    ]);
    renderAt("/app/emails");

    expect(await screen.findByRole("button", { name: "Nabídka služeb" })).toBeInTheDocument();
    expect(screen.getByText("Acme s.r.o.")).toBeInTheDocument();
    expect(screen.getByText("Velká zakázka")).toBeInTheDocument();
    // Inbound row carries the "received" badge and the correspondent.
    expect(screen.getByTestId(testIds.emails.history.inboundBadge("e2"))).toBeInTheDocument();
    expect(screen.getAllByText(/petr@klient\.cz/).length).toBeGreaterThan(0);
  });

  it("maps the Nepřiřazené quick filter to unmatched=true", async () => {
    stubApi([makeMail()]);
    renderAt("/app/emails");
    await screen.findByRole("button", { name: "Nabídka služeb" });

    await userEvent.selectOptions(screen.getByTestId(testIds.emails.mail.typeFilter), "unmatched");
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) =>
        typeof c[0] === "string" ? c[0] : (c[0] as Request).url,
      );
      expect(urls.some((u) => u.includes("/api/v1/emails?") && u.includes("unmatched=true"))).toBe(
        true,
      );
    });
  });

  it("opens the detail modal with body and thread from a row's subject", async () => {
    const row = makeMail();
    stubApi([row], { ...row, thread: [row] });
    renderAt("/app/emails");

    await userEvent.click(await screen.findByRole("button", { name: "Nabídka služeb" }));
    const dialog = await screen.findByTestId(testIds.emails.mail.detailDialog);
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByText(/posílám nabídku/)).toBeInTheDocument();
    // Reply is offered on the Mail page (it hosts the compose modal).
    expect(screen.getByTestId(testIds.emails.mail.detailReply)).toBeInTheDocument();
  });

  it("shows the personal Smart-BCC address behind the ? help", async () => {
    stubApi([makeMail()]);
    renderAt("/app/emails");
    await screen.findByRole("button", { name: "Nabídka služeb" });

    await userEvent.click(screen.getByTestId(testIds.emails.mail.helpButton));
    expect(await screen.findByTestId(testIds.emails.mail.helpDialog)).toBeInTheDocument();
    expect(await screen.findByText("bcc+tajny@in.simplecrm.cz")).toBeInTheDocument();
  });
});
