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
  Plus,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AddCompanyModal } from "@/app/companies/AddCompanyModal";
import { OwnershipBadge } from "@/app/companies/OwnershipBadge";
import { type CompanyOut, useCompanies } from "@/app/companies/useCompanies";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { csNoun } from "@/lib/i18n/nouns";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

function pluralizeCompanies(n: number): string {
  return `${n} ${csNoun(n, "firma")}`;
}

export function CompaniesListPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [page, setPage] = useState(0);
  const [sorting, setSorting] = useState<SortingState>([]);

  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const {
    data: companies,
    isPending,
    isError,
    isFetching,
  } = useCompanies({
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    search: debouncedSearch,
  });

  const locale = user?.organization.locale;
  const dateFmt = useMemo(
    () => (locale ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }) : null),
    [locale],
  );

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
      helper.accessor("address_city", {
        header: "Město",
        enableSorting: false,
        cell: (info) => <span className="text-text-secondary">{info.getValue() ?? "—"}</span>,
      }),
      helper.accessor("created_at", {
        header: "Založeno",
        cell: (info) => (
          <span className="text-text-tertiary">
            {dateFmt ? dateFmt.format(new Date(info.getValue())) : info.getValue()}
          </span>
        ),
      }),
    ];
  }, [dateFmt]);

  const table = useReactTable({
    data: companies?.items ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualPagination: true,
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

      <div className="mb-4">
        <label className="relative block">
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
            className="h-10 w-full rounded-md border border-border bg-surface-overlay pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none md:max-w-md"
          />
        </label>
      </div>

      {isError ? (
        <div
          className="rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger"
          role="alert"
        >
          Firmy se nepodařilo načíst. Zkuste to prosím znovu.
        </div>
      ) : total === 0 && !isPending && !isFetching ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface py-12 text-center">
          <div
            aria-hidden
            className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
          >
            <Building2 size={24} strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-semibold">
            {debouncedSearch ? "Žádná firma tomu neodpovídá" : "Zatím tu nejsou žádné firmy"}
          </h2>
          <p className="max-w-sm text-sm text-text-secondary">
            {debouncedSearch
              ? "Zkuste upravit hledaný výraz nebo přidejte novou firmu."
              : "Přidejte svou první firmu — stačí zadat IČO a zbytek doplníme z ARES."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
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
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
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
                    <td key={cell.id} className="px-4 py-3 text-sm">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3 text-sm text-text-tertiary">
              <span>
                Stránka {page + 1} z {pageCount}
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
