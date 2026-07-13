import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import i18n from "@/lib/i18n";
import { ToastProvider } from "@/lib/toast";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderSwitcher(persistToAccount: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <ToastProvider>
          <LanguageSwitcher persistToAccount={persistToAccount} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("LanguageSwitcher", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(async () => {
    globalThis.fetch = originalFetch;
    // Reset the shared i18n singleton so the next test starts in Czech.
    await i18n.changeLanguage("cs");
  });

  it("switches the UI and persists the choice to the account", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/api/v1/users/me/language")) return jsonResponse({ language: "en" });
      throw new Error(`Unexpected request: ${url}`);
    });

    renderSwitcher(true);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));

    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));

    const call = fetchMock.mock.calls.find(([u]) =>
      String(u).includes("/api/v1/users/me/language"),
    );
    expect(call).toBeTruthy();
    const init = call?.[1];
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ language: "en" });
  });

  it("switches the UI without touching the API when not persisting", async () => {
    renderSwitcher(false);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));

    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
