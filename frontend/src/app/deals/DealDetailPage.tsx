import { ArrowLeft, Check, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useMarkDealLost, useMarkDealWon } from "@/app/deals/useDealActions";
import { useDeal } from "@/app/deals/useDeals";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { usePageTitle } from "@/lib/usePageTitle";

const LOST_REASONS = [
  "Cena",
  "Konkurence",
  "Nevhodný čas",
  "Rozpočet",
  "Nedosaženo dohody",
  "Jiný",
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3">
      <dt className="text-sm text-text-tertiary">{label}</dt>
      <dd className="col-span-2 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function MarkLostDialog({
  open,
  onClose,
  onConfirm,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState(LOST_REASONS[0]);
  const [custom, setCustom] = useState("");

  if (!open) return null;

  const finalReason = reason === "Jiný" ? custom.trim() : reason;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-lost-title"
      className="bg-bg/80 fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (finalReason) onConfirm(finalReason);
        }}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="mark-lost-title" className="text-xl font-semibold">
          Označit jako prohraný
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Vyberte hlavní důvod, abychom mohli sestavit report ztracených obchodů.
        </p>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Důvod</legend>
          {LOST_REASONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="lost-reason"
                value={opt}
                checked={reason === opt}
                onChange={() => setReason(opt)}
              />
              {opt}
            </label>
          ))}
        </fieldset>
        {reason === "Jiný" ? (
          <label className="mt-3 block">
            <span className="text-xs font-medium text-text-secondary">Vlastní důvod</span>
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              required
              maxLength={200}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        ) : null}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            Zrušit
          </button>
          <button
            type="submit"
            disabled={pending || !finalReason}
            className="inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const { data: deal, isPending, isError } = useDeal(dealId);
  const { data: user } = useCurrentUser();
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  usePageTitle(deal?.name ?? "Detail obchodu");

  const markWon = useMarkDealWon(dealId);
  const markLost = useMarkDealLost(dealId);

  const locale = user?.organization.locale ?? "cs-CZ";
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "long" }), [locale]);

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  if (isError || !deal) {
    return (
      <div className="p-8">
        <Link
          to="/app/deals"
          className="mb-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={16} strokeWidth={1.75} /> Zpět na obchody
        </Link>
        <p className="mt-4 text-sm text-danger" role="alert">
          Obchod se nepodařilo načíst.
        </p>
      </div>
    );
  }

  const moneyFmt = new Intl.NumberFormat(locale, { style: "currency", currency: deal.currency });
  const value = Number(deal.value);
  const isClosed = !!deal.closed_at;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/app/deals"
        className="mb-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.75} /> Zpět na obchody
      </Link>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{deal.name}</h1>
          <p className="mt-1 font-mono text-lg tabular-nums text-text-primary">
            {Number.isNaN(value) ? `${deal.value} ${deal.currency}` : moneyFmt.format(value)}
          </p>
        </div>
        {!isClosed ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => markWon.mutate()}
              disabled={markWon.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-brand-accent px-5 text-sm font-semibold text-text-on-brand-accent transition-colors duration-fast hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Check size={16} strokeWidth={1.75} /> Označit jako vyhráno
            </button>
            <button
              type="button"
              onClick={() => setLostDialogOpen(true)}
              disabled={markLost.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
            >
              <X size={16} strokeWidth={1.75} /> Označit jako prohráno
            </button>
          </div>
        ) : null}
      </header>

      <section className="rounded-lg border border-border bg-surface">
        <dl className="divide-y divide-border-subtle px-6">
          <Field label="Stav">
            {deal.closed_at ? (
              deal.lost_reason ? (
                <span className="inline-flex items-center rounded-full bg-danger-subtle px-3 py-1 text-xs font-medium text-danger">
                  Prohráno · {deal.lost_reason}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-3 py-1 text-xs font-medium text-success">
                  <Check size={12} strokeWidth={2} aria-hidden /> Vyhráno
                </span>
              )
            ) : (
              <span className="inline-flex items-center rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent">
                Otevřeno
              </span>
            )}
          </Field>
          <Field label="Firma">
            <Link
              to={`/app/companies/${deal.company_id}`}
              className="text-accent hover:text-accent-hover"
            >
              Přejít na firmu
            </Link>
          </Field>
          <Field label="Očekávané uzavření">
            {deal.expected_close_date ? dateFmt.format(new Date(deal.expected_close_date)) : "—"}
          </Field>
          <Field label="Pravděpodobnost">
            {deal.probability_override != null ? `${deal.probability_override} %` : "dle fáze"}
          </Field>
          <Field label="Vytvořeno">{dateFmt.format(new Date(deal.created_at))}</Field>
          {deal.closed_at ? (
            <Field label="Uzavřeno">{dateFmt.format(new Date(deal.closed_at))}</Field>
          ) : null}
        </dl>
      </section>

      <MarkLostDialog
        open={lostDialogOpen}
        onClose={() => setLostDialogOpen(false)}
        pending={markLost.isPending}
        onConfirm={(reason) => {
          markLost.mutate({ lost_reason: reason }, { onSuccess: () => setLostDialogOpen(false) });
        }}
      />
    </div>
  );
}
