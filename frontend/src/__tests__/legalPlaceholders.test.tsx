import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import { PLACEHOLDER_MARKERS } from "@/marketing/legal-entity";

/**
 * Belt-and-braces against shipping the site with unreplaced legal text.
 * `isLegalEntityReady()` only checks LEGAL_ENTITY fields; this test renders
 * every legal page and asserts none of `PLACEHOLDER_MARKERS` appears in the
 * rendered DOM. Catches stray "bude doplněno" or "TODO_" inside JSX bodies.
 */

const LEGAL_ROUTES = [
  "/obchodni-podminky",
  "/ochrana-osobnich-udaju",
  "/zpracovatelska-smlouva",
  "/cookies",
  "/predplatne",
  "/kontakt",
  "/reklamacni-podminky",
  "/dodaci-a-platebni-podminky",
];

function renderAt(path: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
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

describe("legal pages have no unreplaced placeholders", () => {
  for (const route of LEGAL_ROUTES) {
    it(`${route} contains no placeholder markers`, () => {
      const { container } = renderAt(route);
      const haystack = (container.textContent ?? "").toLowerCase();
      for (const marker of PLACEHOLDER_MARKERS) {
        expect(haystack, `marker "${marker}" found at ${route}`).not.toContain(
          marker.toLowerCase(),
        );
      }
    });
  }
});
