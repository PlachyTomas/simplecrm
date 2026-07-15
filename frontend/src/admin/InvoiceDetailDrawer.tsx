import type { ParseKeys } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatDate, formatMoneyMinor } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";

import { CreditNoteModal } from "@/admin/CreditNoteModal";
import {
  type AdminInvoiceAuditEntry,
  useAdminInvoiceDetail,
  useMarkInvoicePaid,
  useSendInvoice,
  useVoidInvoice,
} from "@/admin/useAdminInvoices";

const EVENT_LABEL_KEY: Record<string, ParseKeys<"admin">> = {
  allocated: "invoiceDetail.auditLog.event.allocated",
  issued: "invoiceDetail.auditLog.event.issued",
  pdf_stored: "invoiceDetail.auditLog.event.pdf_stored",
  pdf_verified: "invoiceDetail.auditLog.event.pdf_verified",
  sent: "invoiceDetail.auditLog.event.sent",
  send_failed: "invoiceDetail.auditLog.event.send_failed",
  paid: "invoiceDetail.auditLog.event.paid",
  voided: "invoiceDetail.auditLog.event.voided",
  credit_note_created: "invoiceDetail.auditLog.event.credit_note_created",
  export_run: "invoiceDetail.auditLog.event.export_run",
  integrity_failure: "invoiceDetail.auditLog.event.integrity_failure",
};

interface InvoiceDetailDrawerProps {
  invoiceId: string;
  onSelectInvoice?: (id: string) => void;
}

export function InvoiceDetailDrawer({ invoiceId, onSelectInvoice }: InvoiceDetailDrawerProps) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  const detailQuery = useAdminInvoiceDetail(invoiceId);
  const markPaid = useMarkInvoicePaid();
  const voidInvoice = useVoidInvoice();
  const sendInvoice = useSendInvoice();

  const [voidReason, setVoidReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [creditOpen, setCreditOpen] = useState(false);

  if (detailQuery.isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-text-tertiary">
        {t("invoiceDetail.loading")}
      </section>
    );
  }
  if (!detailQuery.data) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-danger">
        {t("invoiceDetail.loadError")}
      </section>
    );
  }

  const inv = detailQuery.data;

  function handleMarkPaid() {
    setActionError(null);
    markPaid.mutate(
      { invoiceId, body: { paid_at: null } },
      {
        onError: (err) =>
          setActionError(extractMessage(err) ?? t("invoiceDetail.actions.markPaidError")),
      },
    );
  }

  function handleVoid() {
    if (voidReason.trim().length < 3) {
      setActionError(t("invoiceDetail.actions.voidReasonRequired"));
      return;
    }
    setActionError(null);
    voidInvoice.mutate(
      { invoiceId, body: { reason: voidReason.trim() } },
      {
        onSuccess: () => setVoidReason(""),
        onError: (err) =>
          setActionError(extractMessage(err) ?? t("invoiceDetail.actions.voidError")),
      },
    );
  }

  function handleSend() {
    setActionError(null);
    sendInvoice.mutate(
      { invoiceId, body: { override_to: null } },
      {
        onError: (err) =>
          setActionError(extractMessage(err) ?? t("invoiceDetail.actions.sendError")),
      },
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{inv.number}</h3>
          <StatusBadge status={inv.status} />
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {inv.customer_name} · {inv.organization_name}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-text-tertiary">{t("invoiceDetail.labels.issuedAt")}</dt>
        <dd>{formatDate(inv.issued_at, locale, { dateStyle: "short" })}</dd>
        <dt className="text-text-tertiary">{t("invoiceDetail.labels.taxableSupplyDate")}</dt>
        <dd>{formatDate(inv.taxable_supply_date, locale, { dateStyle: "short" })}</dd>
        <dt className="text-text-tertiary">{t("invoiceDetail.labels.dueAt")}</dt>
        <dd>{formatDate(inv.due_at, locale, { dateStyle: "short" })}</dd>
        <dt className="text-text-tertiary">{t("invoiceDetail.labels.variableSymbol")}</dt>
        <dd className="tabular-nums">{inv.variable_symbol}</dd>
        <dt className="text-text-tertiary">{t("invoiceDetail.labels.total")}</dt>
        <dd className="font-medium tabular-nums">
          {formatMoneyMinor(inv.total_minor, "CZK", locale)}
        </dd>
        <dt className="text-text-tertiary">{t("invoiceDetail.labels.email")}</dt>
        <dd>{inv.customer_email ?? "—"}</dd>
      </dl>

      {inv.lines.length > 0 ? (
        <div>
          <h4 className="mb-1 text-sm font-medium text-text-secondary">
            {t("invoiceDetail.lineItems.title")}
          </h4>
          <table className="w-full text-xs">
            <thead className="text-text-tertiary">
              <tr className="border-b border-border">
                <th className="py-1 text-left">{t("invoiceDetail.lineItems.description")}</th>
                <th className="py-1 text-right">{t("invoiceDetail.lineItems.quantity")}</th>
                <th className="py-1 text-right">{t("invoiceDetail.lineItems.price")}</th>
                <th className="py-1 text-right">{t("invoiceDetail.lineItems.total")}</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((line) => (
                <tr key={line.id} className="border-b border-border-subtle">
                  <td className="py-1">{line.description}</td>
                  <td className="py-1 text-right tabular-nums">
                    {line.quantity} {line.unit_label ?? ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatMoneyMinor(line.unit_price_minor, "CZK", locale)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatMoneyMinor(line.line_total_minor, "CZK", locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-border bg-bg p-3">
        <h4 className="text-sm font-medium text-text-secondary">
          {t("invoiceDetail.actions.title")}
        </h4>
        {actionError ? (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-bg px-2 py-1 text-xs text-danger"
          >
            {actionError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleMarkPaid}
            disabled={inv.status === "paid" || inv.status === "voided" || markPaid.isPending}
            className="hover:bg-bg-elevated rounded-md border border-border bg-surface px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("invoiceDetail.actions.markPaid")}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={inv.status === "draft" || sendInvoice.isPending}
            className="hover:bg-bg-elevated rounded-md border border-border bg-surface px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("invoiceDetail.actions.send")}
          </button>
        </div>
        {inv.status !== "voided" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder={t("invoiceDetail.actions.voidPlaceholder")}
              className="min-w-48 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleVoid}
              disabled={voidInvoice.isPending}
              className="rounded-md border border-danger/40 bg-bg px-3 py-1.5 text-xs text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("invoiceDetail.actions.void")}
            </button>
          </div>
        ) : null}
        {inv.kind === "invoice" && inv.status !== "voided" ? (
          <button
            type="button"
            onClick={() => setCreditOpen(true)}
            className="hover:bg-bg-elevated self-start rounded-md border border-border bg-surface px-3 py-1.5 text-xs"
          >
            {t("invoiceDetail.actions.issueCreditNote")}
          </button>
        ) : null}
      </div>

      <AuditLogTimeline entries={inv.audit_log} />

      {creditOpen ? (
        <CreditNoteModal
          parent={inv}
          onClose={() => setCreditOpen(false)}
          onIssued={(newId) => {
            setCreditOpen(false);
            onSelectInvoice?.(newId);
          }}
        />
      ) : null}
    </section>
  );
}

const INVOICE_STATUS_PILL: Record<string, { labelKey: ParseKeys<"admin">; className: string }> = {
  draft: {
    labelKey: "invoiceDetail.status.draft",
    className: "bg-bg-elevated text-text-secondary",
  },
  issued: { labelKey: "invoiceDetail.status.issued", className: "bg-info-subtle text-info" },
  paid: { labelKey: "invoiceDetail.status.paid", className: "bg-success-subtle text-success" },
  overdue: { labelKey: "invoiceDetail.status.overdue", className: "bg-danger-subtle text-danger" },
  voided: {
    labelKey: "invoiceDetail.status.voided",
    className: "bg-bg-elevated text-text-tertiary line-through",
  },
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("admin");
  const pill = INVOICE_STATUS_PILL[status];
  const label = pill ? t(pill.labelKey) : status;
  const className = pill?.className ?? "bg-bg-elevated text-text-secondary";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function AuditLogTimeline({ entries }: { entries: AdminInvoiceAuditEntry[] }) {
  const { t } = useTranslation("admin");
  const locale = useLocale();
  if (entries.length === 0) {
    return (
      <div>
        <h4 className="mb-1 text-sm font-medium text-text-secondary">
          {t("invoiceDetail.auditLog.title")}
        </h4>
        <p className="text-xs text-text-tertiary">{t("invoiceDetail.auditLog.empty")}</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-text-secondary">
        {t("invoiceDetail.auditLog.title")}
      </h4>
      <ol className="space-y-2">
        {entries.map((entry) => {
          const eventKey = EVENT_LABEL_KEY[entry.event];
          return (
            <li key={entry.id} className="rounded-md border border-border bg-bg px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-primary">
                  {eventKey ? t(eventKey) : entry.event}
                </span>
                <span className="text-text-tertiary">
                  {formatDate(entry.created_at, locale, { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              {Object.keys(entry.payload).length > 0 ? (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-text-tertiary">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function extractMessage(err: unknown): string | null {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body?: { detail?: { message?: string } | string } }).body;
    if (typeof body?.detail === "string") return body.detail;
    if (body?.detail && typeof body.detail === "object" && "message" in body.detail) {
      return body.detail.message ?? null;
    }
  }
  if (err instanceof Error) return err.message;
  return null;
}
