import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

function renderAt(path: string) {
  // Stub the public reads so the page renders deterministically without network.
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

describe("/cenik pricing page", () => {
  it("renders the three plan cards with prices and bullets", () => {
    renderAt("/cenik");
    expect(
      screen.getByRole("heading", { level: 1, name: /Cena za to, co nabízíme/i }),
    ).toBeInTheDocument();

    // Three card headings.
    const monthlyCard = screen
      .getByRole("heading", { level: 2, name: /^Měsíční$/ })
      .closest("article")!;
    const annualCard = screen
      .getByRole("heading", { level: 2, name: /^Roční$/ })
      .closest("article")!;
    const enterpriseCard = screen
      .getByRole("heading", { level: 2, name: /^Enterprise$/ })
      .closest("article")!;

    // Prices via PriceDisplay (Intl.NumberFormat → "99 Kč", "996 Kč" with cs-CZ NBSP).
    expect(within(monthlyCard).getByText(/99\s?Kč/)).toBeInTheDocument();
    expect(within(annualCard).getByText(/996\s?Kč/)).toBeInTheDocument();
    expect(within(enterpriseCard).getByText(/Vlastní balíček/)).toBeInTheDocument();

    // Annual savings caption.
    expect(screen.getByText(/Ušetříte 192 Kč na uživatele/)).toBeInTheDocument();

    // Recommended badge appears exactly once.
    expect(screen.getAllByText(/Doporučujeme/i)).toHaveLength(1);

    // Below-cards helper copy (is_vat_payer = false branch).
    expect(screen.getByText(/Všechny ceny jsou bez DPH/)).toBeInTheDocument();
    expect(screen.getByText(/Žádná kreditní karta při registraci/)).toBeInTheDocument();
  });

  it("Enterprise CTA is a mailto link", () => {
    renderAt("/cenik");
    const enterpriseHeading = screen.getByRole("heading", { level: 2, name: /^Enterprise$/ });
    const card = enterpriseHeading.closest("article");
    expect(card).not.toBeNull();
    const cta = within(card!).getByRole("link", { name: /Domluvte se s námi/i });
    expect(cta).toHaveAttribute("href", expect.stringMatching(/^mailto:podpora@simplecrm\.cz/));
  });

  it("monthly and annual CTAs route to /login", () => {
    renderAt("/cenik");
    const monthlyHeading = screen.getByRole("heading", { level: 2, name: /^Měsíční$/ });
    const monthlyCta = within(monthlyHeading.closest("article")!).getByRole("link", {
      name: /Vyzkoušet 30 dní zdarma/i,
    });
    expect(monthlyCta).toHaveAttribute("href", "/login");

    const annualHeading = screen.getByRole("heading", { level: 2, name: /^Roční$/ });
    const annualCta = within(annualHeading.closest("article")!).getByRole("link", {
      name: /Vyzkoušet 30 dní zdarma/i,
    });
    expect(annualCta).toHaveAttribute("href", "/login");
  });
});
