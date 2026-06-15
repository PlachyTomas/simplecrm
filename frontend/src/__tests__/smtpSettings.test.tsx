import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SmtpSettingsCard } from "@/app/settings/SmtpSettingsCard";
import { AuthProvider } from "@/auth/AuthContext";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="fake">
        <ul>
          <SmtpSettingsCard />
        </ul>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("SmtpSettingsCard", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("shows the card and disables the test button when unconfigured", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse({ id: "1", role: "admin" });
      if (url.includes("/api/v1/me/smtp")) return jsonResponse({ configured: false });
      throw new Error(`Unexpected: ${url}`);
    });

    renderCard();
    expect(await screen.findByText(/odesílání e-mailů \(smtp\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /otestovat připojení/i })).toBeDisabled();
  });

  it("prefills and shows the verified badge + enabled test when configured", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.endsWith("/api/v1/auth/me")) return jsonResponse({ id: "1", role: "admin" });
      if (url.includes("/api/v1/me/smtp")) {
        return jsonResponse({
          host: "mail.firma.cz",
          port: 587,
          use_ssl: false,
          use_starttls: true,
          username: "jan@firma.cz",
          from_email: "jan@firma.cz",
          from_name: "Jan",
          has_password: true,
          verified: true,
          verified_at: "2026-06-15T10:00:00+00:00",
        });
      }
      throw new Error(`Unexpected: ${url}`);
    });

    renderCard();
    await waitFor(() =>
      expect((screen.getByDisplayValue("mail.firma.cz") as HTMLInputElement).value).toBe(
        "mail.firma.cz",
      ),
    );
    expect(screen.getByText(/^Ověřeno$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /otestovat připojení/i })).toBeEnabled();
  });
});
