import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HandCoins } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { testIds } from "@/lib/testids";

import { QuickActionTile } from "@/app/dashboard/widgets/QuickActionTile";

describe("QuickActionTile", () => {
  it("renders the label and fires onActivate on click", async () => {
    const onActivate = vi.fn();
    render(
      <QuickActionTile
        type="action_new_deal"
        label="Nový obchod"
        icon={HandCoins}
        onActivate={onActivate}
        isEditMode={false}
      />,
    );
    const tile = screen.getByTestId(testIds.dashboard.quickAction("action_new_deal"));
    expect(tile).toHaveTextContent("Nový obchod");
    await userEvent.click(tile);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("is inert in edit mode", async () => {
    const onActivate = vi.fn();
    render(
      <QuickActionTile
        type="action_new_deal"
        label="Nový obchod"
        icon={HandCoins}
        onActivate={onActivate}
        isEditMode
      />,
    );
    const tile = screen.getByTestId(testIds.dashboard.quickAction("action_new_deal"));
    expect(tile).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(tile);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
