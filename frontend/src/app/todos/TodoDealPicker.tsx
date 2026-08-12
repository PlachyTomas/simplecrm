import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useDeals } from "@/app/deals/useDeals";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

export interface PickedDeal {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** `null` clears the existing link. */
  onPick: (deal: PickedDeal | null) => void;
  /** Show the "remove the link" row — only when something is linked. */
  canClear: boolean;
}

/**
 * Deal picker for linking a todo or a whole list.
 *
 * `GET /api/v1/deals` has no server-side search, so one page is fetched and
 * filtered client-side by deal or company name — the same compromise as
 * `EventFormModal`'s picker. House modal shell: bottom sheet on mobile.
 */
export function TodoDealPicker({ open, onClose, onPick, canClear }: Props) {
  const { t } = useTranslation("todos");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 250);
  // Mounted only while open, so the deals page isn't fetched for every
  // todo row on the dashboard.
  const deals = useDeals({ limit: 100 });

  if (!open) return null;

  const q = debounced.toLowerCase();
  const matches = q
    ? (deals.data?.items ?? [])
        .filter((d) => d.name.toLowerCase().includes(q) || d.company_name.toLowerCase().includes(q))
        .slice(0, 25)
    : [];

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="todo-deal-picker-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-lg md:rounded-lg">
        <header className="border-b border-border-subtle px-6 py-4">
          <h2 id="todo-deal-picker-title" className="text-base font-semibold text-text-primary">
            {t("dealPicker.title")}
          </h2>
        </header>

        <div className="px-6 py-4">
          {/* Not wrapped in a <label> — a label swallows clicks aimed at the
              option buttons below it. */}
          <span className="mb-1 block text-xs font-medium text-text-secondary" id="todo-deal-q">
            {t("dealPicker.placeholder")}
          </span>
          <input
            type="text"
            autoComplete="off"
            aria-labelledby="todo-deal-q"
            data-testid={testIds.todos.dealPicker.input}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("dealPicker.placeholder")}
            className="h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
          />

          {!q ? <p className="mt-2 text-xs text-text-tertiary">{t("dealPicker.hint")}</p> : null}
          {q && deals.isPending ? (
            <p className="mt-2 text-xs text-text-tertiary" role="status">
              {t("dealPicker.loading")}
            </p>
          ) : null}
          {q && deals.isError ? (
            <p className="mt-2 text-xs text-danger" role="alert">
              {t("dealPicker.loadError")}
            </p>
          ) : null}
          {q && !deals.isPending && !deals.isError && matches.length === 0 ? (
            <p className="mt-2 text-xs text-text-tertiary">{t("dealPicker.noMatch")}</p>
          ) : null}

          {matches.length > 0 ? (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-surface">
              {matches.map((deal) => (
                <li key={deal.id}>
                  <button
                    type="button"
                    data-testid={testIds.todos.dealPicker.option(deal.id)}
                    onClick={() => {
                      onPick({ id: deal.id, name: deal.name });
                      onClose();
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
                  >
                    <span className="truncate">{deal.name}</span>
                    <span className="ml-2 shrink-0 truncate text-xs text-text-tertiary">
                      {deal.company_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-6 py-3">
          {canClear ? (
            <button
              type="button"
              data-testid={testIds.todos.dealPicker.clear}
              onClick={() => {
                onPick(null);
                onClose();
              }}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
            >
              {t("dealPicker.clear")}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("dealPicker.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
