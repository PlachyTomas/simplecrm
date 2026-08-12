import { describe, expect, it } from "vitest";

import { effectiveDeal, type DealLink } from "@/app/todos/effectiveDeal";

const listLink: DealLink = { deal_id: "d-list", deal_name: "Seznamový obchod" };
const todoLink: DealLink = { deal_id: "d-todo", deal_name: "Úkolový obchod" };
const noLink: DealLink = { deal_id: null, deal_name: null };

describe("effectiveDeal", () => {
  it("uses the todo's own link when its list has none", () => {
    expect(effectiveDeal(noLink, todoLink)).toEqual({ id: "d-todo", name: "Úkolový obchod" });
  });

  it("lets the list's link win over the todo's", () => {
    // The per-todo link isn't erased when the list gains one — it's
    // overridden — so a todo carrying both must show the list's deal.
    expect(effectiveDeal(listLink, todoLink)).toEqual({ id: "d-list", name: "Seznamový obchod" });
  });

  it("inherits the list's link for a todo with none of its own", () => {
    expect(effectiveDeal(listLink, noLink)).toEqual({ id: "d-list", name: "Seznamový obchod" });
  });

  it("is null when neither side links a deal", () => {
    expect(effectiveDeal(noLink, noLink)).toBeNull();
  });

  it("treats a missing list as no list link", () => {
    // The deal-detail section renders todos from many lists at once and
    // doesn't carry their list rows.
    expect(effectiveDeal(undefined, todoLink)).toEqual({ id: "d-todo", name: "Úkolový obchod" });
  });
});
