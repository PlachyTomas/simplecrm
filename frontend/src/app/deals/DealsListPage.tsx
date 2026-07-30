import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Handshake,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { DealDetailDialog } from "@/app/deals/DealDetailDialog";
import { useDealDialog } from "@/app/deals/useDealDialog";
import {
  type DealListFilters,
  type DealSortKey,
  type DealStatusFilter,
  dealListParams,
  useDeals,
  useExportDealsCsv,
} from "@/app/deals/useDeals";
import { stageColor } from "@/app/pipeline/colors";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary";

const FILTER_SELECT_CLASS =
  "h-9 max-w-[12rem] truncate rounded-md border border-border bg-surface-overlay px-2 text-xs font-medium text-text-secondary focus:border-accent focus:outline-none";

const SORT_KEYS: DealSortKey[] = [
  "name",
  "value",
  "created_at",
  "expected_close_date",
  "company_name",
  "stage",
];

const STATUSES: DealStatusFilter[] = ["open", "won", "lost"];

function isSortKey(value: string): value is DealSortKey {
  return (SORT_KEYS as string[]).includes(value);
}

function isStatus(value: string): value is DealStatusFilter {
  return (STATUSES as string[]).includes(value);
}

/** Open / won / lost — mirrors the header chip in DealDetail (kept local so
 * this file doesn't reach into a page another change is landing on). Lost
 * carries the reason as a native tooltip since the row has no room for it
 * inline. */
function StatusChip({
  status,
  lostReason,
}: {
  status: DealStatusFilter;
  lostReason: string | null | undefined;
}) {
  const { t } = useTranslation("deals");
  if (status === "won") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-success">
        <Check size={12} strokeWidth={2} aria-hidden /> {t("dealsList.status.won")}
      </span>
    );
  }
  if (status === "lost") {
    const label = t("dealsList.status.lost");
    return (
      <span
        title={lostReason ?? undefined}
        aria-label={lostReason ? `${label}: ${lostReason}` : label}
        className="inline-flex items-center rounded-full bg-danger-subtle px-3 py-1 text-xs font-medium text-danger"
      >
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent">
      {t("dealsList.status.open")}
    </span>
  );
}

/** Sortable column header. Clicking the active column flips direction;
 * clicking a new one starts ascending. */
function SortHeader({
  label,
  sortKey,
  activeKey,
  order,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  sortKey: DealSortKey;
  activeKey: DealSortKey;
  order: "asc" | "desc";
  onSort: (key: DealSortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (order === "asc" ? "ascending" : "descending") : "none"}
      className={cn(TH, align === "right" && "text-right", className)}
    >
      <button
        type="button"
        data-testid={testIds.deals.sortHeader(sortKey)}
        onClick={() => onSort(sortKey)}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors duration-fast hover:text-text-primary",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {isActive ? (
          order === "asc" ? (
            <ArrowUp size={12} strokeWidth={1.75} aria-hidden />
          ) : (
            <ArrowDown size={12} strokeWidth={1.75} aria-hidden />
          )
        ) : (
          <ArrowUpDown
            size={12}
            strokeWidth={1.75}
            aria-hidden
            className="opacity-0 group-hover:opacity-100"
          />
        )}
      </button>
    </th>
  );
}

export function DealsListPage() {
  const { t } = useTranslation("deals");
  usePageTitle(t("dealsList.pageTitle"));
  const navigate = useNavigate();
  const { dealId: dialogDealId, openDeal, closeDeal } = useDealDialog();

  // Filters live in the URL so a refresh, a shared link, or the browser Back
  // button all restore the active view — same contract as Firmy.
  const [searchParams, setSearchParams] = useSearchParams();
  const stageFilter = searchParams.get("stage") ?? "";
  const ownerFilter = searchParams.get("owner") ?? "";
  const rawStatus = searchParams.get("status") ?? "";
  const statusFilter = isStatus(rawStatus) ? rawStatus : "";
  const page = Math.max(0, Number(searchParams.get("page") ?? "0") || 0);
  const rawSort = searchParams.get("sort") ?? "";
  const sortKey: DealSortKey = isSortKey(rawSort) ? rawSort : "created_at";
  const order: "asc" | "desc" = searchParams.get("dir") === "asc" ? "asc" : "desc";

  // The box types into local state for responsiveness and lands in the URL
  // once quiet. Seeded from `q` so a deep link shows its own term.
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 250);

  // Immutably patch the query string. Changing any filter resets pagination
  // unless the page itself is being set; empty values drop the param so URLs
  // stay clean.
  const patchParams = (updates: Record<string, string | null>, resetPage = true) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (resetPage && !("page" in updates)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  // Reflect the debounced box into the URL. Skips the mount echo (when the box
  // was seeded from an existing `q`) so a deep-linked page isn't reset.
  useEffect(() => {
    if ((searchParams.get("q") ?? "") === debouncedSearch) return;
    patchParams({ q: debouncedSearch || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const setPage = (updater: (p: number) => number) => {
    const nextPage = updater(page);
    patchParams({ page: nextPage > 0 ? String(nextPage) : null }, false);
  };

  const onSort = (key: DealSortKey) => {
    // Re-clicking the active column flips it; a new column starts ascending.
    const nextOrder = sortKey === key && order === "asc" ? "desc" : "asc";
    patchParams({ sort: key, dir: nextOrder }, false);
  };

  const clearFilters = () => {
    setSearchInput("");
    patchParams({ q: null, stage: null, owner: null, status: null });
  };
  const hasActiveFilters =
    searchInput !== "" || stageFilter !== "" || ownerFilter !== "" || statusFilter !== "";

  const filters: DealListFilters = {
    search: debouncedSearch,
    stageId: stageFilter || undefined,
    ownerUserId: ownerFilter || undefined,
    status: statusFilter || undefined,
    sort: sortKey,
    order,
  };

  const {
    data: deals,
    isPending,
    isError,
    isFetching,
  } = useDeals({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const { data: board } = usePipelineBoard();
  const { data: usersPage } = useOrgUsers();
  const exportCsv = useExportDealsCsv();

  const locale = useLocale();
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);

  // The board is only consulted for a stage's semantic dot color; the stage
  // *name* now arrives denormalized on each deal.
  const stageColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of board?.stages ?? []) map.set(s.id, stageColor(s.position, s.color));
    return map;
  }, [board]);

  const total = deals?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = deals?.items ?? [];

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("dealsList.pageTitle")}</h1>
          <p className="mt-1 text-sm text-text-tertiary">
            {t("dealsList.totalPrefix")} {t("dealCount", { count: total })}
          </p>
        </div>
        <button
          type="button"
          data-testid={testIds.deals.exportCsv}
          onClick={() => exportCsv.mutate(dealListParams(filters))}
          disabled={exportCsv.isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Download size={16} strokeWidth={1.75} aria-hidden />
          {exportCsv.isPending ? t("dealsList.exportPending") : t("dealsList.exportCsv")}
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative block md:max-w-md md:flex-1">
          <span className="sr-only">{t("dealsList.searchLabel")}</span>
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="search"
            data-testid={testIds.deals.searchInput}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("dealsList.searchPlaceholder")}
            className="h-10 w-full rounded-md border border-border bg-surface-overlay pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid={testIds.deals.stageFilter}
            aria-label={t("dealsList.stageFilterLabel")}
            value={stageFilter}
            onChange={(e) => patchParams({ stage: e.target.value })}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">{t("dealsList.stageAll")}</option>
            {(board?.stages ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            data-testid={testIds.deals.ownerFilter}
            aria-label={t("dealsList.ownerFilterLabel")}
            value={ownerFilter}
            onChange={(e) => patchParams({ owner: e.target.value })}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">{t("dealsList.ownerAll")}</option>
            {(usersPage?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            data-testid={testIds.deals.statusFilter}
            aria-label={t("dealsList.statusFilterLabel")}
            value={statusFilter}
            onChange={(e) => patchParams({ status: e.target.value })}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">{t("dealsList.statusAll")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`dealsList.status.${s}`)}
              </option>
            ))}
          </select>
          {hasActiveFilters ? (
            <button
              type="button"
              data-testid={testIds.deals.clearFilters}
              onClick={clearFilters}
              className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              <X size={14} strokeWidth={1.75} aria-hidden /> {t("dealsList.clearFilters")}
            </button>
          ) : null}
        </div>
      </div>

      {isError ? (
        <div
          className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {t("dealsList.loadError")}
        </div>
      ) : isPending ? (
        <div className="p-8 text-sm text-text-tertiary" role="status">
          {t("dealsList.loading")}
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          {hasActiveFilters ? (
            <EmptyState
              icon={Handshake}
              tone="filtered"
              title={t("dealsList.emptyFilteredTitle")}
              body={t("dealsList.emptyFilteredBody")}
              primary={{ label: t("dealsList.clearFilters"), onClick: clearFilters }}
            />
          ) : (
            <EmptyState
              icon={Handshake}
              title={t("dealsList.emptyTitle")}
              body={t("dealsList.emptyBody")}
              primary={{
                label: t("dealsList.emptyCta"),
                onClick: () => navigate("/app/pipeline"),
              }}
            />
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border-subtle">
              <thead>
                <tr>
                  <SortHeader
                    label={t("dealsList.columns.name")}
                    sortKey="name"
                    activeKey={sortKey}
                    order={order}
                    onSort={onSort}
                  />
                  <SortHeader
                    label={t("dealsList.columns.company")}
                    sortKey="company_name"
                    activeKey={sortKey}
                    order={order}
                    onSort={onSort}
                    className="hidden md:table-cell"
                  />
                  <SortHeader
                    label={t("dealsList.columns.value")}
                    sortKey="value"
                    activeKey={sortKey}
                    order={order}
                    onSort={onSort}
                    align="right"
                  />
                  <SortHeader
                    label={t("dealsList.columns.stage")}
                    sortKey="stage"
                    activeKey={sortKey}
                    order={order}
                    onSort={onSort}
                    className="hidden md:table-cell"
                  />
                  <th scope="col" className={TH}>
                    {t("dealsList.columns.status")}
                  </th>
                  <th scope="col" className={`${TH} hidden lg:table-cell`}>
                    {t("dealsList.columns.owner")}
                  </th>
                  <SortHeader
                    label={t("dealsList.columns.closed")}
                    sortKey="expected_close_date"
                    activeKey={sortKey}
                    order={order}
                    onSort={onSort}
                    className="hidden md:table-cell"
                  />
                </tr>
              </thead>
              <tbody
                className={cn(
                  "divide-y divide-border-subtle",
                  isFetching && "opacity-70 transition-opacity",
                )}
              >
                {items.map((deal) => {
                  const dotColor = stageColorById.get(deal.stage_id);
                  return (
                    <tr
                      key={deal.id}
                      onClick={() => openDeal(deal.id)}
                      className="cursor-pointer transition-colors duration-fast hover:bg-surface-overlay"
                    >
                      <td className="px-4 py-3 text-sm">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeal(deal.id);
                          }}
                          className="text-left font-medium text-text-primary hover:text-accent"
                        >
                          {deal.name}
                        </button>
                      </td>
                      <td className="hidden px-4 py-3 text-sm text-text-secondary md:table-cell">
                        {deal.company_name}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-text-primary">
                        {Number(deal.value) > 0 ? (
                          formatMoney(deal.value, deal.currency, locale)
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-sm md:table-cell">
                        {dotColor ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-overlay px-2 py-0.5 text-xs">
                            <span
                              aria-hidden
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: dotColor }}
                            />
                            <span className="text-text-secondary">{deal.stage_name}</span>
                          </span>
                        ) : (
                          <span className="text-text-secondary">{deal.stage_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <StatusChip status={deal.status} lostReason={deal.lost_reason} />
                      </td>
                      <td className="hidden px-4 py-3 text-sm text-text-secondary lg:table-cell">
                        {deal.owner_name ?? "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-sm md:table-cell">
                        {deal.closed_at ? (
                          <span className="text-text-secondary">
                            {dateFmt.format(new Date(deal.closed_at))}
                          </span>
                        ) : deal.expected_close_date ? (
                          <span className="text-text-tertiary">
                            ~{dateFmt.format(new Date(deal.expected_close_date))}
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-sm text-text-tertiary">
              <span className="tabular-nums">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}{" "}
                {t("dealsList.paginationOf")} {t("dealCount", { count: total })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label={t("dealsList.prevPage")}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  aria-label={t("dealsList.nextPage")}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {dialogDealId ? <DealDetailDialog dealId={dialogDealId} onClose={closeDeal} /> : null}
    </div>
  );
}
