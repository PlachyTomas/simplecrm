import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ActivityRow, type ActivityItem } from "@/app/activities/ActivityRow";

function makeActivity(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: "act-1",
    organization_id: "org-1",
    entity_type: "deal",
    entity_id: "deal-1",
    user_id: "user-1",
    activity_type: "stage_change",
    payload: {},
    created_at: "2026-07-08T12:00:00Z",
    ...overrides,
  };
}

function renderRow(activity: ActivityItem) {
  return render(
    <ol>
      <ActivityRow activity={activity} />
    </ol>,
  );
}

describe("ActivityRow", () => {
  it("names the deal and the action for deal-scoped rows", () => {
    renderRow(
      makeActivity({
        activity_type: "stage_change",
        payload: {
          deal_name: "Velký obchod",
          from_stage_name: "Nový",
          to_stage_name: "Nabídka",
        },
      }),
    );
    expect(screen.getByText(/Obchod „Velký obchod“/)).toBeInTheDocument();
    expect(screen.getByText("Změna fáze", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Fáze: Nový → Nabídka")).toBeInTheDocument();
  });

  it("shows the bare action label when the row has no deal", () => {
    renderRow(
      makeActivity({
        entity_type: "company",
        activity_type: "company_updated",
        payload: { changes: { email: { from: "a@x.cz", to: "b@x.cz" } } },
      }),
    );
    expect(screen.getByText("Firma upravena")).toBeInTheDocument();
    expect(screen.queryByText(/Obchod/)).not.toBeInTheDocument();
  });

  it("renders each edited field as 'Label: old → new'", () => {
    renderRow(
      makeActivity({
        activity_type: "deal_updated",
        payload: {
          deal_name: "Obchod A",
          changes: {
            name: { from: "Staré", to: "Nové" },
            value: { from: "100", to: "200" },
          },
        },
      }),
    );
    expect(screen.getByText("Název:")).toBeInTheDocument();
    expect(screen.getByText(/Staré → Nové/)).toBeInTheDocument();
    expect(screen.getByText("Hodnota:")).toBeInTheDocument();
    expect(screen.getByText(/100 → 200/)).toBeInTheDocument();
  });

  it("renders a null/blank side of a change as an em dash", () => {
    renderRow(
      makeActivity({
        activity_type: "deal_updated",
        payload: { changes: { note: { from: null, to: "Nová poznámka" } } },
      }),
    );
    expect(screen.getByText(/— → Nová poznámka/)).toBeInTheDocument();
  });

  it("collapses more than three changed fields behind a toggle", () => {
    renderRow(
      makeActivity({
        activity_type: "deal_updated",
        payload: {
          changes: {
            name: { from: "a", to: "b" },
            value: { from: "1", to: "2" },
            currency: { from: "CZK", to: "EUR" },
            note: { from: "x", to: "y" },
            phone: { from: "111", to: "222" },
          },
        },
      }),
    );
    // Only the first two fields render up front.
    expect(screen.getByText("Název:")).toBeInTheDocument();
    expect(screen.getByText("Hodnota:")).toBeInTheDocument();
    expect(screen.queryByText("Měna:")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Zobrazit vše \(5\)/ }));

    expect(screen.getByText("Měna:")).toBeInTheDocument();
    expect(screen.getByText("Poznámka:")).toBeInTheDocument();
    expect(screen.getByText("Telefon:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Skrýt/ })).toBeInTheDocument();
  });

  it("falls back to the legacy names list for old payloads (no raw enums)", () => {
    renderRow(
      makeActivity({
        entity_type: "company",
        activity_type: "company_updated",
        payload: { changed: ["email", "phone"] },
      }),
    );
    expect(screen.getByText("e-mail, telefon")).toBeInTheDocument();
  });

  it("never leaks stage UUIDs for legacy stage-change payloads", () => {
    const { container } = renderRow(
      makeActivity({
        activity_type: "stage_change",
        payload: {
          deal_name: "Obchod B",
          from_stage_id: "aaaa-bbbb",
          to_stage_id: "cccc-dddd",
        },
      }),
    );
    expect(container.textContent).not.toContain("aaaa-bbbb");
    expect(container.textContent).not.toContain("cccc-dddd");
    expect(screen.queryByText(/Fáze:/)).not.toBeInTheDocument();
  });

  it("shows the actor name alongside the timestamp", () => {
    const { container } = renderRow(
      makeActivity({ activity_type: "note", user_name: "Jan Novák" }),
    );
    expect(within(container).getByText(/Jan Novák/)).toBeInTheDocument();
  });

  it("shows the event title and start time", () => {
    renderRow(
      makeActivity({
        activity_type: "event_created",
        payload: { title: "Schůzka", starts_at: "2026-07-10T09:30:00Z" },
      }),
    );
    expect(screen.getByText(/Schůzka/)).toBeInTheDocument();
  });

  it("shows the email subject", () => {
    renderRow(
      makeActivity({
        activity_type: "email_sent",
        payload: { deal_name: "Obchod C", subject: "Nabídka spolupráce" },
      }),
    );
    expect(screen.getByText("Nabídka spolupráce")).toBeInTheDocument();
  });
});
