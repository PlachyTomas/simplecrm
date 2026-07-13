import type { ParseKeys, TFunction } from "i18next";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ADMIN_PAGE_SIZE, type AdminOrgRow, useAdminOrgList } from "@/admin/hooks";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { cn } from "@/lib/utils";

interface OrgListProps {
  selectedOrgId: string | null;
  onSelect: (orgId: string, userCount: number) => void;
}

function formatRelativeDays(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const relFmt = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (Math.abs(days) >= 1) return relFmt.format(days, "day");
  const hours = Math.round(ms / (3600 * 1000));
  return relFmt.format(hours, "hour");
}

const ORG_STATUS_KEY: Record<AdminOrgRow["status"], ParseKeys<"admin">> = {
  trialing: "orgList.status.trialing",
  pending_activation: "orgList.status.pendingActivation",
  active: "orgList.status.active",
  past_due: "orgList.status.pastDue",
  canceled: "orgList.status.canceled",
};

function statusPillSpec(
  row: AdminOrgRow,
  t: TFunction<"admin">,
): { label: string; className: string } {
  if (row.is_comp) {
    return { label: t("orgList.status.complementary"), className: "bg-info-subtle text-info" };
  }
  switch (row.status) {
    case "trialing":
      return { label: t(ORG_STATUS_KEY.trialing), className: "bg-info-subtle text-info" };
    case "pending_activation":
      return {
        label: t(ORG_STATUS_KEY.pending_activation),
        className: "bg-warning-subtle text-warning",
      };
    case "active":
      return { label: t(ORG_STATUS_KEY.active), className: "bg-success-subtle text-success" };
    case "past_due":
      return { label: t(ORG_STATUS_KEY.past_due), className: "bg-warning-subtle text-warning" };
    case "canceled":
      return { label: t(ORG_STATUS_KEY.canceled), className: "bg-danger-subtle text-danger" };
    default:
      return { label: row.status, className: "bg-surface-overlay text-text-tertiary" };
  }
}

export function OrgList({ selectedOrgId, onSelect }: OrgListProps) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const { data, isPending, isError, isFetching } = useAdminOrgList(
    debouncedSearch,
    page * ADMIN_PAGE_SIZE,
  );
  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo(() => {
    const helper = createColumnHelper<AdminOrgRow>();
    return [
      helper.accessor("name", {
        header: t("orgList.columns.name"),
        cell: (info) => <span className="font-medium text-text-primary">{info.getValue()}</span>,
      }),
      helper.accessor("plan_display", {
        header: t("orgList.columns.plan"),
        cell: (info) => <span className="text-text-secondary">{info.getValue()}</span>,
      }),
      helper.display({
        id: "status",
        header: t("orgList.columns.status"),
        cell: ({ row }) => {
          const spec = statusPillSpec(row.original, t);
          return (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                spec.className,
              )}
            >
              {spec.label}
            </span>
          );
        },
      }),
      helper.accessor("user_count", {
        header: t("orgList.columns.userCount"),
        cell: (info) => <span className="tabular-nums text-text-secondary">{info.getValue()}</span>,
      }),
      helper.display({
        id: "ends_at",
        header: t("orgList.columns.endsAt"),
        cell: ({ row }) => {
          const iso = row.original.current_period_ends_at ?? row.original.trial_ends_at;
          return (
            <span className="text-text-secondary">
              {iso ? formatDate(iso, locale, { dateStyle: "short" }) : "—"}
            </span>
          );
        },
      }),
      helper.accessor("last_activity_at", {
        header: t("orgList.columns.lastActivity"),
        cell: (info) => (
          <span className="text-text-tertiary">{formatRelativeDays(info.getValue(), locale)}</span>
        ),
      }),
    ];
  }, [locale, t]);

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const offset = page * ADMIN_PAGE_SIZE;
  const end = Math.min(offset + items.length, total);
  const hasPrev = page > 0;
  const hasNext = end < total;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(0);
            }}
            placeholder={t("orgList.searchPlaceholder")}
            className="block h-10 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <span className="text-xs text-text-tertiary">{t("orgList.count", { count: total })}</span>
      </div>

      {isPending ? (
        <div className="p-6 text-sm text-text-tertiary">{t("orgList.loading")}</div>
      ) : isError || data === null ? (
        <div className="p-6 text-sm text-danger" role="alert">
          {t("orgList.loadError")}
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-text-tertiary">{t("orgList.empty")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-text-tertiary">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border-subtle">
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-2 font-medium">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-org-id={row.original.id}
                  onClick={() => onSelect(row.original.id, row.original.user_count)}
                  className={cn(
                    "cursor-pointer border-b border-border-subtle/40 transition-colors",
                    selectedOrgId === row.original.id
                      ? "bg-surface-overlay"
                      : "hover:bg-surface-overlay",
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border-subtle p-3 text-xs text-text-tertiary">
        <span>
          {total > 0
            ? t("orgList.pageRange", { from: offset + 1, to: end, total })
            : isFetching
              ? t("orgList.loading")
              : t("orgList.noResults")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!hasPrev}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t("orgList.prevPage")}
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t("orgList.nextPage")}
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </section>
  );
}
