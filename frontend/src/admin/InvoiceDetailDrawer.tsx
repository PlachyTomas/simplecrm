import { useState } from "react";

import { formatCzkMinor } from "@/components/billing/format";

import { CreditNoteModal } from "@/admin/CreditNoteModal";
import {
  type AdminInvoiceAuditEntry,
  useAdminInvoiceDetail,
  useMarkInvoicePaid,
  useSendInvoice,
  useVoidInvoice,
} from "@/admin/useAdminInvoices";

const EVENT_LABEL: Record<string, string> = {
  allocated: "Přiděleno číslo",
  issued: "Vystaveno",
  pdf_stored: "PDF uloženo",
  pdf_verified: "PDF ověřeno",
  sent: "Odesláno",
  send_failed: "Odeslání selhalo",
  paid: "Označeno jako zaplaceno",
  voided: "Stornováno",
  credit_note_created: "Vystaven dobropis",
  export_run: "Spuštěn export",
  integrity_failure: "Selhání integrity",
};

interface InvoiceDetailDrawerProps {
  invoiceId: string;
  onSelectInvoice?: (id: string) => void;
}

export function InvoiceDetailDrawer({ invoiceId, onSelectInvoice }: InvoiceDetailDrawerProps) {
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
        Načítání faktury…
      </section>
    );
  }
  if (!detailQuery.data) {
    return (
      <section className="rounded-lg border border-border bg-surface p-5 text-sm text-danger">
        Detail faktury se nepodařilo načíst.
      </section>
    );
  }

  const inv = detailQuery.data;

  function handleMarkPaid() {
    setActionError(null);
    markPaid.mutate(
      { invoiceId, body: { paid_at: null } },
      {
        onError: (err) => setActionError(extractMessage(err) ?? "Označení selhalo."),
      },
    );
  }

  function handleVoid() {
    if (voidReason.trim().length < 3) {
      setActionError("Důvod storna je povinný (min. 3 znaky).");
      return;
    }
    setActionError(null);
    voidInvoice.mutate(
      { invoiceId, body: { reason: voidReason.trim() } },
      {
        onSuccess: () => setVoidReason(""),
        onError: (err) => setActionError(extractMessage(err) ?? "Storno selhalo."),
      },
    );
  }

  function handleSend() {
    setActionError(null);
    sendInvoice.mutate(
      { invoiceId, body: { override_to: null } },
      {
        onError: (err) => setActionError(extractMessage(err) ?? "Odeslání selhalo."),
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
        <dt className="text-text-tertiary">Vystaveno</dt>
        <dd>{formatLocalDate(inv.issued_at)}</dd>
        <dt className="text-text-tertiary">DUZP</dt>
        <dd>{formatLocalDate(inv.taxable_supply_date)}</dd>
        <dt className="text-text-tertiary">Splatnost</dt>
        <dd>{formatLocalDate(inv.due_at)}</dd>
        <dt className="text-text-tertiary">Variabilní symbol</dt>
        <dd className="tabular-nums">{inv.variable_symbol}</dd>
        <dt className="text-text-tertiary">Celkem</dt>
        <dd className="font-medium tabular-nums">{formatCzkMinor(inv.total_minor)}</dd>
        <dt className="text-text-tertiary">Email</dt>
        <dd>{inv.customer_email ?? "—"}</dd>
      </dl>

      {inv.lines.length > 0 ? (
        <div>
          <h4 className="mb-1 text-sm font-medium text-text-secondary">Položky</h4>
          <table className="w-full text-xs">
            <thead className="text-text-tertiary">
              <tr className="border-b border-border">
                <th className="py-1 text-left">Popis</th>
                <th className="py-1 text-right">Množství</th>
                <th className="py-1 text-right">Cena</th>
                <th className="py-1 text-right">Celkem</th>
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
                    {formatCzkMinor(line.unit_price_minor)}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {formatCzkMinor(line.line_total_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border border-border bg-bg p-3">
        <h4 className="text-sm font-medium text-text-secondary">Akce</h4>
        {actionError ? (
          <p
            role="alert"
            className="border-danger/40 rounded-md border bg-bg px-2 py-1 text-xs text-danger"
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
            Označit jako zaplaceno
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={inv.status === "draft" || sendInvoice.isPending}
            className="hover:bg-bg-elevated rounded-md border border-border bg-surface px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Odeslat
          </button>
        </div>
        {inv.status !== "voided" ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Důvod storna…"
              className="min-w-48 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-xs focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleVoid}
              disabled={voidInvoice.isPending}
              className="border-danger/40 rounded-md border bg-bg px-3 py-1.5 text-xs text-danger hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stornovat
            </button>
          </div>
        ) : null}
        {inv.kind === "invoice" && inv.status !== "voided" ? (
          <button
            type="button"
            onClick={() => setCreditOpen(true)}
            className="hover:bg-bg-elevated self-start rounded-md border border-border bg-surface px-3 py-1.5 text-xs"
          >
            Vystavit dobropis
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Koncept", className: "bg-bg-elevated text-text-secondary" },
    issued: { label: "Vystavena", className: "bg-info-subtle text-info" },
    paid: { label: "Zaplacena", className: "bg-success-subtle text-success" },
    overdue: { label: "Po splatnosti", className: "bg-danger-subtle text-danger" },
    voided: {
      label: "Stornována",
      className: "bg-bg-elevated text-text-tertiary line-through",
    },
  };
  const pill = map[status] ?? { label: status, className: "bg-bg-elevated text-text-secondary" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.className}`}
    >
      {pill.label}
    </span>
  );
}

function AuditLogTimeline({ entries }: { entries: AdminInvoiceAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <div>
        <h4 className="mb-1 text-sm font-medium text-text-secondary">Audit log</h4>
        <p className="text-xs text-text-tertiary">Bez záznamů.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium text-text-secondary">Audit log</h4>
      <ol className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-md border border-border bg-bg px-3 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">
                {EVENT_LABEL[entry.event] ?? entry.event}
              </span>
              <span className="text-text-tertiary">{formatLocalDateTime(entry.created_at)}</span>
            </div>
            {Object.keys(entry.payload).length > 0 ? (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-text-tertiary">
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatLocalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
