import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MergeFieldHint } from "@/app/emails/EmailTemplatePicker";
import { EmailTemplatesSection } from "@/app/settings/EmailTemplatesSection";
import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";

const TEMPLATE = {
  id: "tpl1",
  name: "První oslovení",
  subject: "Nabídka pro {firma}",
  body: "Dobrý den,",
  created_by_user_id: null,
  created_at: "2026-07-20T10:00:00Z",
  updated_at: "2026-07-20T10:00:00Z",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Stub /auth/me with `role`, the template list and the merge vocabulary. */
function stubFetch(role: string, templates: unknown[] = [TEMPLATE]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse({ id: "u1", role });
      if (url.includes("/api/v1/email-templates/merge-fields")) {
        return jsonResponse({ keys: ["firma", "kontakt"] });
      }
      if (url.includes("/api/v1/email-templates")) {
        if (init?.method === "POST") return jsonResponse({ ...TEMPLATE, id: "tpl2" }, 201);
        if (init?.method === "DELETE") return new Response(null, { status: 204 });
        return jsonResponse(templates);
      }
      throw new Error(`Unexpected: ${url}`);
    }),
  );
  return calls;
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <EmailTemplatesSection />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("EmailTemplatesSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists templates and offers management to a manager", async () => {
    stubFetch("manager");
    renderSection();
    expect(await screen.findByText("První oslovení")).toBeInTheDocument();
    expect(screen.getByTestId(testIds.settings.emailTemplates.add)).toBeInTheDocument();
    expect(screen.getByTestId(testIds.settings.emailTemplates.edit("tpl1"))).toBeInTheDocument();
    expect(screen.getByTestId(testIds.settings.emailTemplates.remove("tpl1"))).toBeInTheDocument();
  });

  it("is read-only for a salesperson (backend gate mirrored)", async () => {
    stubFetch("salesperson");
    renderSection();
    // The list itself stays visible — reps pick templates when composing.
    expect(await screen.findByText("První oslovení")).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.settings.emailTemplates.add)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(testIds.settings.emailTemplates.edit("tpl1")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(testIds.settings.emailTemplates.remove("tpl1")),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/spravují administrátoři a manažeři/i)).toBeInTheDocument();
  });

  it("creates a template through the editor dialog", async () => {
    const calls = stubFetch("admin", []);
    renderSection();
    fireEvent.click(await screen.findByTestId(testIds.settings.emailTemplates.add));
    fireEvent.change(screen.getByTestId(testIds.settings.emailTemplates.nameInput), {
      target: { value: "  Follow-up  " },
    });
    fireEvent.change(screen.getByTestId(testIds.settings.emailTemplates.subjectInput), {
      target: { value: "Ozvěte se" },
    });
    fireEvent.change(screen.getByTestId(testIds.settings.emailTemplates.bodyInput), {
      target: { value: "Dobrý den," },
    });
    fireEvent.click(screen.getByTestId(testIds.settings.emailTemplates.save));

    await waitFor(() => expect(calls.some((c) => c.init?.method === "POST")).toBe(true));
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(String(post.init!.body))).toEqual({
      name: "Follow-up",
      subject: "Ozvěte se",
      body: "Dobrý den,",
    });
    // Dialog closed on success.
    await waitFor(() =>
      expect(screen.queryByTestId(testIds.settings.emailTemplates.save)).not.toBeInTheDocument(),
    );
  });

  it("refuses to save without a name and reports a duplicate name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/me")) return jsonResponse({ id: "u1", role: "admin" });
        if (url.includes("/api/v1/email-templates/merge-fields")) {
          return jsonResponse({ keys: ["firma"] });
        }
        if (url.includes("/api/v1/email-templates")) {
          if (init?.method === "POST") {
            return jsonResponse({ detail: "Šablona s tímto názvem už existuje." }, 409);
          }
          return jsonResponse([]);
        }
        throw new Error(`Unexpected: ${url}`);
      }),
    );
    renderSection();
    fireEvent.click(await screen.findByTestId(testIds.settings.emailTemplates.add));
    fireEvent.click(screen.getByTestId(testIds.settings.emailTemplates.save));
    expect(await screen.findByRole("alert")).toHaveTextContent(/název a předmět/i);

    fireEvent.change(screen.getByTestId(testIds.settings.emailTemplates.nameInput), {
      target: { value: "První oslovení" },
    });
    fireEvent.change(screen.getByTestId(testIds.settings.emailTemplates.subjectInput), {
      target: { value: "Nabídka" },
    });
    fireEvent.click(screen.getByTestId(testIds.settings.emailTemplates.save));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/tímto názvem už existuje/i),
    );
  });

  it("inserts a merge field at the cursor in the body", async () => {
    stubFetch("admin", []);
    renderSection();
    fireEvent.click(await screen.findByTestId(testIds.settings.emailTemplates.add));
    const body = screen.getByTestId(
      testIds.settings.emailTemplates.bodyInput,
    ) as HTMLTextAreaElement;
    fireEvent.change(body, { target: { value: "Dobrý den, " } });
    body.focus();
    fireEvent.focus(body);
    body.setSelectionRange(body.value.length, body.value.length);
    // The chip list only mounts with the dialog, so its query resolves late.
    fireEvent.click(await screen.findByTestId(testIds.settings.emailTemplates.mergeChip("firma")));
    await waitFor(() => expect(body.value).toBe("Dobrý den, {firma}"));
  });

  it("deletes only after the confirm", async () => {
    const calls = stubFetch("admin");
    renderSection();
    fireEvent.click(await screen.findByTestId(testIds.settings.emailTemplates.remove("tpl1")));
    fireEvent.click(screen.getByTestId(testIds.confirmDialog.cancel));
    expect(calls.some((c) => c.init?.method === "DELETE")).toBe(false);

    fireEvent.click(screen.getByTestId(testIds.settings.emailTemplates.remove("tpl1")));
    fireEvent.click(screen.getByTestId(testIds.confirmDialog.confirm));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "DELETE")).toBe(true));
  });
});

describe("MergeFieldHint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubVocabulary() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/me")) return jsonResponse({ id: "u1", role: "admin" });
        if (url.includes("/api/v1/email-templates/merge-fields")) {
          return jsonResponse({
            keys: ["firma", "kontakt", "obchod", "hodnota"],
            deal_keys: ["obchod", "hodnota"],
          });
        }
        throw new Error(`Unexpected: ${url}`);
      }),
    );
  }

  function renderHint(props: { excludeDealFields?: boolean } = {}) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <AuthProvider initialToken="fake">
          <MergeFieldHint {...props} />
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  it("lists the whole vocabulary by default", async () => {
    stubVocabulary();
    renderHint();
    expect(await screen.findByText("{obchod}")).toBeInTheDocument();
    expect(screen.getByText("{hodnota}")).toBeInTheDocument();
    expect(screen.getByText("{firma}")).toBeInTheDocument();
  });

  it("hides the deal-only fields on a surface that has no deal", async () => {
    // The bulk-email wizard: `send_campaign` builds its merge context without
    // a deal, so advertising {obchod}/{hodnota} would promise an empty
    // substitution.
    stubVocabulary();
    renderHint({ excludeDealFields: true });
    expect(await screen.findByText("{firma}")).toBeInTheDocument();
    expect(screen.getByText("{kontakt}")).toBeInTheDocument();
    expect(screen.queryByText("{obchod}")).not.toBeInTheDocument();
    expect(screen.queryByText("{hodnota}")).not.toBeInTheDocument();
  });
});
