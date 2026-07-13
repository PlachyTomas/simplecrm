import { useMemo, useState } from "react";

import { useAdminOrgList } from "@/admin/hooks";
import { type ManualLineDraft, useIssueManualInvoice } from "@/admin/useAdminInvoices";
import { formatMoneyMinor } from "@/lib/format";

interface ManualInvoiceModalProps {
  onClose: () => void;
  onIssued: (newInvoiceId: string) => void;
}

function newLine(): ManualLineDraft {
  return {
    description: "",
    quantity: "1",
    unit_price_minor: 0,
    unit_label: "ks",
    vat_rate_percent: null,
  };
}

export function ManualInvoiceModal({ onClose, onIssued }: ManualInvoiceModalProps) {
  const [orgQuery, setOrgQuery] = useState("");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLabel, setOrgLabel] = useState<string>("");
  const [lines, setLines] = useState<ManualLineDraft[]>([newLine()]);
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  // Default true: most manual invoices in the bank-transfer flow are
  // billing the org's subscription; refunds / one-offs uncheck it.
  const [linkSubscription, setLinkSubscription] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const issue = useIssueManualInvoice();

  const orgListQuery = useAdminOrgList(orgQuery);

  const subtotalMinor = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = Number(line.quantity);
        if (!Number.isFinite(qty)) return sum;
        return sum + Math.round(qty * line.unit_price_minor);
      }, 0),
    [lines],
  );

  function updateLine(idx: number, patch: Partial<ManualLineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function handleSubmit() {
    if (!orgId) {
      setError("Vyberte zákazníka.");
      return;
    }
    if (lines.some((line) => line.description.trim() === "")) {
      setError("Doplňte popis u všech položek.");
      return;
    }
    setError(null);
    issue.mutate(
      {
        org_id: orgId,
        lines,
        note: note.trim() || null,
        taxable_supply_date: null,
        due_at: dueAt || null,
        link_subscription: linkSubscription,
      },
      {
        onSuccess: (data) => onIssued(data.id),
        onError: (err) => setError(extractMessage(err) ?? "Vystavení faktury selhalo."),
      },
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-invoice-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-xl"
      >
        <h2 id="manual-invoice-title" className="text-lg font-semibold">
          Vystavit fakturu ručně
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Vystaví novou fakturu mimo standardní ComGate flow (refundy, comp orgs, korekce).
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
            <label className="mb-1 block text-sm font-medium" htmlFor="org-search">
              Zákazník
            </label>
            <div className="relative">
              <input
                id="org-search"
                type="search"
                value={orgLabel || orgQuery}
                onChange={(e) => {
                  setOrgQuery(e.target.value);
                  setOrgId(null);
                  setOrgLabel("");
                }}
                placeholder="Hledat organizaci…"
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm focus:border-accent focus:outline-none"
              />
              {!orgId && orgQuery && orgListQuery.data ? (
                <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                  {orgListQuery.data.items.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-text-tertiary">Žádné výsledky.</li>
                  ) : (
                    orgListQuery.data.items.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOrgId(row.id);
                            setOrgLabel(row.name);
                            setOrgQuery("");
                          }}
                          className="hover:bg-bg-elevated block w-full px-3 py-2 text-left text-sm"
                        >
                          {row.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium">Položky</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-text-tertiary">
                <tr className="border-b border-border">
                  <th className="py-1 text-left">Popis</th>
                  <th className="py-1 text-right">Množství</th>
                  <th className="py-1 text-right">Jed.</th>
                  <th className="py-1 text-right">Cena (Kč)</th>
                  <th className="py-1"></th>
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
                        placeholder="Popis"
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
                        min="0"
                        value={(line.unit_price_minor / 100).toFixed(2)}
                        onChange={(e) =>
                          updateLine(idx, {
                            unit_price_minor: Math.round(Number(e.target.value) * 100),
                          })
                        }
                        className="w-24 rounded border border-border bg-bg px-2 py-1 text-right text-sm tabular-nums"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        className="text-xs text-text-tertiary hover:text-danger disabled:opacity-30"
                      >
                        Odebrat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={addLine}
              className="mt-2 text-xs text-accent hover:underline"
            >
              + Přidat položku
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="manual-due-at">
                Splatnost (volitelné)
              </label>
              <input
                id="manual-due-at"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="manual-note">
                Poznámka (volitelné)
              </label>
              <input
                id="manual-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border bg-bg px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={linkSubscription}
              onChange={(e) => setLinkSubscription(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              Propojit s předplatným zákazníka (po označení jako zaplacené prodlouží období)
              <span className="block text-xs text-text-tertiary">
                Odškrtněte u refundů, dobropisů a jednorázových oprav.
              </span>
            </span>
          </label>

          <p className="rounded-md border border-border bg-bg px-3 py-2 text-sm">
            Mezisoučet:{" "}
            <span className="font-medium tabular-nums">
              {formatMoneyMinor(subtotalMinor, "CZK", "cs-CZ")}
            </span>{" "}
            <span className="text-text-tertiary">(DPH se dopočítá podle vašeho nastavení DPH)</span>
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
            {issue.isPending ? "Vystavuji…" : "Vystavit fakturu"}
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
