import { Check, Link2, Link2Off, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";
import { useModalDialog } from "@/lib/useModalDialog";
import { cn } from "@/lib/utils";

import { TodoDealPicker } from "@/app/todos/TodoDealPicker";
import {
  useCreateTodoList,
  useDeleteTodoList,
  useUpdateTodoList,
  type TodoListOut,
} from "@/app/todos/useTodos";

interface Props {
  open: boolean;
  onClose: () => void;
  lists: readonly TodoListOut[];
  currentListId: string | null;
  onSelect: (listId: string) => void;
}

/**
 * The iOS-Reminders move: pick which list this widget shows, and manage
 * that list without leaving the dashboard.
 *
 * Creating a list selects it immediately — you made it to use it. Deleting
 * the current one hands the widget back to the first remaining list (or to
 * the empty state), which is why `onSelect` fires on delete too.
 */
export function TodoListSwitcher({ open, onClose, lists, currentListId, onSelect }: Props) {
  const { t } = useTranslation("todos");
  const toast = useToast();
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [dealPickerOpen, setDealPickerOpen] = useState(false);

  const createList = useCreateTodoList();
  const updateList = useUpdateTodoList();
  const deleteList = useDeleteTodoList();

  const current = lists.find((l) => l.id === currentListId) ?? null;

  if (!open) return null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createList.mutateAsync({ name });
      setNewName("");
      setCreating(false);
      onSelect(created.id);
      onClose();
    } catch {
      toast.error(t("switcher.createError"));
    }
  }

  async function handleRename() {
    const name = renameValue.trim();
    if (!current || !name) return;
    try {
      await updateList.mutateAsync({ listId: current.id, patch: { name } });
      setRenaming(false);
    } catch {
      toast.error(t("switcher.saveError"));
    }
  }

  async function handleDealChange(deal: { id: string } | null) {
    if (!current) return;
    try {
      await updateList.mutateAsync({ listId: current.id, patch: { deal_id: deal?.id ?? null } });
    } catch {
      toast.error(t("switcher.saveError"));
    }
  }

  async function handleDelete() {
    if (!current) return;
    if (!window.confirm(t("switcher.deleteConfirm", { name: current.name }))) return;
    try {
      await deleteList.mutateAsync(current.id);
      const next = lists.find((l) => l.id !== current.id);
      if (next) onSelect(next.id);
      onClose();
    } catch {
      toast.error(t("switcher.deleteError"));
    }
  }

  const rowCls =
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-surface-overlay";

  return (
    <>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="todo-switcher-title"
        data-testid={testIds.todos.switcher.popover}
        className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-lg md:rounded-lg">
          <header className="border-b border-border-subtle px-6 py-4">
            <h2 id="todo-switcher-title" className="text-base font-semibold text-text-primary">
              {t("switcher.title")}
            </h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <ul>
              {lists.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    data-testid={testIds.todos.switcher.option(list.id)}
                    onClick={() => {
                      onSelect(list.id);
                      onClose();
                    }}
                    className={cn(rowCls, list.id === currentListId && "bg-accent-subtle")}
                  >
                    <Check
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden
                      className={cn(
                        "shrink-0 text-accent",
                        list.id === currentListId ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="flex-1 truncate text-text-primary">{list.name}</span>
                    {list.open_count > 0 ? (
                      <span className="shrink-0 rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
                        {list.open_count}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>

            {creating ? (
              <div className="mt-1 flex items-center gap-2 px-3 py-2">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  data-testid={testIds.todos.switcher.createInput}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                  aria-label={t("switcher.newListPlaceholder")}
                  placeholder={t("switcher.newListPlaceholder")}
                  maxLength={80}
                  className="h-9 flex-1 rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={!newName.trim() || createList.isPending}
                  className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("switcher.create")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid={testIds.todos.switcher.create}
                onClick={() => setCreating(true)}
                className={cn(rowCls, "text-accent")}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                {t("switcher.newList")}
              </button>
            )}
          </div>

          {current ? (
            <div className="border-t border-border-subtle p-2">
              <p className="px-3 py-1 text-xs font-medium text-text-tertiary">
                {t("switcher.manageTitle")}
              </p>
              {renaming ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename();
                      if (e.key === "Escape") setRenaming(false);
                    }}
                    aria-label={t("switcher.renamePlaceholder")}
                    placeholder={t("switcher.renamePlaceholder")}
                    maxLength={80}
                    className="h-9 flex-1 rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleRename()}
                    disabled={!renameValue.trim() || updateList.isPending}
                    className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t("switcher.save")}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid={testIds.todos.switcher.rename}
                  onClick={() => {
                    setRenameValue(current.name);
                    setRenaming(true);
                  }}
                  className={cn(rowCls, "text-text-secondary")}
                >
                  <Pencil size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                  {t("switcher.rename")}
                </button>
              )}

              <button
                type="button"
                data-testid={testIds.todos.switcher.linkDeal}
                onClick={() => setDealPickerOpen(true)}
                className={cn(rowCls, "text-text-secondary")}
              >
                <Link2 size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                <span className="flex-1 truncate">
                  {current.deal_id ? current.deal_name : t("switcher.linkDeal")}
                </span>
              </button>
              {current.deal_id ? (
                <button
                  type="button"
                  data-testid={testIds.todos.switcher.unlinkDeal}
                  onClick={() => void handleDealChange(null)}
                  className={cn(rowCls, "text-text-secondary")}
                >
                  <Link2Off size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                  {t("switcher.unlinkDeal")}
                </button>
              ) : null}

              <button
                type="button"
                data-testid={testIds.todos.switcher.delete}
                onClick={() => void handleDelete()}
                className={cn(rowCls, "text-danger hover:bg-danger-subtle")}
              >
                <Trash2 size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                {t("switcher.delete")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <TodoDealPicker
        open={dealPickerOpen}
        onClose={() => setDealPickerOpen(false)}
        onPick={(deal) => void handleDealChange(deal)}
        canClear={Boolean(current?.deal_id)}
      />
    </>
  );
}
