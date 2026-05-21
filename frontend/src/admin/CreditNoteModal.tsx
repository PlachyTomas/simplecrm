import { useMemo, useState } from "react";

import {
  type AdminInvoiceDetail,
  type CreditNoteLineDraft,
  useIssueCreditNote,
} from "@/admin/useAdminInvoices";
import { formatCzkMinor } from "@/components/billing/format";

interface CreditNoteModalProps {
  parent: AdminInvoiceDetail;
  onClose: () => void;
  onIssued: (newInvoiceId: string) => void;
}

export function CreditNoteModal({ parent, onClose, onIssued }: CreditNoteModalProps) {
  const [lines, setLines] = useState<CreditNoteLineDraft[]>(() =>
    parent.lines.map((line) => ({
      description: `Storno: ${line.description}`,
      quantity: line.quantity,
      unit_price_minor: -Math.abs(line.unit_price_minor),
      unit_label: line.unit_label,
      vat_rate_percent: null,
    })),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const issue = useIssueCreditNote(parent.id);

  const creditTotalMinor = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = Number(line.quantity);
        if (!Number.isFinite(qty)) return sum;
        return sum + Math.round(qty * line.unit_price_minor);
      }, 0),
    [lines],
  );

  function updateLine(idx: number, patch: Partial<CreditNoteLineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }

  async function handleSubmit() {
    if (reason.trim().length < 3) {
      setError("Důvod dobropisu je povinný (min. 3 znaky).");
      return;
    }
    setError(null);
    issue.mutate(
      { reason: reason.trim(), lines },
      {
        onSuccess: (data) => onIssued(data.id),
        onError: (err) => setError(extractMessage(err) ?? "Vystavení dobropisu selhalo."),
      },
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-note-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-xl"
      >
        <h2 id="credit-note-title" className="text-lg font-semibold">
          Vystavit dobropis k faktuře {parent.number}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Dobropis odečte částku z původní faktury. Záporné jednotkové ceny jsou předvyplněné.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger/40 bg-bg px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-medium">Položky dobropisu</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-text-tertiary">
                <tr className="border-b border-border">
                  <th className="py-1 text-left">Popis</th>
                  <th className="py-1 text-right">Množství</th>
                  <th className="py-1 text-right">Jed.</th>
                  <th className="py-1 text-right">Cena (Kč, ≤ 0)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-border-subtle">
                    <td className="py-1 pr-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        className="w-full rounded border border-border bg-bg px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        className="w-20 rounded border border-border bg-bg px-2 py-1 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="text"
                        value={line.unit_label ?? ""}
                        onChange={(e) => updateLine(idx, { unit_label: e.target.value || null })}
                        className="w-16 rounded border border-border bg-bg px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="number"
                        step="1"
                        max="0"
                        value={(line.unit_price_minor / 100).toFixed(2)}
                        onChange={(e) =>
                          updateLine(idx, {
                            unit_price_minor: Math.round(Number(e.target.value) * 100),
                          })
                        }
                        className="w-28 rounded border border-border bg-bg px-2 py-1 text-right text-sm tabular-nums"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="credit-reason">
              Důvod dobropisu
            </label>
            <input
              id="credit-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="např. Refund po reklamaci"
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
            />
          </div>

          <p className="rounded-md border border-border bg-bg px-3 py-2 text-sm">
            Dobropis celkem:{" "}
            <span className="font-medium tabular-nums">{formatCzkMinor(creditTotalMinor)}</span>{" "}
            <span className="text-text-tertiary">
              (z původních {formatCzkMinor(-Math.abs(parent.subtotal_minor))})
            </span>
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-bg-elevated rounded-md border border-border bg-bg px-4 py-1.5 text-sm"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={issue.isPending}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {issue.isPending ? "Vystavuji…" : "Vystavit dobropis"}
          </button>
        </div>
      </div>
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
