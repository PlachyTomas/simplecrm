import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import i18n from "@/lib/i18n";
import { counterpartPath, marketingPath } from "@/marketing/slugs";

/** Public reads used by CenikPage — stubbed so the page renders offline. */
function stubPublicFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/v1/plans/billing-settings/public")) {
        return new Response(
          JSON.stringify({
            is_vat_payer: false,
            vat_rate_percent: "21.00",
            contact_email: "podpora@simplecrm.cz",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/api/v1/plans/public")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken={null}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("marketing slugs", () => {
  it("marketingPath returns the per-language slug", () => {
    expect(marketingPath("cenik", "cs")).toBe("/cenik");
    expect(marketingPath("cenik", "en")).toBe("/en/pricing");
    expect(marketingPath("landing", "en")).toBe("/en");
  });

  it("counterpartPath maps cs <-> en and is null for non-marketing paths", () => {
    expect(counterpartPath("/cenik")).toBe("/en/pricing");
    expect(counterpartPath("/en/pricing")).toBe("/cenik");
    expect(counterpartPath("/")).toBe("/en");
    expect(counterpartPath("/en")).toBe("/");
    expect(counterpartPath("/obchodni-podminky")).toBeNull();
    expect(counterpartPath("/en/cenik")).toBeNull();
  });
});

describe("marketing routing", () => {
  beforeEach(() => stubPublicFetch());
  afterEach(async () => {
    vi.unstubAllGlobals();
    // Reset the shared i18n singleton so the next test starts in Czech.
    await i18n.changeLanguage("cs");
  });

  it("renders /cenik in Czech", async () => {
    renderAt("/cenik");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Cena za to, co nabízíme/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("cs"));
  });

  it("renders /en/pricing with the English resolved language", async () => {
    renderAt("/en/pricing");
    // The pricing page renders in English and the running language flips.
    expect(
      await screen.findByRole("heading", { level: 1, name: /Priced for what we offer/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
  });

  it("redirects a Czech slug under /en to its English counterpart", async () => {
    renderAt("/en/cenik");
    // If the redirect fired we land on CenikPage (its heading), not the 404.
    expect(
      await screen.findByRole("heading", { level: 1, name: /Priced for what we offer/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(i18n.resolvedLanguage).toBe("en"));
  });

  it("serves an English 404 for unknown /en paths", async () => {
    renderAt("/en/does-not-exist");
    expect(
      await screen.findByRole("heading", { level: 1, name: /Page not found/i }),
    ).toBeInTheDocument();
  });

  it("emits cs / en / x-default hreflang alternates on a marketing page", async () => {
    renderAt("/cenik");
    await waitFor(() => {
      const cs = document.head.querySelector('link[rel="alternate"][hreflang="cs"]');
      const en = document.head.querySelector('link[rel="alternate"][hreflang="en"]');
      const xDefault = document.head.querySelector('link[rel="alternate"][hreflang="x-default"]');
      expect(cs?.getAttribute("href")).toMatch(/\/cenik$/);
      expect(en?.getAttribute("href")).toMatch(/\/en\/pricing$/);
      expect(xDefault?.getAttribute("href")).toMatch(/\/cenik$/);
    });
  });
});
