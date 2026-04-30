import { ArrowLeft, Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useCompany } from "@/app/companies/useCompany";
import { useContact, useContacts } from "@/app/contacts/useContacts";
import { useMarkDealLost, useMarkDealWon } from "@/app/deals/useDealActions";
import { useDeal, useDeleteDeal, useUpdateDeal } from "@/app/deals/useDeals";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
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

interface EditState {
  name: string;
  value: string;
  expected_close_date: string;
  owner_user_id: string;
  stage_id: string;
  probability_override: string;
  primary_contact_id: string;
}

export function DealDetailPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const { data: deal, isPending, isError } = useDeal(dealId);
  const { data: user } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const { data: board } = usePipelineBoard();
  const { data: company } = useCompany(deal?.company_id);
  const { data: primaryContact } = useContact(deal?.primary_contact_id ?? undefined);
  const { data: companyContactsPage } = useContacts({
    companyId: deal?.company_id,
    limit: 100,
  });
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  usePageTitle(deal?.name ?? "Detail obchodu");

  const markWon = useMarkDealWon(dealId);
  const markLost = useMarkDealLost(dealId);
  const updateDeal = useUpdateDeal(dealId);
  const deleteDeal = useDeleteDeal(dealId);
  const toast = useToast();

  const locale = user?.organization?.locale ?? "cs-CZ";
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
  const orgUsers = (usersPage?.items ?? []).filter((u) => u.is_active);
  const stages = board?.stages ?? [];
  const stage = stages.find((s) => s.id === deal.stage_id);
  const owner = deal.owner_user_id
    ? orgUsers.find((u) => u.id === deal.owner_user_id)?.name ?? "—"
    : "—";
  const companyContacts = companyContactsPage?.items ?? [];

  function startEditing() {
    setEdit({
      name: deal!.name,
      value: deal!.value,
      expected_close_date: deal!.expected_close_date ?? "",
      owner_user_id: deal!.owner_user_id ?? "",
      stage_id: deal!.stage_id,
      probability_override:
        deal!.probability_override != null ? String(deal!.probability_override) : "",
      primary_contact_id: deal!.primary_contact_id ?? "",
    });
    setEditing(true);
  }

  async function handleSave() {
    if (!edit) return;
    const numericValue = edit.value.trim() === "" ? 0 : Number(edit.value.replace(/\s/g, ""));
    if (Number.isNaN(numericValue)) return;
    const probability =
      edit.probability_override.trim() === "" ? null : Number(edit.probability_override);
    if (probability != null && (Number.isNaN(probability) || probability < 0 || probability > 100))
      return;
    try {
      await updateDeal.mutateAsync({
        name: edit.name.trim(),
        value: String(numericValue),
        expected_close_date: edit.expected_close_date || null,
        owner_user_id: edit.owner_user_id || null,
        stage_id: edit.stage_id,
        probability_override: probability,
        primary_contact_id: edit.primary_contact_id || null,
      });
      toast.success("Obchod uložen.");
      setEditing(false);
      setEdit(null);
    } catch {
      toast.error("Obchod se nepodařilo uložit.");
    }
  }

  async function handleReopen() {
    if (!window.confirm("Znovu otevřít tento obchod? Datum uzavření a důvod budou odstraněny."))
      return;
    try {
      await updateDeal.mutateAsync({
        closed_at: null,
        lost_reason: null,
      });
      toast.success("Obchod znovu otevřen.");
    } catch {
      toast.error("Obchod se nepodařilo znovu otevřít.");
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Smazat obchod "${deal!.name}"? Akci nelze vrátit zpět.`)) return;
    try {
      await deleteDeal.mutateAsync();
      toast.success("Obchod smazán.");
      navigate("/app/deals");
    } catch {
      toast.error("Obchod se nepodařilo smazat.");
    }
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {!isClosed ? (
            <>
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
            </>
          ) : (
            <button
              type="button"
              onClick={handleReopen}
              disabled={updateDeal.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
            >
              <RotateCcw size={16} strokeWidth={1.75} /> Znovu otevřít
            </button>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
            >
              <Pencil size={14} strokeWidth={1.75} /> Upravit
            </button>
          ) : null}
          {user?.role === "admin" ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteDeal.isPending}
              aria-label="Smazat obchod"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:opacity-60"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
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
          <Field label="Název">
            {editing && edit ? (
              <input
                type="text"
                value={edit.name}
                onChange={(e) => setEdit((p) => p && { ...p, name: e.target.value })}
                className="block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
              />
            ) : (
              deal.name
            )}
          </Field>
          <Field label="Hodnota">
            {editing && edit ? (
              <input
                type="text"
                inputMode="decimal"
                value={edit.value}
                onChange={(e) => setEdit((p) => p && { ...p, value: e.target.value })}
                className="block h-9 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm tabular-nums focus:border-accent focus:outline-none"
              />
            ) : Number.isNaN(value) ? (
              `${deal.value} ${deal.currency}`
            ) : (
              moneyFmt.format(value)
            )}
          </Field>
          <Field label="Firma">
            <Link
              to={`/app/companies/${deal.company_id}`}
              className="text-accent hover:text-accent-hover"
            >
              {company?.name ?? "Přejít na firmu"}
            </Link>
          </Field>
          <Field label="Vlastník">
            {editing && edit ? (
              <select
                value={edit.owner_user_id}
                onChange={(e) =>
                  setEdit((p) => p && { ...p, owner_user_id: e.target.value })
                }
                className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">Bez vlastníka</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              owner
            )}
          </Field>
          <Field label="Fáze">
            {editing && edit ? (
              <select
                value={edit.stage_id}
                onChange={(e) => setEdit((p) => p && { ...p, stage_id: e.target.value })}
                className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              stage?.name ?? "—"
            )}
          </Field>
          <Field label="Hlavní kontakt">
            {editing && edit ? (
              <select
                value={edit.primary_contact_id}
                onChange={(e) =>
                  setEdit((p) => p && { ...p, primary_contact_id: e.target.value })
                }
                className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
              >
                <option value="">Bez hlavního kontaktu</option>
                {companyContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            ) : primaryContact ? (
              <Link
                to={`/app/contacts/${primaryContact.id}`}
                className="text-accent hover:text-accent-hover"
              >
                {primaryContact.first_name} {primaryContact.last_name}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Očekávané uzavření">
            {editing && edit ? (
              <input
                type="date"
                value={edit.expected_close_date}
                onChange={(e) =>
                  setEdit((p) => p && { ...p, expected_close_date: e.target.value })
                }
                className="block h-9 rounded-md border border-border bg-surface-overlay px-3 text-sm focus:border-accent focus:outline-none"
              />
            ) : deal.expected_close_date ? (
              dateFmt.format(new Date(deal.expected_close_date))
            ) : (
              "—"
            )}
          </Field>
          <Field label="Pravděpodobnost">
            {editing && edit ? (
              <input
                type="number"
                min={0}
                max={100}
                placeholder="dle fáze"
                value={edit.probability_override}
                onChange={(e) =>
                  setEdit((p) => p && { ...p, probability_override: e.target.value })
                }
                className="block h-9 w-32 rounded-md border border-border bg-surface-overlay px-3 text-sm tabular-nums focus:border-accent focus:outline-none"
              />
            ) : deal.probability_override != null ? (
              `${deal.probability_override} %`
            ) : (
              "dle fáze"
            )}
          </Field>
          <Field label="Vytvořeno">{dateFmt.format(new Date(deal.created_at))}</Field>
          {deal.closed_at ? (
            <Field label="Uzavřeno">{dateFmt.format(new Date(deal.closed_at))}</Field>
          ) : null}
        </dl>
      </section>

      {editing ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={updateDeal.isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent disabled:opacity-60"
          >
            {updateDeal.isPending ? "Ukládám…" : "Uložit změny"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setEdit(null);
            }}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary"
          >
            Zrušit
          </button>
        </div>
      ) : null}

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
