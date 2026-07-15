import type { ParseKeys } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatDate, formatMoneyMinor } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { cn } from "@/lib/utils";

import { ManualInvoiceModal } from "@/admin/ManualInvoiceModal";
import {
  type AdminInvoiceFilters,
  type AdminInvoiceListItem,
  type AdminInvoiceStatus,
  useAdminInvoiceList,
} from "@/admin/useAdminInvoices";
import {
  useExportInvoicesCsv,
  useExportInvoicesFull,
  useExportInvoicesPdfZip,
} from "@/admin/useExportInvoiceYear";

const STATUS_PILL: Record<AdminInvoiceStatus, { labelKey: ParseKeys<"admin">; className: string }> =
  {
    draft: {
      labelKey: "invoicesList.status.draft",
      className: "bg-bg-elevated text-text-secondary",
    },
    issued: { labelKey: "invoicesList.status.issued", className: "bg-info-subtle text-info" },
    paid: { labelKey: "invoicesList.status.paid", className: "bg-success-subtle text-success" },
    overdue: { labelKey: "invoicesList.status.overdue", className: "bg-danger-subtle text-danger" },
    voided: {
      labelKey: "invoicesList.status.voided",
      className: "bg-bg-elevated text-text-tertiary line-through",
    },
  };

const KIND_LABEL: Record<AdminInvoiceListItem["kind"], ParseKeys<"admin">> = {
  invoice: "invoicesList.kind.invoice",
  credit_note: "invoicesList.kind.credit_note",
  proforma: "invoicesList.kind.proforma",
};

interface InvoicesListProps {
  selectedInvoiceId: string | null;
  onSelect: (id: string) => void;
}

const ALL_STATUSES: AdminInvoiceStatus[] = ["issued", "paid", "overdue", "voided"];

export function InvoicesList({ selectedInvoiceId, onSelect }: InvoicesListProps) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<AdminInvoiceStatus[]>([]);
  const [year, setYear] = useState<number | "">("");
  const [manualOpen, setManualOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const exportCsv = useExportInvoicesCsv();
  const exportPdfZip = useExportInvoicesPdfZip();
  const exportFull = useExportInvoicesFull();
  const exportYear = year || new Date().getFullYear();

  const filters: AdminInvoiceFilters = {
    q: q.trim() || undefined,
    status: statusFilter.length > 0 ? statusFilter : undefined,
    year: year || undefined,
  };

  const query = useAdminInvoiceList(filters);

  function toggleStatus(s: AdminInvoiceStatus) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("invoicesList.title")}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              exportCsv.mutate(exportYear, {
                onError: () => setExportError(t("invoicesList.exportCsvError")),
              });
            }}
            disabled={exportCsv.isPending}
            title={t("invoicesList.exportCsvTitle", { year: exportYear })}
            className="hover:bg-bg-elevated rounded-md border border-border bg-bg px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {exportCsv.isPending
              ? t("invoicesList.downloading")
              : t("invoicesList.exportCsv", { year: exportYear })}
          </button>
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              exportPdfZip.mutate(exportYear, {
                onError: () => setExportError(t("invoicesList.exportPdfError")),
              });
            }}
            disabled={exportPdfZip.isPending}
            className="hover:bg-bg-elevated rounded-md border border-border bg-bg px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {exportPdfZip.isPending
              ? t("invoicesList.downloading")
              : t("invoicesList.exportPdfZip", { year: exportYear })}
          </button>
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              exportFull.mutate(exportYear, {
                onError: () => setExportError(t("invoicesList.exportFullError")),
              });
            }}
            disabled={exportFull.isPending}
            className="hover:bg-bg-elevated rounded-md border border-border bg-bg px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {exportFull.isPending
              ? t("invoicesList.downloading")
              : t("invoicesList.exportFull", { year: exportYear })}
          </button>
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            {t("invoicesList.issueManually")}
          </button>
        </div>
      </div>
      {exportError ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-bg px-3 py-2 text-xs text-danger"
        >
          {exportError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("invoicesList.searchPlaceholder")}
          className="min-w-64 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder={t("invoicesList.yearPlaceholder")}
          className="w-24 rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {ALL_STATUSES.map((s) => {
            const active = statusFilter.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition",
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-bg text-text-secondary hover:text-text-primary",
                )}
              >
                {t(STATUS_PILL[s].labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {query.isPending ? (
        <p className="text-sm text-text-tertiary">{t("invoicesList.loading")}</p>
      ) : !query.data ? (
        <p className="text-sm text-danger" role="alert">
          {t("invoicesList.loadError")}
        </p>
      ) : query.data.items.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("invoicesList.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-tertiary">
                <th className="px-3 py-2">{t("invoicesList.columns.number")}</th>
                <th className="px-3 py-2">{t("invoicesList.columns.customer")}</th>
                <th className="px-3 py-2">{t("invoicesList.columns.kind")}</th>
                <th className="px-3 py-2">{t("invoicesList.columns.issuedAt")}</th>
                <th className="px-3 py-2">{t("invoicesList.columns.dueAt")}</th>
                <th className="px-3 py-2">{t("invoicesList.columns.status")}</th>
                <th className="px-3 py-2 text-right">{t("invoicesList.columns.total")}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => {
                const isSelected = row.id === selectedInvoiceId;
                const pill = STATUS_PILL[row.status];
                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(row.id)}
                    className={cn(
                      "hover:bg-bg-elevated cursor-pointer border-b border-border-subtle transition",
                      isSelected && "bg-accent/5",
                    )}
                  >
                    <td className="px-3 py-2 font-medium tabular-nums">{row.number}</td>
                    <td className="px-3 py-2">
                      <div>{row.customer_name}</div>
                      <div className="text-xs text-text-tertiary">{row.organization_name}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-secondary">
                      {t(KIND_LABEL[row.kind])}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {formatDate(row.issued_at, locale, { dateStyle: "short" })}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {formatDate(row.due_at, locale, { dateStyle: "short" })}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          pill.className,
                        )}
                      >
                        {t(pill.labelKey)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoneyMinor(row.total_minor, "CZK", locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-text-tertiary">
            {t("invoicesList.shown", { count: query.data.items.length, total: query.data.total })}
          </p>
        </div>
      )}

      {manualOpen ? (
        <ManualInvoiceModal
          onClose={() => setManualOpen(false)}
          onIssued={(newId) => {
            setManualOpen(false);
            onSelect(newId);
          }}
        />
      ) : null}
    </section>
  );
}
