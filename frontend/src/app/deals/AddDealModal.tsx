import { Handshake } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { useCompanies } from "@/app/companies/useCompanies";
import { useContacts } from "@/app/contacts/useContacts";
import { useCreateDeal } from "@/app/deals/useCreateDeal";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface PipelineStageOption {
  id: string;
  name: string;
}

interface AddDealModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (dealId: string) => void;
  stages: PipelineStageOption[];
  /** When the user opened the modal from a specific stage column. */
  initialStageId?: string;
}

interface FormState {
  name: string;
  companyId: string;
  ownerId: string;
  primaryContactId: string;
  value: string;
  expectedCloseDate: string;
  stageId: string;
}

function buildEmptyForm(
  initialStageId: string | undefined,
  stages: PipelineStageOption[],
): FormState {
  return {
    name: "",
    companyId: "",
    ownerId: "",
    primaryContactId: "",
    value: "",
    expectedCloseDate: "",
    stageId: initialStageId ?? stages[0]?.id ?? "",
  };
}

export function AddDealModal({
  open,
  onClose,
  onCreated,
  stages,
  initialStageId,
}: AddDealModalProps) {
  const { data: currentUser } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const [companySearch, setCompanySearch] = useState("");
  const debouncedSearch = useDebouncedValue(companySearch, 250);
  const { data: companiesPage } = useCompanies({ limit: 25, search: debouncedSearch });
  const createDeal = useCreateDeal();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() => buildEmptyForm(initialStageId, stages));

  useEffect(() => {
    if (open) {
      setForm(buildEmptyForm(initialStageId, stages));
      setCompanySearch("");
      createDeal.reset();
    }
    // createDeal is stable enough; intentionally not in deps to avoid loops on isPending flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStageId, stages]);

  // Default the owner to the current user once we know who that is.
  useEffect(() => {
    if (open && currentUser && !form.ownerId) {
      setForm((prev) => ({ ...prev, ownerId: currentUser.id }));
    }
  }, [open, currentUser, form.ownerId]);

  const companies = companiesPage?.items ?? [];
  const orgUsers = useMemo(() => (usersPage?.items ?? []).filter((u) => u.is_active), [usersPage]);
  // Once a Firma is picked, fetch that company's contacts for the optional
  // "Hlavní kontakt" picker. Skipped while companyId is empty.
  const { data: contactsPage } = useContacts({
    companyId: form.companyId || undefined,
    limit: 100,
  });
  const companyContacts = contactsPage?.items ?? [];

  // Reset primaryContactId when the company changes — the previously chosen
  // contact almost certainly belonged to a different firma.
  useEffect(() => {
    setForm((prev) => (prev.primaryContactId ? { ...prev, primaryContactId: "" } : prev));
  }, [form.companyId]);

  if (!open) return null;

  const canSubmit = !!form.name.trim() && !!form.companyId && !!form.stageId;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const valueNumber = form.value.trim() === "" ? 0 : Number(form.value.replace(/\s/g, ""));
    if (Number.isNaN(valueNumber) || valueNumber < 0) return;
    try {
      const created = await createDeal.mutateAsync({
        name: form.name.trim(),
        company_id: form.companyId,
        stage_id: form.stageId,
        owner_user_id: form.ownerId || null,
        value: String(valueNumber),
        expected_close_date: form.expectedCloseDate || null,
        currency: null,
        primary_contact_id: form.primaryContactId || null,
        probability_override: null,
      });
      toast.success("Obchod uložen.");
      onCreated?.(created.id);
      onClose();
    } catch {
      toast.error("Obchod se nepodařilo uložit. Zkuste to znovu.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-deal-title"
      className="bg-bg/80 fixed inset-0 z-50 flex items-end justify-center px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-border bg-surface p-6 shadow-lg md:rounded-lg"
      >
        <div
          aria-hidden
          className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Handshake size={20} strokeWidth={1.75} />
        </div>
        <h1 id="add-deal-title" className="text-2xl font-semibold">
          Přidat obchod
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Pojmenujte obchod a přiřaďte ho k firmě a fázi pipeline. Detaily můžete doplnit kdykoliv
          později.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Název obchodu</span>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              placeholder="např. Údržba CRM 2026"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Firma</span>
            <input
              type="text"
              value={companySearch}
              onChange={(e) => {
                setCompanySearch(e.target.value);
                setForm((prev) => ({ ...prev, companyId: "" }));
              }}
              placeholder="Začněte psát název firmy…"
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              autoComplete="off"
            />
            {companySearch && companies.length > 0 ? (
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-border bg-surface">
                {companies.map((company) => (
                  <li key={company.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, companyId: company.id }));
                        setCompanySearch(company.name);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-surface-overlay ${
                        form.companyId === company.id ? "text-accent" : "text-text-primary"
                      }`}
                    >
                      <span className="truncate">{company.name}</span>
                      {company.ico ? (
                        <span className="ml-2 font-mono text-xs text-text-tertiary">
                          {company.ico}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {companySearch && !form.companyId && companies.length === 0 ? (
              <p className="mt-2 text-xs text-text-tertiary">Žádná firma neodpovídá hledání.</p>
            ) : null}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Hodnota</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.value}
                onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm tabular-nums text-text-primary focus:border-accent focus:outline-none"
                placeholder="0"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Očekávané uzavření</span>
              <input
                type="date"
                value={form.expectedCloseDate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, expectedCloseDate: e.target.value }))
                }
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          {form.companyId ? (
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                Hlavní kontakt (volitelné)
              </span>
              <select
                value={form.primaryContactId}
                onChange={(e) => setForm((prev) => ({ ...prev, primaryContactId: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="">— bez kontaktu —</option>
                {companyContacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                    {c.position ? ` · ${c.position}` : ""}
                  </option>
                ))}
              </select>
              {companyContacts.length === 0 ? (
                <span className="mt-1 block text-xs text-text-tertiary">
                  Tato firma zatím nemá kontakty. Můžete je doplnit později z detailu firmy.
                </span>
              ) : null}
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Vlastník</span>
              <select
                value={form.ownerId}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="">Bez vlastníka</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Fáze</span>
              <select
                value={form.stageId}
                onChange={(e) => setForm((prev) => ({ ...prev, stageId: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {createDeal.isError ? (
          <p
            className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
            role="alert"
          >
            Obchod se nepodařilo uložit. Zkontrolujte údaje a zkuste to znovu.
          </p>
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
            disabled={createDeal.isPending || !canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createDeal.isPending ? "Ukládám…" : "Uložit obchod"}
          </button>
        </div>
      </form>
    </div>
  );
}
