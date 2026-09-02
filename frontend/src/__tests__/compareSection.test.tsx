import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CompareSection } from "@/marketing/CompareSection";
import { COMPARE_ROWS, COMPARE_VENDORS } from "@/marketing/compareData";
import { testIds } from "@/lib/testids";

describe("CompareSection", () => {
  function renderSection() {
    return render(
      <MemoryRouter>
        <CompareSection />
      </MemoryRouter>,
    );
  }

  it("shows the 5-seat price cards with SimpleCRM at 495 Kč", () => {
    renderSection();
    const ours = screen.getByTestId(testIds.marketing.compare.simplecrmCard);
    expect(ours).toHaveTextContent(/495/);
    // The strongest like-for-like claim: RAYNET Professional 3 995 Kč.
    // Vendor names recur in the table header and sources — the card is first.
    expect(screen.getAllByText("RAYNET CRM")[0]?.closest("article")).toHaveTextContent(/3\s?995/);
    expect(screen.getAllByText("HubSpot Sales Hub")[0]?.closest("article")).toHaveTextContent(
      /450/,
    );
  });

  it("renders the full matrix with honest unverified cells", () => {
    renderSection();
    const table = screen.getByTestId(testIds.marketing.compare.table);
    // Header + one row per axis.
    expect(within(table).getAllByRole("row")).toHaveLength(COMPARE_ROWS.length + 1);
    // Every unverified vendor claim renders as "neuvádí", never a guessed cross.
    const expectedNotListed = COMPARE_ROWS.flatMap((r) => r.cells).filter(
      (c) => !c.tier && (c.note ?? "notListed") === "notListed",
    ).length;
    expect(within(table).getAllByText("neuvádí")).toHaveLength(expectedNotListed);
    // "Not offered" cells render as a dash.
    const dashes = COMPARE_ROWS.flatMap((r) => r.cells).filter((c) => c.note === "none").length;
    expect(within(table).getAllByText("—")).toHaveLength(dashes);
  });

  it("carries the legal small print: date, sources, trademark line", () => {
    renderSection();
    expect(screen.getByText(/Ceny k .+ z veřejných ceníků/)).toBeInTheDocument();
    for (const vendor of COMPARE_VENDORS) {
      const link = screen.getByRole("link", { name: vendor.name });
      expect(link).toHaveAttribute("href", vendor.sourceUrl);
      expect(link).toHaveAttribute("target", "_blank");
    }
    expect(screen.getByText(/ochranné známky svých vlastníků/)).toBeInTheDocument();
  });
});
