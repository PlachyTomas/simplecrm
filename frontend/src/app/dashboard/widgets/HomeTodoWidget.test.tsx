import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/auth/AuthContext";
import { ToastProvider } from "@/lib/toast";
import { testIds } from "@/lib/testids";

import { HomeTodoWidget } from "@/app/dashboard/widgets/HomeTodoWidget";
import type { HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";

const LIST_A = {
  id: "list-a",
  name: "Dnes",
  deal_id: null,
  deal_name: null,
  open_count: 1,
  created_at: "2026-08-01T08:00:00Z",
};
const LIST_B = {
  id: "list-b",
  name: "Akvizice",
  deal_id: "deal-9",
  deal_name: "Velký obchod s velmi dlouhým názvem",
  open_count: 0,
  created_at: "2026-08-02T08:00:00Z",
};

function todo(overrides: Record<string, unknown> = {}) {
  return {
    id: "todo-1",
    list_id: "list-a",
    list_name: "Dnes",
    text: "Zavolat klientovi",
    is_done: false,
    position: 0,
    deal_id: null,
    deal_name: null,
    created_at: "2026-08-03T08:00:00Z",
    updated_at: "2026-08-03T08:00:00Z",
    ...overrides,
  };
}

function entry(listId: string | null): HomeWidgetEntry {
  return {
    id: "w-todo",
    position: { x: 0, y: 0, w: 4, h: 4 },
    config: { type: "todo_list", list_id: listId } as HomeWidgetEntry["config"],
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HomeTodoWidget", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const originalFetch = globalThis.fetch;
  let lists = [LIST_A, LIST_B];
  let todosByList: Record<string, ReturnType<typeof todo>[]> = {};
  let posted: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    lists = [LIST_A, LIST_B];
    todosByList = { "list-a": [todo()], "list-b": [] };
    posted = [];
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      const method = init?.method ?? "GET";
      if (method === "POST") {
        posted.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
        return jsonResponse(todo({ id: "todo-new", text: "Nový úkol" }), 201);
      }
      if (method === "PATCH") {
        return jsonResponse(todo({ is_done: true }));
      }
      if (url.includes("/api/v1/todo-lists/list-a/todos")) {
        return jsonResponse(todosByList["list-a"]);
      }
      if (url.includes("/api/v1/todo-lists/list-b/todos")) {
        return jsonResponse(todosByList["list-b"]);
      }
      if (url.includes("/api/v1/todo-lists")) {
        return jsonResponse(lists);
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function renderWidget(listId: string | null, onSelectList = vi.fn()) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <AuthProvider initialToken="fake">
          <ToastProvider>
            <MemoryRouter>
              <HomeTodoWidget
                entry={entry(listId)}
                isEditMode={false}
                onRemove={vi.fn()}
                onSelectList={onSelectList}
              />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
    return { onSelectList };
  }

  it("shows the configured list's todos, not the first list's", async () => {
    renderWidget("list-b");
    // list-b is empty; picking it must not silently fall back to list-a.
    expect(await screen.findByText("Akvizice")).toBeInTheDocument();
    expect(screen.queryByText("Zavolat klientovi")).not.toBeInTheDocument();
  });

  it("falls back to the first list when the configured one is gone", async () => {
    renderWidget("list-deleted-elsewhere");
    expect(await screen.findByText("Dnes")).toBeInTheDocument();
    expect(await screen.findByText("Zavolat klientovi")).toBeInTheDocument();
  });

  it("persists the picked list through onSelectList", async () => {
    const user = userEvent.setup();
    const { onSelectList } = renderWidget("list-a");
    await screen.findByText("Zavolat klientovi");

    await user.click(screen.getByTestId(testIds.todos.switcherOpen("w-todo")));
    await user.click(await screen.findByTestId(testIds.todos.switcher.option("list-b")));

    // The widget id travels with it — that's what keeps two todo widgets
    // on separate lists.
    expect(onSelectList).toHaveBeenCalledWith("w-todo", "list-b");
  });

  it("adds a todo to the current list on Enter", async () => {
    const user = userEvent.setup();
    renderWidget("list-a");
    await screen.findByText("Zavolat klientovi");

    await user.type(screen.getByTestId(testIds.todos.addInput), "Nový úkol{Enter}");

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.url).toContain("/api/v1/todo-lists/list-a/todos");
    expect(posted[0]!.body).toEqual({ text: "Nový úkol" });
  });

  it("locks the per-todo deal link inside a deal-linked list", async () => {
    const user = userEvent.setup();
    todosByList["list-b"] = [todo({ id: "todo-2", list_id: "list-b", list_name: "Akvizice" })];
    renderWidget("list-b");
    await screen.findByText("Zavolat klientovi");

    const link = screen.getByTestId(testIds.todos.dealLink("todo-2"));
    expect(link).toHaveAttribute("aria-disabled", "true");

    // The row shows the list's deal, and the locked control explains why
    // it can't carry one of its own.
    expect(screen.getByTestId(testIds.todos.dealChip("todo-2"))).toHaveAttribute(
      "title",
      LIST_B.deal_name,
    );
    await user.hover(link);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(LIST_B.deal_name);
  });

  it("offers to create a first list when the user has none", async () => {
    lists = [];
    renderWidget(null);
    expect(await screen.findByText(/nemáte žádný seznam|don't have any todo list/i)).toBeVisible();
  });
});
