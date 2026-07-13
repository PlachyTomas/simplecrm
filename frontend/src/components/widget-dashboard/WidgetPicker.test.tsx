import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutGrid } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { testIds } from "@/lib/testids";
import { WidgetPicker, type WidgetPickerGroup } from "./WidgetPicker";

function catalog(): WidgetPickerGroup[] {
  return [
    {
      title: "Group A",
      items: [
        { type: "normal", label: "Normal", description: "d", icon: LayoutGrid, unique: false, added: false },
        { type: "dupe", label: "Dupe", description: "d", icon: LayoutGrid, unique: false, added: true },
        {
          type: "uniqueAdded",
          label: "Unique added",
          description: "d",
          icon: LayoutGrid,
          unique: true,
          added: true,
        },
        {
          type: "gated",
          label: "Gated",
          description: "d",
          icon: LayoutGrid,
          unique: false,
          added: false,
          disabled: true,
        },
      ],
    },
  ];
}

describe("WidgetPicker", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <WidgetPicker open={false} onClose={vi.fn()} groups={catalog()} onAdd={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("adds a normal widget on click", async () => {
    const onAdd = vi.fn();
    render(<WidgetPicker open onClose={vi.fn()} groups={catalog()} onAdd={onAdd} />);
    await userEvent.click(screen.getByTestId(testIds.widgets.picker.item("normal")));
    expect(onAdd).toHaveBeenCalledWith("normal");
  });

  it("keeps duplicable widgets clickable even when already added", async () => {
    const onAdd = vi.fn();
    render(<WidgetPicker open onClose={vi.fn()} groups={catalog()} onAdd={onAdd} />);
    await userEvent.click(screen.getByTestId(testIds.widgets.picker.item("dupe")));
    expect(onAdd).toHaveBeenCalledWith("dupe");
  });

  it("locks a unique widget that is already added and shows the added state", async () => {
    const onAdd = vi.fn();
    render(<WidgetPicker open onClose={vi.fn()} groups={catalog()} onAdd={onAdd} />);
    const item = screen.getByTestId(testIds.widgets.picker.item("uniqueAdded"));
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Přidáno")).toBeInTheDocument();
    await userEvent.click(item);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("does not add a hard-disabled widget", async () => {
    const onAdd = vi.fn();
    render(<WidgetPicker open onClose={vi.fn()} groups={catalog()} onAdd={onAdd} />);
    const item = screen.getByTestId(testIds.widgets.picker.item("gated"));
    expect(item).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(item);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("closes via the close button", async () => {
    const onClose = vi.fn();
    render(<WidgetPicker open onClose={onClose} groups={catalog()} onAdd={vi.fn()} />);
    await userEvent.click(screen.getByTestId(testIds.widgets.picker.close));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the empty state when no groups have items", () => {
    render(<WidgetPicker open onClose={vi.fn()} groups={[{ title: "X", items: [] }]} onAdd={vi.fn()} />);
    expect(screen.getByText("Žádné další widgety k přidání.")).toBeInTheDocument();
  });
});
