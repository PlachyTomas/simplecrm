import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

import { TodoComposer } from "@/app/todos/TodoComposer";
import { TodoItemRow } from "@/app/todos/TodoItemRow";
import { useCreateDealTodo, useDealTodos } from "@/app/todos/useTodos";

/**
 * The viewer's own todos for this deal, reached either directly or through
 * a deal-linked list.
 *
 * Deliberately *not* everyone's: lists are personal, and deal detail is a
 * shared page. The server enforces that scope; the subtitle says so out
 * loud so nobody assumes their teammate's todos would show here.
 *
 * Adding hits `POST /deals/{id}/todos`, which resolves (or creates) the
 * user's default list server-side — no list picker in the way of typing.
 */
export function DealTodosSection({ dealId }: { dealId: string }) {
  const { t } = useTranslation("todos");
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const todos = useDealTodos(dealId);
  const createTodo = useCreateDealTodo();

  async function handleAdd(text: string) {
    try {
      await createTodo.mutateAsync({ dealId, text });
      setExpanded(true);
    } catch {
      toast.error(t("widget.saveError"));
    }
  }

  const count = todos.data?.length ?? 0;

  return (
    <section
      data-testid={testIds.todos.dealSection}
      className="mt-4 rounded-lg border border-border bg-surface"
    >
      <header className="border-b border-border-subtle px-4 py-3">
        {/* Collapsed by default, like the events section — the count keeps
            it glanceable without opening. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-w-0 text-left"
        >
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <ChevronDown
              size={16}
              strokeWidth={1.75}
              aria-hidden
              className={expanded ? "" : "-rotate-90"}
            />
            {t("dealSection.title")}
            {!todos.isPending ? (
              <span className="font-normal text-text-tertiary">({count})</span>
            ) : null}
          </h2>
          {expanded ? (
            <p className="mt-0.5 text-sm text-text-tertiary">{t("dealSection.privacyHint")}</p>
          ) : null}
        </button>
      </header>

      {expanded ? (
        <div className="px-4 py-3">
          <TodoComposer
            placeholder={t("dealSection.addPlaceholder")}
            testId={testIds.todos.dealSectionAdd}
            onAdd={handleAdd}
          />
          {todos.isError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {t("dealSection.loadError")}
            </p>
          ) : null}
          {!todos.isPending && !todos.isError && count === 0 ? (
            <p className="mt-3 text-sm text-text-tertiary">{t("dealSection.empty")}</p>
          ) : null}
          {count > 0 ? (
            <ul className="mt-2">
              {(todos.data ?? []).map((todo) => (
                // No `list` prop: this view mixes lists, so each row shows
                // which one it came from instead of a per-list deal link.
                <TodoItemRow key={todo.id} todo={todo} showListName />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
