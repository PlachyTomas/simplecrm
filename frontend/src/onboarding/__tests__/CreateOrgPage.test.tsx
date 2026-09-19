import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { testIds } from "@/lib/testids";
import { CreateOrgPage } from "@/onboarding/CreateOrgPage";

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialToken="test-token">
        <MemoryRouter initialEntries={["/create-organization"]}>
          <CreateOrgPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("CreateOrgPage business declaration", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/plans") ? [] : {};
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
  });

  it("shows the declaration on the first step and continues without a checkbox", () => {
    renderPage();
    const next = screen.getByTestId(testIds.onboarding.wizard.next);
    expect(next).toBeEnabled();
    expect(screen.getByTestId(testIds.onboarding.wizard.declaration)).toHaveTextContent(
      /Pokračováním na další krok potvrzuji/,
    );

    fireEvent.change(screen.getByTestId(testIds.onboarding.wizard.nameInput), {
      target: { value: "Acme s.r.o." },
    });
    fireEvent.click(next);
    expect(screen.getByTestId(testIds.onboarding.wizard.seatCountInput)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.onboarding.wizard.declaration)).not.toBeInTheDocument();
  });

  it("links every legal document in a new tab", () => {
    renderPage();
    const hrefs = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("target") === "_blank")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/obchodni-podminky",
        "/reklamacni-podminky",
        "/dodaci-a-platebni-podminky",
        "/zpracovatelska-smlouva",
      ]),
    );
  });
});
