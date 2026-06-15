import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";

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

describe("Landing page", () => {
  it("renders the hero, differentiators, pricing, and FAQ sections", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: /CRM pro prodej/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Co u nás najdete/i }),
    ).toBeInTheDocument();
    // Bulk email is mentioned among the differentiators.
    expect(
      screen.getByRole("heading", { level: 3, name: /Hromadné nabídky e-mailem/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Jedna cena/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Časté otázky/i })).toBeInTheDocument();
    // The price per user appears on the paid tier card.
    expect(screen.getByText(/99 Kč/)).toBeInTheDocument();
    // Trial CTAs route into the signup form (which itself offers email + Google).
    const ctas = screen.getAllByRole("link", { name: /Vyzkoušet 30 dní zdarma|Vyzkoušet zdarma/i });
    expect(ctas.length).toBeGreaterThan(0);
    expect(ctas[0]).toHaveAttribute("href", "/signup");
  });

  it("expands and collapses an FAQ entry", async () => {
    const user = userEvent.setup();
    renderAt("/");
    const aresQuestion = screen.getByRole("button", { name: /ARES integrace/i });
    // The first FAQ item is open by default.
    expect(aresQuestion).toHaveAttribute("aria-expanded", "false");
    await user.click(aresQuestion);
    expect(aresQuestion).toHaveAttribute("aria-expanded", "true");
    await user.click(aresQuestion);
    expect(aresQuestion).toHaveAttribute("aria-expanded", "false");
  });
});
