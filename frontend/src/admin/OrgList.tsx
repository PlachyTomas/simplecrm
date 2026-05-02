import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ADMIN_PAGE_SIZE,
  type AdminOrgRow,
  useAdminOrgList,
} from "@/admin/hooks";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { cn } from "@/lib/utils";

interface OrgListProps {
  selectedOrgId: string | null;
  onSelect: (orgId: string, userCount: number) => void;
}

const dateFmt = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short" });
const relFmt = new Intl.RelativeTimeFormat("cs-CZ", { numeric: "auto" });

function formatRelativeDays(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 3600 * 1000));
  if (Math.abs(days) >= 1) return relFmt.format(days, "day");
  const hours = Math.round(ms / (3600 * 1000));
  return relFmt.format(hours, "hour");
}

function statusPillSpec(row: AdminOrgRow): { label: string; className: string } {
  if (row.is_comp) {
    return { label: "Komplementární", className: "bg-info-subtle text-info" };
  }
  switch (row.status) {
    case "trialing":
      return { label: "Zkušební verze", className: "bg-info-subtle text-info" };
    case "pending_activation":
      return { label: "Čeká na platbu", className: "bg-warning-subtle text-warning" };
    case "active":
      return { label: "Aktivní", className: "bg-success-subtle text-success" };
    case "past_due":
      return { label: "Po splatnosti", className: "bg-warning-subtle text-warning" };
    case "canceled":
      return { label: "Zrušeno", className: "bg-danger-subtle text-danger" };
    default:
      return { label: row.status, className: "bg-surface-overlay text-text-tertiary" };
  }
}

export function OrgList({ selectedOrgId, onSelect }: OrgListProps) {
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
        header: "Název",
        cell: (info) => (
          <span className="font-medium text-text-primary">{info.getValue()}</span>
        ),
      }),
      helper.accessor("plan_display", {
        header: "Plán",
        cell: (info) => (
          <span className="text-text-secondary">{info.getValue()}</span>
        ),
      }),
      helper.display({
        id: "status",
        header: "Stav",
        cell: ({ row }) => {
          const spec = statusPillSpec(row.original);
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
        header: "Uživatelé",
        cell: (info) => (
          <span className="tabular-nums text-text-secondary">{info.getValue()}</span>
        ),
      }),
      helper.display({
        id: "ends_at",
        header: "Končí",
        cell: ({ row }) => {
          const iso =
            row.original.current_period_ends_at ?? row.original.trial_ends_at;
          return (
            <span className="text-text-secondary">
              {iso ? dateFmt.format(new Date(iso)) : "—"}
            </span>
          );
        },
      }),
      helper.accessor("last_activity_at", {
        header: "Poslední aktivita",
        cell: (info) => (
          <span className="text-text-tertiary">
            {formatRelativeDays(info.getValue())}
          </span>
        ),
      }),
    ];
  }, []);

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
        <div className="relative flex-1 min-w-[12rem]">
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
            placeholder="Hledat organizaci…"
            className="block h-10 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <span className="text-xs text-text-tertiary">
          {total} {total === 1 ? "organizace" : total >= 2 && total <= 4 ? "organizace" : "organizací"}
        </span>
      </div>

      {isPending ? (
        <div className="p-6 text-sm text-text-tertiary">Načítání…</div>
      ) : isError || data === null ? (
        <div className="p-6 text-sm text-danger" role="alert">
          Načítání seznamu se nezdařilo.
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-text-tertiary">
          Žádné organizace nevyhovují filtru.
        </div>
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
            ? `${offset + 1}–${end} z ${total}`
            : isFetching
              ? "Načítání…"
              : "0 z 0"}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={!hasPrev}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Předchozí strana"
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-overlay disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Další strana"
          >
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </section>
  );
}
