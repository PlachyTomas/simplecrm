import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  WidgetEmpty,
  WidgetFrame,
  WidgetSkeleton,
} from "@/components/widget-dashboard/WidgetFrame";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

import { widgetListId } from "@/app/dashboard/homeLayout";
import type { HomeWidgetEntry } from "@/app/dashboard/useHomeDashboard";
import { HomeWidgetUnavailable } from "@/app/dashboard/widgets/HomeWidgetUnavailable";
import { TodoComposer } from "@/app/todos/TodoComposer";
import { TodoItemRow } from "@/app/todos/TodoItemRow";
import { TodoListSwitcher } from "@/app/todos/TodoListSwitcher";
import { useCreateTodo, useCreateTodoList, useTodoLists, useTodos } from "@/app/todos/useTodos";

interface Props {
  entry: HomeWidgetEntry;
  isEditMode: boolean;
  onRemove: () => void;
  /** Persist which list this widget shows. */
  onSelectList: (widgetId: string, listId: string) => void;
}

/**
 * A personal todo list on the dashboard, iOS-Reminders style: the header
 * names the current list and opens a switcher; the body is an add line
 * plus the todos.
 *
 * Several of these can sit on one dashboard, each pinned to its own list
 * via `config.list_id`. A stale id (the list was deleted elsewhere) falls
 * back to the first list without rewriting the layout — the config is
 * only rewritten when the user actually picks something.
 */
export function HomeTodoWidget({ entry, isEditMode, onRemove, onSelectList }: Props) {
  const { t } = useTranslation("todos");
  const toast = useToast();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const lists = useTodoLists();
  const createList = useCreateTodoList();
  const createTodo = useCreateTodo();

  const configuredId = widgetListId(entry.config);
  const known = lists.data ?? [];
  const current = known.find((l) => l.id === configuredId) ?? known[0] ?? null;

  const todos = useTodos(current?.id);

  async function handleCreateFirstList() {
    try {
      const created = await createList.mutateAsync({ name: t("widget.title") });
      onSelectList(entry.id, created.id);
    } catch {
      toast.error(t("switcher.createError"));
    }
  }

  async function handleAdd(text: string) {
    if (!current) return;
    try {
      await createTodo.mutateAsync({ listId: current.id, body: { text } });
    } catch {
      toast.error(t("widget.saveError"));
    }
  }

  return (
    <WidgetFrame
      label={current?.name ?? t("widget.title")}
      isEditMode={isEditMode}
      onRemove={onRemove}
      controls={
        known.length > 0 ? (
          <button
            type="button"
            data-testid={testIds.todos.switcherOpen(entry.id)}
            onClick={() => setSwitcherOpen(true)}
            aria-label={t("widget.switchList")}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-tertiary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
          >
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : null
      }
    >
      <div data-testid={testIds.todos.widget(entry.id)} className="flex h-full flex-col">
        {lists.isPending ? (
          <WidgetSkeleton />
        ) : lists.isError ? (
          <HomeWidgetUnavailable />
        ) : !current ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-text-secondary">{t("widget.noLists")}</p>
            <button
              type="button"
              onClick={() => void handleCreateFirstList()}
              disabled={createList.isPending}
              className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("widget.createFirstList")}
            </button>
          </div>
        ) : (
          <>
            {/* Edit mode is for arranging widgets, not filing todos — the
                composer would also swallow drag gestures. */}
            {isEditMode ? null : (
              <TodoComposer
                placeholder={t("widget.addPlaceholder")}
                testId={testIds.todos.addInput}
                onAdd={handleAdd}
              />
            )}
            <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
              {todos.isPending ? (
                <WidgetSkeleton />
              ) : todos.isError ? (
                <p className="text-sm text-danger" role="alert">
                  {t("widget.loadError")}
                </p>
              ) : todos.data && todos.data.length > 0 ? (
                <ul>
                  {todos.data.map((todo) => (
                    <TodoItemRow key={todo.id} todo={todo} list={current} />
                  ))}
                </ul>
              ) : (
                <WidgetEmpty message={t("widget.emptyTodos")} />
              )}
            </div>
          </>
        )}
      </div>

      <TodoListSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        lists={known}
        currentListId={current?.id ?? null}
        onSelect={(listId) => onSelectList(entry.id, listId)}
      />
    </WidgetFrame>
  );
}
