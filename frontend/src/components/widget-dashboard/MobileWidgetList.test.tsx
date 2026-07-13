import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { testIds } from "@/lib/testids";
import { MobileWidgetList } from "./MobileWidgetList";
import { deriveMobileOrder, type MobileWidgetItem } from "./mobileOrder";

const items: MobileWidgetItem[] = [
  { id: "a", node: <div>Widget A</div> },
  { id: "b", node: <div>Widget B</div> },
  { id: "c", node: <div>Widget C</div> },
];

const ids = (list: MobileWidgetItem[]) => list.map((i) => i.id);

describe("deriveMobileOrder", () => {
  it("orders items by the given order array", () => {
    expect(ids(deriveMobileOrder(items, ["c", "a", "b"]))).toEqual(["c", "a", "b"]);
  });

  it("appends ids missing from order in items order", () => {
    expect(ids(deriveMobileOrder(items, ["b"]))).toEqual(["b", "a", "c"]);
  });

  it("skips order ids with no matching item", () => {
    expect(ids(deriveMobileOrder(items, ["z", "a"]))).toEqual(["a", "b", "c"]);
  });

  it("dedupes repeated order ids", () => {
    expect(ids(deriveMobileOrder(items, ["a", "a", "b"]))).toEqual(["a", "b", "c"]);
  });
});

describe("MobileWidgetList — edit mode", () => {
  it("moves an item down via the down button", async () => {
    const onReorder = vi.fn();
    render(
      <MobileWidgetList items={items} order={["a", "b", "c"]} onReorder={onReorder} isEditMode />,
    );
    await userEvent.click(screen.getByTestId(testIds.widgets.mobileList.moveDown("a")));
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });

  it("moves an item up via the up button", async () => {
    const onReorder = vi.fn();
    render(
      <MobileWidgetList items={items} order={["a", "b", "c"]} onReorder={onReorder} isEditMode />,
    );
    await userEvent.click(screen.getByTestId(testIds.widgets.mobileList.moveUp("c")));
    expect(onReorder).toHaveBeenCalledWith(["a", "c", "b"]);
  });

  it("disables up on the first item and down on the last", () => {
    render(
      <MobileWidgetList items={items} order={["a", "b", "c"]} onReorder={vi.fn()} isEditMode />,
    );
    expect(screen.getByTestId(testIds.widgets.mobileList.moveUp("a"))).toBeDisabled();
    expect(screen.getByTestId(testIds.widgets.mobileList.moveDown("c"))).toBeDisabled();
  });

  it("emits the derived order (missing ids appended) when reordering", async () => {
    const onReorder = vi.fn();
    // order lists only 'a'; b and c are appended → effective ["a","b","c"].
    render(<MobileWidgetList items={items} order={["a"]} onReorder={onReorder} isEditMode />);
    await userEvent.click(screen.getByTestId(testIds.widgets.mobileList.moveDown("a")));
    expect(onReorder).toHaveBeenCalledWith(["b", "a", "c"]);
  });
});

describe("MobileWidgetList — view mode", () => {
  it("renders nodes without reorder controls", () => {
    render(
      <MobileWidgetList
        items={items}
        order={["a", "b", "c"]}
        onReorder={vi.fn()}
        isEditMode={false}
      />,
    );
    expect(screen.getByText("Widget A")).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.widgets.mobileList.moveUp("a"))).toBeNull();
  });
});
