import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Plus,
  Search,
  Table2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AddCompanyModal } from "@/app/companies/AddCompanyModal";
import { OwnershipBadge } from "@/app/companies/OwnershipBadge";
import {
  type CompanyOut,
  type CompanyOwnershipFilter,
  type CompanySortKey,
  useCompanies,
} from "@/app/companies/useCompanies";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { EmptyState } from "@/components/ui/empty-state";
import { csNoun } from "@/lib/i18n/nouns";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function pluralizeCompanies(n: number): string {
  return `${n} ${csNoun(n, "firma")}`;
}

// Sortable React Table column ids → backend sort keys. The list is
// authoritative: any column not in this map renders without a sort
// affordance.
const SORT_KEY_BY_COLUMN: Record<string, CompanySortKey> = {
  name: "name",
  ownership_expires_at: "ownership_expires_at",
  last_activity_at: "last_activity_at",
  last_order_at: "last_order_at",
  created_at: "created_at",
};

const OWNERSHIP_OPTIONS: { value: CompanyOwnershipFilter | "all"; label: string }[] = [
  { value: "all", label: "Vše v mém týmu" },
  { value: "mine_and_unowned", label: "Moje + nezabrané" },
  { value: "mine", label: "Jen moje" },
  { value: "unowned", label: "Jen nezabrané" },
];

type ViewMode = "cards" | "table";

const VIEW_MODE_STORAGE_KEY = "simplecrm.companies.viewMode";

function readStoredViewMode(): ViewMode {
  if (typeof window === "undefined") return "cards";
  const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === "table" ? "table" : "cards";
}

export function CompaniesListPage() {
  usePageTitle("Firmy");
  const [modalOpen, setModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [ownership, setOwnership] = useState<CompanyOwnershipFilter | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredViewMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  // Translate the React Table sort state into the backend's sort/order
  // params. We always carry a single sort spec (multi-column server sort
  // isn't supported and the UI never produces it).
  const sortSpec = sorting[0];
  const sortKey: CompanySortKey = (sortSpec && SORT_KEY_BY_COLUMN[sortSpec.id]) ?? "name";
  const sortOrder: "asc" | "desc" = sortSpec?.desc ? "desc" : "asc";
  const {
    data: companies,
    isPending,
    isError,
    isFetching,
  } = useCompanies({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: debouncedSearch,
    sort: sortKey,
    order: sortOrder,
    ownership: ownership === "all" ? undefined : ownership,
  });

  const locale = user?.organization?.locale;
  const dateFmt = useMemo(
    () => (locale ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }) : null),
    [locale],
  );
  const shortDateFmt = useMemo(
    () => (locale ? new Intl.DateTimeFormat(locale, { dateStyle: "short" }) : null),
    [locale],
  );

  const usersById = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    for (const u of usersPage?.items ?? []) {
      map.set(u.id, { name: u.name, email: u.email });
    }
    return map;
  }, [usersPage]);

  const columns = useMemo(() => {
    const helper = createColumnHelper<CompanyOut>();
    return [
      helper.accessor("name", {
        header: "Název",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">{info.getValue()}</span>
              <OwnershipBadge
                ownershipExpiresAt={row.ownership_expires_at}
                ownerUserId={row.owner_user_id}
                compact
              />
            </div>
          );
        },
      }),
      helper.accessor("ico", {
        header: "IČO",
        enableSorting: false,
        cell: (info) => (
          <span className="font-mono text-text-secondary">{info.getValue() ?? "—"}</span>
        ),
      }),
      helper.accessor("owner_user_id", {
        header: "Vlastník",
        enableSorting: false,
        cell: (info) => {
          const ownerId = info.getValue();
          if (!ownerId) {
            return <span className="text-text-tertiary">— ve sdíleném poolu</span>;
          }
          const owner = usersById.get(ownerId);
          if (!owner) return <span className="text-text-tertiary">—</span>;
          const initials = owner.name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p.charAt(0).toUpperCase())
            .join("");
          return (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-overlay text-xs font-semibold text-text-secondary"
              >
                {initials || "?"}
              </span>
              <span className="text-text-secondary">{owner.name}</span>
            </span>
          );
        },
      }),
      helper.accessor("ownership_expires_at", {
        id: "ownership_expires_at",
        header: "Zámek vyprší",
        cell: (info) => {
          const value = info.getValue();
          if (!value || !info.row.original.owner_user_id) {
            return <span className="text-text-tertiary">—</span>;
          }
          return (
            <span className="text-text-secondary">
              {dateFmt ? dateFmt.format(new Date(value)) : value}
            </span>
          );
        },
      }),
      helper.accessor("last_order_at", {
        id: "last_order_at",
        header: "Poslední obchod",
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className="text-text-secondary">
              {value ? (dateFmt ? dateFmt.format(new Date(value)) : value) : "—"}
            </span>
          );
        },
      }),
      helper.accessor("updated_at", {
        id: "last_activity_at",
        header: "Poslední aktivita",
        cell: (info) => (
          <span className="text-text-tertiary">
            {dateFmt ? dateFmt.format(new Date(info.getValue())) : info.getValue()}
          </span>
        ),
      }),
    ];
  }, [dateFmt, usersById]);

  // Dense Tabulka mode: classic data-grid with every relevant field
  // visible at once, including phone/email pulled from the company's
  // main contact (the alphabetically-first contact when no explicit
  // pick has been set on the company detail page).
  const tableColumns = useMemo(() => {
    const helper = createColumnHelper<CompanyOut>();
    const offset = page * PAGE_SIZE;
    return [
      helper.display({
        id: "rownum",
        header: "#",
        cell: (info) => (
          <span className="tabular-nums text-text-tertiary">{offset + info.row.index + 1}</span>
        ),
      }),
      helper.accessor("name", {
        header: "Název",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">{info.getValue()}</span>
              <OwnershipBadge
                ownershipExpiresAt={row.ownership_expires_at}
                ownerUserId={row.owner_user_id}
                compact
              />
            </div>
          );
        },
      }),
      helper.accessor("ico", {
        header: "IČO",
        enableSorting: false,
        cell: (info) => (
          <span className="font-mono text-text-secondary">{info.getValue() ?? "—"}</span>
        ),
      }),
      helper.accessor("dic", {
        header: "DIČ",
        enableSorting: false,
        cell: (info) => (
          <span className="font-mono text-text-tertiary">{info.getValue() ?? "—"}</span>
        ),
      }),
      helper.accessor("updated_at", {
        id: "last_activity_at",
        header: "Posl. akt.",
        cell: (info) => (
          <span className="tabular-nums text-text-tertiary">
            {shortDateFmt ? shortDateFmt.format(new Date(info.getValue())) : info.getValue()}
          </span>
        ),
      }),
      helper.accessor("address_street", {
        header: "Sídlo Ulice",
        enableSorting: false,
        cell: (info) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span>,
      }),
      helper.accessor("address_city", {
        header: "Sídlo Město",
        enableSorting: false,
        cell: (info) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span>,
      }),
      helper.accessor("address_zip", {
        header: "Sídlo PSČ",
        enableSorting: false,
        cell: (info) => (
          <span className="font-mono text-text-tertiary">{info.getValue() ?? "—"}</span>
        ),
      }),
      helper.display({
        id: "phone",
        header: "Telefon",
        cell: (info) => {
          const phone = info.row.original.main_contact?.phone;
          return phone ? (
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-accent hover:text-accent-hover"
            >
              {phone}
            </a>
          ) : (
            <span className="text-text-tertiary">—</span>
          );
        },
      }),
      helper.display({
        id: "email",
        header: "Email",
        cell: (info) => {
          const email = info.row.original.main_contact?.email;
          return email ? (
            <a
              href={`mailto:${email}`}
              onClick={(e) => e.stopPropagation()}
              className="text-accent hover:text-accent-hover"
            >
              {email}
            </a>
          ) : (
            <span className="text-text-tertiary">—</span>
          );
        },
      }),
      helper.accessor("owner_user_id", {
        header: "Vlastník",
        enableSorting: false,
        cell: (info) => {
          const ownerId = info.getValue();
          if (!ownerId) return <span className="text-text-tertiary">— pool</span>;
          const owner = usersById.get(ownerId);
          return <span className="text-text-secondary">{owner?.name ?? "—"}</span>;
        },
      }),
      helper.accessor("ownership_expires_at", {
        id: "ownership_expires_at",
        header: "Zámek vyprší",
        cell: (info) => {
          const value = info.getValue();
          if (!value || !info.row.original.owner_user_id) {
            return <span className="text-text-tertiary">—</span>;
          }
          return (
            <span className="tabular-nums text-text-secondary">
              {shortDateFmt ? shortDateFmt.format(new Date(value)) : value}
            </span>
          );
        },
      }),
      helper.accessor("last_order_at", {
        id: "last_order_at",
        header: "Posl. obchod",
        cell: (info) => {
          const value = info.getValue();
          return (
            <span className="tabular-nums text-text-secondary">
              {value ? (shortDateFmt ? shortDateFmt.format(new Date(value)) : value) : "—"}
            </span>
          );
        },
      }),
      helper.accessor("website", {
        header: "Web",
        enableSorting: false,
        cell: (info) => {
          const url = info.getValue();
          if (!url) return <span className="text-text-tertiary">—</span>;
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="truncate text-accent hover:text-accent-hover"
            >
              {url.replace(/^https?:\/\//, "")}
            </a>
          );
        },
      }),
      helper.accessor("legal_form", {
        header: "Pr. forma",
        enableSorting: false,
        cell: (info) => <span className="text-text-tertiary">{info.getValue() ?? "—"}</span>,
      }),
    ];
  }, [page, shortDateFmt, usersById]);

  const table = useReactTable({
    data: companies?.items ?? [],
    columns: viewMode === "table" ? tableColumns : columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualPagination: true,
    manualSorting: true,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const handleCreated = (companyId: string) => {
    navigate(`/app/companies/${companyId}`);
  };

  const total = companies?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Firmy</h1>
          <p className="mt-1 text-sm text-text-tertiary">{pluralizeCompanies(total)}</p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
        >
          <Plus size={16} strokeWidth={1.75} /> Přidat firmu
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative block md:max-w-md md:flex-1">
          <span className="sr-only">Hledat firmu</span>
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
            placeholder="Hledat podle názvu nebo IČO…"
            className="h-10 w-full rounded-md border border-border bg-surface-overlay pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
        </label>
        <div
          role="radiogroup"
          aria-label="Filtr vlastnictví firem"
          className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-surface-overlay p-1"
        >
          {OWNERSHIP_OPTIONS.map((option) => {
            const active = ownership === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setOwnership(option.value);
                  setPage(0);
                }}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors duration-fast",
                  active
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <div
          role="radiogroup"
          aria-label="Režim zobrazení"
          className="hidden gap-1 rounded-md border border-border bg-surface-overlay p-1 md:inline-flex"
        >
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === "cards"}
            aria-label="Karty"
            title="Karty"
            onClick={() => setViewMode("cards")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
              viewMode === "cards"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <LayoutGrid size={14} strokeWidth={1.75} aria-hidden /> Karty
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={viewMode === "table"}
            aria-label="Tabulka"
            title="Tabulka"
            onClick={() => setViewMode("table")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast",
              viewMode === "table"
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            <Table2 size={14} strokeWidth={1.75} aria-hidden /> Tabulka
          </button>
        </div>
      </div>

      {isError ? (
        <div
          className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
          role="alert"
        >
          Firmy se nepodařilo načíst. Zkuste to prosím znovu.
        </div>
      ) : total === 0 && !isPending && !isFetching ? (
        <div className="rounded-lg border border-border bg-surface">
          {debouncedSearch ? (
            <EmptyState
              icon={Building2}
              tone="filtered"
              title="Žádný výsledek pro vybrané filtry."
              body="Zkuste upravit hledaný výraz nebo zrušte filtr."
              primary={{
                label: "Vymazat filtry",
                onClick: () => {
                  setSearchInput("");
                  setPage(0);
                },
              }}
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="Přidejte první firmu"
              body="Stačí zadat IČO a zbytek doplníme z ARES."
              primary={{
                label: "+ Přidat firmu",
                onClick: () => setModalOpen(true),
              }}
            />
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Mobile: stacked cards (<768px) */}
          <ul role="list" className="divide-y divide-border-subtle md:hidden">
            {table.getRowModel().rows.map((row) => {
              const company = row.original;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/companies/${company.id}`)}
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-fast hover:bg-surface-overlay"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-text-primary">
                        {company.name}
                      </span>
                      <OwnershipBadge
                        ownershipExpiresAt={company.ownership_expires_at}
                        ownerUserId={company.owner_user_id}
                        compact
                      />
                    </div>
                    <p className="text-xs text-text-tertiary">
                      <span className="font-mono">{company.ico ?? "bez IČO"}</span>
                      {company.address_city ? (
                        <>
                          <span> · </span>
                          {company.address_city}
                        </>
                      ) : null}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Desktop: full table (≥768px). Tabulka mode adds horizontal
              scroll + denser cell padding to fit all columns. */}
          <div className={cn("hidden md:block", viewMode === "table" && "overflow-x-auto")}>
            <table className="min-w-full divide-y divide-border-subtle">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const sortState = header.column.getIsSorted();
                      const canSort = header.column.getCanSort();
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            sortState === "asc"
                              ? "ascending"
                              : sortState === "desc"
                                ? "descending"
                                : canSort
                                  ? "none"
                                  : undefined
                          }
                          className={cn(
                            "whitespace-nowrap text-left font-medium uppercase tracking-wider text-text-tertiary",
                            viewMode === "table" ? "px-2 py-1.5 text-[11px]" : "px-4 py-3 text-xs",
                          )}
                        >
                          {canSort ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="group inline-flex items-center gap-1 transition-colors duration-fast hover:text-text-primary"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {sortState === "asc" ? (
                                <ArrowUp size={12} strokeWidth={1.75} />
                              ) : sortState === "desc" ? (
                                <ArrowDown size={12} strokeWidth={1.75} />
                              ) : (
                                <ArrowUpDown
                                  size={12}
                                  strokeWidth={1.75}
                                  className="opacity-0 group-hover:opacity-100"
                                />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody
                className={cn(
                  "divide-y divide-border-subtle",
                  isFetching && "opacity-70 transition-opacity",
                )}
              >
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/app/companies/${row.original.id}`)}
                    className="cursor-pointer transition-colors duration-fast hover:bg-surface-overlay"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          "whitespace-nowrap",
                          viewMode === "table" ? "px-2 py-1.5 text-xs" : "px-4 py-3 text-sm",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-sm text-text-tertiary">
              <span className="tabular-nums">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} z {total}{" "}
                {csNoun(total, "firma")}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  aria-label="Předchozí stránka"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  aria-label="Další stránka"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-overlay text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <AddCompanyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
