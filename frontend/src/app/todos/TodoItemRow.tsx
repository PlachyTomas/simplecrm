import { Link2, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { TodoDealPicker } from "@/app/todos/TodoDealPicker";
import { effectiveDeal, isDealLinkLocked, type DealLink } from "@/app/todos/effectiveDeal";
import { useDeleteTodo, useUpdateTodo, type TodoOut } from "@/app/todos/useTodos";

interface Props {
  todo: TodoOut;
  /** The parent list's deal link, when the caller knows it. Absent in the
   * deal-detail section, which mixes todos from several lists. */
  list?: DealLink;
  /** Show which list a todo belongs to — only useful when they're mixed. */
  showListName?: boolean;
}

/**
 * One todo: checkbox, text (click to edit), its deal chip, and the row
 * actions. Shared by the dashboard widget and the deal-detail section so
 * ticking a box behaves identically in both.
 */
export function TodoItemRow({ todo, list, showListName = false }: Props) {
  const { t } = useTranslation("todos");
  const toast = useToast();
  const update = useUpdateTodo();
  const remove = useDeleteTodo();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lockHintOpen, setLockHintOpen] = useState(false);

  const deal = effectiveDeal(list, todo);
  // The list's link wins, so a per-todo link would be dead config.
  const locked = isDealLinkLocked(list);

  async function patch(body: Parameters<typeof update.mutateAsync>[0]["patch"]) {
    try {
      await update.mutateAsync({ todoId: todo.id, patch: body });
    } catch {
      toast.error(t("widget.saveError"));
    }
  }

  async function commitText() {
    const text = draft.trim();
    setEditing(false);
    if (!text || text === todo.text) {
      setDraft(todo.text);
      return;
    }
    await patch({ text });
  }

  return (
    <li
      data-testid={testIds.todos.row(todo.id)}
      className="group flex items-start gap-2 rounded-md px-1 py-1.5 transition-colors duration-fast hover:bg-surface-overlay"
    >
      <input
        type="checkbox"
        checked={todo.is_done}
        data-testid={testIds.todos.checkbox(todo.id)}
        aria-label={todo.is_done ? t("todo.toggleDone") : t("todo.toggle")}
        onChange={(e) => void patch({ is_done: e.target.checked })}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent focus:ring-accent"
      />

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            type="text"
            value={draft}
            maxLength={500}
            aria-label={t("todo.edit")}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitText()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitText();
              if (e.key === "Escape") {
                setDraft(todo.text);
                setEditing(false);
              }
            }}
            className="h-7 w-full rounded-md border border-border bg-surface-overlay px-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        ) : (
          <button
            type="button"
            data-testid={testIds.todos.text(todo.id)}
            onClick={() => {
              setDraft(todo.text);
              setEditing(true);
            }}
            className={cn(
              "block w-full truncate text-left text-sm",
              todo.is_done ? "text-text-tertiary line-through" : "text-text-primary",
            )}
          >
            {todo.text}
          </button>
        )}

        {deal || showListName ? (
          <div className="mt-0.5 flex items-center gap-2">
            {deal ? (
              <Link
                to={`/app/deals/${deal.id}`}
                data-testid={testIds.todos.dealChip(todo.id)}
                // Deal names outrun a small chip, so the full name lives in
                // the native tooltip.
                title={deal.name}
                className="inline-block max-w-[12rem] truncate rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent transition-colors duration-fast hover:bg-accent-subtle hover:text-accent-hover"
              >
                {deal.name}
              </Link>
            ) : null}
            {showListName ? (
              <span className="truncate text-xs text-text-tertiary">
                {t("dealSection.listSuffix", { list: todo.list_name })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          data-testid={testIds.todos.dealLink(todo.id)}
          // Gated rather than disabled: it stays focusable and explains the
          // reason instead of going quiet.
          aria-disabled={locked || undefined}
          aria-describedby={lockHintOpen ? `todo-lock-${todo.id}` : undefined}
          onClick={() => {
            if (!locked) setPickerOpen(true);
          }}
          onMouseEnter={() => locked && setLockHintOpen(true)}
          onMouseLeave={() => setLockHintOpen(false)}
          onFocus={() => locked && setLockHintOpen(true)}
          onBlur={() => setLockHintOpen(false)}
          aria-label={t("todo.linkDeal")}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded text-text-tertiary transition-colors duration-fast",
            locked
              ? "cursor-not-allowed opacity-60"
              : "hover:bg-surface-elevated hover:text-text-primary",
          )}
        >
          <Link2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {locked && lockHintOpen ? (
          <span
            role="tooltip"
            id={`todo-lock-${todo.id}`}
            className="absolute right-0 top-8 z-20 w-56 rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs text-text-secondary shadow-md"
          >
            {t("todo.linkDealLocked", { deal: list?.deal_name ?? "" })}
          </span>
        ) : null}

        <button
          type="button"
          data-testid={testIds.todos.remove(todo.id)}
          onClick={() => void remove.mutateAsync(todo.id)}
          aria-label={t("todo.remove")}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-text-tertiary transition-colors duration-fast hover:bg-danger-subtle hover:text-danger"
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>

      <TodoDealPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) => void patch({ deal_id: picked?.id ?? null })}
        canClear={Boolean(todo.deal_id)}
      />
    </li>
  );
}
