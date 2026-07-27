import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailComposeModal } from "@/app/emails/EmailComposeModal";
import type { SentEmailOut } from "@/app/emails/useEmails";
import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";
import { ToastProvider } from "@/lib/toast";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const PARENT: SentEmailOut = {
  id: "e1",
  organization_id: "o1",
  sender_user_id: null,
  deal_id: "d1",
  company_id: "c1",
  to_emails: ["jan@acme.cz"],
  cc_emails: ["sef@acme.cz"],
  bcc_emails: [],
  subject: "Nabídka",
  body: "Ahoj",
  attachment_filenames: [],
  status: "sent",
  error: null,
  message_id: "<abc@simplecrm.cz>",
  in_reply_to_message_id: null,
  thread_id: "t1",
  sent_at: null,
  created_at: "2026-07-08T10:00:00Z",
  opened_at: null,
  open_count: 0,
  clicked_at: null,
  click_count: 0,
};

describe("EmailComposeModal", () => {
  it("prefills recipients and a Re: subject in reply mode", () => {
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    expect(screen.getByRole("heading", { name: "Odpovědět" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Re: Nabídka")).toBeInTheDocument();
    // Prefilled To/CC chips.
    expect(screen.getByText("jan@acme.cz")).toBeInTheDocument();
    expect(screen.getByText("sef@acme.cz")).toBeInTheDocument();
  });

  it("disables Odeslat until there is a recipient and subject", () => {
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" defaultTo={null} />);
    expect(screen.getByRole("button", { name: /Odeslat/ })).toBeDisabled();
  });

  it("enables Odeslat when a recipient is prefilled and a subject is typed", () => {
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    // Reply mode prefills both To and subject → send is enabled.
    expect(screen.getByRole("button", { name: /Odeslat/ })).toBeEnabled();
  });

  it("rejects an attachment with a disallowed type and blocks sending", () => {
    const { container } = wrap(
      <EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const bad = new File(["data"], "smlouva.zip", { type: "application/zip" });
    fireEvent.change(fileInput, { target: { files: [bad] } });
    expect(screen.getByText(/nepodporovaný typ/i)).toBeInTheDocument();
    expect(screen.getByText("smlouva.zip")).toBeInTheDocument();
    // Reply mode would otherwise enable send — the invalid file must block it.
    expect(screen.getByRole("button", { name: /Odeslat/ })).toBeDisabled();
  });

  it("rejects an attachment over 10 MB", () => {
    const { container } = wrap(
      <EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "velky.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(fileInput, { target: { files: [big] } });
    expect(screen.getByText(/větší než 10 MB/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Odeslat/ })).toBeDisabled();
  });

  it("accepts an allowed attachment under the limit", () => {
    const { container } = wrap(
      <EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const ok = new File(["hello"], "nabidka.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [ok] } });
    expect(screen.queryByText(/nepodporovaný typ|větší než 10 MB/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Odeslat/ })).toBeEnabled();
  });
});

const contact = (
  id: string,
  first: string,
  last: string,
  email: string | null,
): Record<string, unknown> => ({
  id,
  organization_id: "o1",
  company_id: "c1",
  first_name: first,
  last_name: last,
  position: null,
  email,
  phone: null,
  linkedin_url: null,
  note: null,
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-07-01T10:00:00Z",
});

const CONTACTS_PAGE = {
  items: [
    contact("ct1", "Jan", "Novák", "jan@acme.cz"),
    contact("ct2", "Petra", "Svobodová", "petra@acme.cz"),
    contact("ct3", "Bez", "Mailu", null),
  ],
  total: 3,
  limit: 100,
  offset: 0,
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Stub fetch for the contacts list + contact create; records every call. */
function stubFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes("/api/v1/contacts") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return jsonResponse(
          contact(
            "ct-new",
            String(body.first_name),
            String(body.last_name),
            body.email as string | null,
          ),
          201,
        );
      }
      if (u.includes("/api/v1/contacts")) return jsonResponse(CONTACTS_PAGE);
      return jsonResponse({});
    }),
  );
  return calls;
}

describe("EmailComposeModal — company contact recipients", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("suggests the company's contacts on focus and picking one adds a chip", async () => {
    stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} companyId="c1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput);
    fireEvent.focus(to);
    fireEvent.click(await screen.findByTestId(testIds.emails.compose.suggestion("to", "ct1")));
    // Chip present, and the input kept empty (no junk free-text committed).
    expect(screen.getByText("jan@acme.cz")).toBeInTheDocument();
    expect((to as HTMLInputElement).value).toBe("");
  });

  it("filters diacritics-insensitively and never offers email-less contacts", async () => {
    stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} companyId="c1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput);
    fireEvent.focus(to);
    await screen.findByTestId(testIds.emails.compose.suggestion("to", "ct1"));
    expect(screen.queryByText(/Bez Mailu/)).not.toBeInTheDocument();
    fireEvent.change(to, { target: { value: "svobodova" } });
    expect(
      screen.queryByTestId(testIds.emails.compose.suggestion("to", "ct1")),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId(testIds.emails.compose.suggestion("to", "ct2"))).toBeInTheDocument();
  });

  it("does not resuggest an address that is already a chip", async () => {
    stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} companyId="c1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput);
    fireEvent.focus(to);
    fireEvent.click(await screen.findByTestId(testIds.emails.compose.suggestion("to", "ct1")));
    fireEvent.focus(to);
    await screen.findByTestId(testIds.emails.compose.suggestion("to", "ct2"));
    expect(
      screen.queryByTestId(testIds.emails.compose.suggestion("to", "ct1")),
    ).not.toBeInTheDocument();
  });

  it("still accepts multiple free-text addresses with Enter", async () => {
    stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} companyId="c1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput);
    fireEvent.change(to, { target: { value: "kdokoli@jinde.cz" } });
    fireEvent.keyDown(to, { key: "Enter" });
    fireEvent.change(to, { target: { value: "dalsi@jinde.cz" } });
    fireEvent.keyDown(to, { key: "Enter" });
    expect(screen.getByText("kdokoli@jinde.cz")).toBeInTheDocument();
    expect(screen.getByText("dalsi@jinde.cz")).toBeInTheDocument();
  });

  it("creates a contact inline with the company prefilled and chips its email", async () => {
    const calls = stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} companyId="c1" />);
    fireEvent.focus(screen.getByTestId(testIds.emails.compose.toInput));
    fireEvent.click(await screen.findByTestId(testIds.emails.compose.newContactToggle("to")));
    const nc = testIds.emails.compose.newContact;
    fireEvent.change(screen.getByTestId(nc.firstNameInput), { target: { value: "Nový" } });
    fireEvent.change(screen.getByTestId(nc.lastNameInput), { target: { value: "Kontakt" } });
    fireEvent.change(screen.getByTestId(nc.emailInput), { target: { value: "novy@acme.cz" } });
    fireEvent.click(screen.getByTestId(nc.save));
    expect(await screen.findByText("novy@acme.cz")).toBeInTheDocument();
    const post = calls.find((c) => c.url.includes("/api/v1/contacts") && c.init?.method === "POST");
    expect(post).toBeTruthy();
    expect(JSON.parse(String(post!.init!.body))).toMatchObject({
      company_id: "c1",
      first_name: "Nový",
      last_name: "Kontakt",
      email: "novy@acme.cz",
    });
    // The sub-form collapsed after saving.
    expect(screen.queryByTestId(nc.save)).not.toBeInTheDocument();
  });

  it("offers no suggestions or contact creation without a company context", () => {
    const calls = stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" />);
    fireEvent.focus(screen.getByTestId(testIds.emails.compose.toInput));
    expect(
      screen.queryByTestId(testIds.emails.compose.newContactToggle("to")),
    ).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/api/v1/contacts"))).toBe(false);
  });

  it("does not chip leftover filter text when opening the inline new-contact form", async () => {
    stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} companyId="c1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput) as HTMLInputElement;
    to.focus();
    await screen.findByTestId(testIds.emails.compose.suggestion("to", "ct1"));
    fireEvent.change(to, { target: { value: "xyz" } });
    fireEvent.click(screen.getByTestId(testIds.emails.compose.newContactToggle("to")));
    // The sub-form's autoFocus genuinely blurred the chips input…
    expect(document.activeElement).toBe(
      screen.getByTestId(testIds.emails.compose.newContact.firstNameInput),
    );
    // …and the pending filter text neither became a chip nor survived as draft.
    expect(screen.queryByText("xyz")).not.toBeInTheDocument();
    expect(to.value).toBe("");
  });

  it("Escape closes only the dropdown first, the modal second", async () => {
    stubFetch();
    const onClose = vi.fn();
    wrap(<EmailComposeModal open onClose={onClose} companyId="c1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput);
    to.focus();
    await screen.findByTestId(testIds.emails.compose.suggestion("to", "ct1"));
    fireEvent.keyDown(to, { key: "Escape" });
    expect(
      screen.queryByTestId(testIds.emails.compose.suggestion("to", "ct1")),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(to, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the modal on the first press when no dropdown is visible", () => {
    stubFetch();
    const onClose = vi.fn();
    wrap(<EmailComposeModal open onClose={onClose} dealId="d1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput);
    // Focusing arms listOpen, but nothing can render without company contacts —
    // Escape must not be swallowed by the invisible dropdown.
    to.focus();
    fireEvent.keyDown(to, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("picks the highlighted suggestion with ArrowDown + Enter", async () => {
    stubFetch();
    wrap(<EmailComposeModal open onClose={vi.fn()} companyId="c1" />);
    const to = screen.getByTestId(testIds.emails.compose.toInput) as HTMLInputElement;
    to.focus();
    await screen.findByTestId(testIds.emails.compose.suggestion("to", "ct1"));
    fireEvent.keyDown(to, { key: "ArrowDown" });
    fireEvent.keyDown(to, { key: "Enter" });
    expect(screen.getByText("jan@acme.cz")).toBeInTheDocument();
    expect(to.value).toBe("");
  });
});

describe("EmailComposeModal — open/click tracking", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Stub fetch so the send resolves as a sent mail; records every call. */
  function stubSend() {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.includes("/api/v1/emails")) return jsonResponse({ ...PARENT, id: "e2" }, 201);
        return jsonResponse({});
      }),
    );
    return calls;
  }

  /** The compose payload rides as a JSON string inside the multipart form. */
  async function sentPayload(
    calls: { url: string; init?: RequestInit }[],
  ): Promise<Record<string, unknown>> {
    const post = calls.find((c) => c.url.includes("/api/v1/emails"));
    expect(post).toBeTruthy();
    return JSON.parse(String((post!.init!.body as FormData).get("payload"))) as Record<
      string,
      unknown
    >;
  }

  it("is on by default and sends track: true", async () => {
    const calls = stubSend();
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    const toggle = screen.getByTestId(testIds.emails.compose.trackToggle) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Odeslat/ }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/api/v1/emails"))).toBe(true));
    expect(await sentPayload(calls)).toMatchObject({ track: true });
  });

  it("sends track: false once the toggle is switched off", async () => {
    const calls = stubSend();
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    fireEvent.click(screen.getByTestId(testIds.emails.compose.trackToggle));
    expect(
      (screen.getByTestId(testIds.emails.compose.trackToggle) as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Odeslat/ }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/api/v1/emails"))).toBe(true));
    expect(await sentPayload(calls)).toMatchObject({ track: false });
  });

  it("hides the toggle and sends track: false when the org opted out", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.endsWith("/api/v1/auth/me")) {
          return jsonResponse({
            id: "u1",
            role: "salesperson",
            organization: { id: "o1", email_tracking_enabled: false },
          });
        }
        if (u.includes("/api/v1/emails")) return jsonResponse({ ...PARENT, id: "e2" }, 201);
        return jsonResponse({});
      }),
    );
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    await screen.findByText(/vypnuté/i);
    expect(screen.queryByTestId(testIds.emails.compose.trackToggle)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Odeslat/ }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/api/v1/emails"))).toBe(true));
    expect(await sentPayload(calls)).toMatchObject({ track: false });
  });
});

const TEMPLATES = [
  {
    id: "tpl1",
    name: "První oslovení",
    subject: "Nabídka pro {firma}",
    body: "Dobrý den,\nposílám nabídku.",
    created_by_user_id: null,
    created_at: "2026-07-20T10:00:00Z",
    updated_at: "2026-07-20T10:00:00Z",
  },
];

describe("EmailComposeModal — template picker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubTemplates() {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.includes("/api/v1/email-templates/merge-fields")) {
          return jsonResponse({ keys: ["firma", "kontakt", "vlastnik"] });
        }
        if (u.includes("/api/v1/email-templates")) return jsonResponse(TEMPLATES);
        return jsonResponse({});
      }),
    );
    return calls;
  }

  it("fills subject and body silently when nothing was typed", async () => {
    stubTemplates();
    const { container } = wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" />);
    const confirmSpy = vi.spyOn(window, "confirm");
    const select = await screen.findByTestId(testIds.emails.compose.templateSelect);
    fireEvent.change(select, { target: { value: "tpl1" } });
    expect(screen.getByDisplayValue("Nabídka pro {firma}")).toBeInTheDocument();
    // Raw value, not getByDisplayValue: the matcher collapses the newline.
    expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "Dobrý den,\nposílám nabídku.",
    );
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("asks before overwriting existing text and keeps it on cancel", async () => {
    stubTemplates();
    // Reply mode prefills the subject → the picker must confirm first.
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" replyTo={PARENT} />);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const select = await screen.findByTestId(testIds.emails.compose.templateSelect);
    fireEvent.change(select, { target: { value: "tpl1" } });
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue("Re: Nabídka")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Nabídka pro {firma}")).not.toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    fireEvent.change(select, { target: { value: "tpl1" } });
    expect(screen.getByDisplayValue("Nabídka pro {firma}")).toBeInTheDocument();
  });

  it("lists the server's merge fields as a hint", async () => {
    stubTemplates();
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" />);
    expect(await screen.findByText("{firma}")).toBeInTheDocument();
    expect(screen.getByText("{vlastnik}")).toBeInTheDocument();
  });

  it("renders no picker when the org has no templates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        if (u.includes("/api/v1/email-templates/merge-fields")) {
          return jsonResponse({ keys: ["firma"] });
        }
        if (u.includes("/api/v1/email-templates")) return jsonResponse([]);
        return jsonResponse({});
      }),
    );
    wrap(<EmailComposeModal open onClose={vi.fn()} dealId="d1" />);
    await screen.findByText("{firma}");
    expect(screen.queryByTestId(testIds.emails.compose.templateSelect)).not.toBeInTheDocument();
  });
});
