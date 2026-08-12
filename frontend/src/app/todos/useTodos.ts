import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type TodoListOut = components["schemas"]["TodoListOut"];
export type TodoOut = components["schemas"]["TodoOut"];
export type TodoListCreate = components["schemas"]["TodoListCreate"];
export type TodoListUpdate = components["schemas"]["TodoListUpdate"];
export type TodoCreate = components["schemas"]["TodoCreate"];
export type TodoUpdate = components["schemas"]["TodoUpdate"];

const LISTS_KEY = ["todo-lists"] as const;

/** Todos of one list. Deal-scoped views key off the deal id instead. */
export const todosKey = (listId: string) => ["todos", "list", listId] as const;
export const dealTodosKey = (dealId: string) => ["todos", "deal", dealId] as const;

/**
 * Refresh everything a todo write can touch. A single todo shows up in its
 * list *and* in the deal section of whichever deal it reaches, and its
 * done-state feeds the switcher's open counts — cheap queries, so we
 * invalidate the family rather than surgically patching caches.
 */
function invalidateTodos(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ["todos"] });
  void qc.invalidateQueries({ queryKey: LISTS_KEY });
}

/** My lists, oldest first — the switcher order. Private per user. */
export function useTodoLists({ enabled = true }: { enabled?: boolean } = {}) {
  const { accessToken } = useAuth();
  return useQuery<TodoListOut[]>({
    queryKey: LISTS_KEY,
    enabled: enabled && !!accessToken,
    queryFn: () => apiFetch<TodoListOut[]>("/api/v1/todo-lists", { token: accessToken }),
  });
}

export function useCreateTodoList() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TodoListOut, Error, TodoListCreate>({
    mutationFn: (body) =>
      apiFetch<TodoListOut>("/api/v1/todo-lists", { method: "POST", token: accessToken, body }),
    onSuccess: () => invalidateTodos(qc),
  });
}

export function useUpdateTodoList() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TodoListOut, Error, { listId: string; patch: TodoListUpdate }>({
    mutationFn: ({ listId, patch }) =>
      apiFetch<TodoListOut>(`/api/v1/todo-lists/${listId}`, {
        method: "PATCH",
        token: accessToken,
        body: patch,
      }),
    onSuccess: () => invalidateTodos(qc),
  });
}

export function useDeleteTodoList() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (listId) =>
      apiFetch<void>(`/api/v1/todo-lists/${listId}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => invalidateTodos(qc),
  });
}

/** Todos of one list, server-ordered: open first, then by position. */
export function useTodos(listId: string | null | undefined) {
  const { accessToken } = useAuth();
  return useQuery<TodoOut[]>({
    queryKey: todosKey(listId ?? "none"),
    enabled: !!accessToken && !!listId,
    queryFn: () =>
      apiFetch<TodoOut[]>(`/api/v1/todo-lists/${listId}/todos`, { token: accessToken }),
  });
}

export function useCreateTodo() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TodoOut, Error, { listId: string; body: TodoCreate }>({
    mutationFn: ({ listId, body }) =>
      apiFetch<TodoOut>(`/api/v1/todo-lists/${listId}/todos`, {
        method: "POST",
        token: accessToken,
        body,
      }),
    onSuccess: () => invalidateTodos(qc),
  });
}

export function useUpdateTodo() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TodoOut, Error, { todoId: string; patch: TodoUpdate }>({
    mutationFn: ({ todoId, patch }) =>
      apiFetch<TodoOut>(`/api/v1/todos/${todoId}`, {
        method: "PATCH",
        token: accessToken,
        body: patch,
      }),
    onSuccess: () => invalidateTodos(qc),
  });
}

export function useDeleteTodo() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (todoId) =>
      apiFetch<void>(`/api/v1/todos/${todoId}`, { method: "DELETE", token: accessToken }),
    onSuccess: () => invalidateTodos(qc),
  });
}

/**
 * My todos reaching a deal, by either link path. Server-scoped to the
 * caller's own lists — deal detail is shared, personal todos aren't.
 */
export function useDealTodos(dealId: string | null | undefined) {
  const { accessToken } = useAuth();
  return useQuery<TodoOut[]>({
    queryKey: dealTodosKey(dealId ?? "none"),
    enabled: !!accessToken && !!dealId,
    queryFn: () => apiFetch<TodoOut[]>(`/api/v1/deals/${dealId}/todos`, { token: accessToken }),
  });
}

/**
 * Add a todo straight from the deal page. The server resolves (or creates)
 * the caller's default list, so the client never orchestrates
 * create-list-then-create-todo.
 */
export function useCreateDealTodo() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<TodoOut, Error, { dealId: string; text: string }>({
    mutationFn: ({ dealId, text }) =>
      apiFetch<TodoOut>(`/api/v1/deals/${dealId}/todos`, {
        method: "POST",
        token: accessToken,
        body: { text },
      }),
    onSuccess: () => invalidateTodos(qc),
  });
}
