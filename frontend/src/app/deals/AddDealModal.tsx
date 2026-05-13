import { Building2, Handshake, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useCompanies } from "@/app/companies/useCompanies";
import { useCreateCompany } from "@/app/companies/useCreateCompany";
import { useLookupRegistry } from "@/app/companies/useLookupRegistry";
import { useContacts } from "@/app/contacts/useContacts";
import { useCreateDeal } from "@/app/deals/useCreateDeal";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError } from "@/lib/api";
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

interface NewCompanyDraft {
  ico: string;
  name: string;
  dic: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  legal_form: string;
}

const EMPTY_NEW_COMPANY: NewCompanyDraft = {
  ico: "",
  name: "",
  dic: "",
  address_street: "",
  address_city: "",
  address_zip: "",
  legal_form: "",
};

function describeLookupError(error: unknown, ico: string): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return `IČO ${ico} nebylo v ARES nalezeno. Zkontrolujte zadání nebo pokračujte ručně.`;
    }
    if (error.status === 429) {
      return "Příliš mnoho vyhledávání. Počkejte chvíli a zkuste to znovu.";
    }
    if (error.status === 400) {
      return "IČO není ve správném formátu. Zadejte 8 číslic.";
    }
    return "ARES je momentálně nedostupný. Zkuste to znovu nebo vyplňte ručně.";
  }
  return "Vyhledání selhalo. Zkuste to prosím znovu.";
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
  // Inline "create new firma" sub-form. The salesperson opens it from
  // the search miss state — same IČO + ARES autofill as AddCompanyModal,
  // but inlined so a deal can be created in a single submit.
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompany, setNewCompany] = useState<NewCompanyDraft>(EMPTY_NEW_COMPANY);
  const lastFilledIcoRef = useRef<string | null>(null);
  const createCompany = useCreateCompany();

  useEffect(() => {
    if (open) {
      setForm(buildEmptyForm(initialStageId, stages));
      setCompanySearch("");
      setShowNewCompany(false);
      setNewCompany(EMPTY_NEW_COMPANY);
      lastFilledIcoRef.current = null;
      createDeal.reset();
      createCompany.reset();
    }
    // createDeal / createCompany are stable enough; intentionally omitted
    // to avoid loops on isPending flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStageId, stages]);

  // ARES autofill for the inline new-firma path. Mirrors the logic in
  // AddCompanyModal: debounce, only fire on exactly 8 digits, clear the
  // auto-filled fields when the user edits IČO away from the last hit.
  const debouncedNewIco = useDebouncedValue(newCompany.ico, 250);
  const newIcoQuery = /^\d{8}$/.test(debouncedNewIco) ? debouncedNewIco : "";
  const newCompanyLookup = useLookupRegistry({
    country: "CZ",
    number: newIcoQuery,
    enabled: showNewCompany && !!newIcoQuery,
  });

  useEffect(() => {
    if (!showNewCompany) return;
    if (newCompanyLookup.data && newCompanyLookup.data.ico === newCompany.ico) {
      lastFilledIcoRef.current = newCompanyLookup.data.ico;
      setNewCompany((prev) => ({
        ...prev,
        name: newCompanyLookup.data!.name,
        ico: newCompanyLookup.data!.ico,
        dic: newCompanyLookup.data!.dic ?? prev.dic,
        address_street: newCompanyLookup.data!.address_street ?? prev.address_street,
        address_city: newCompanyLookup.data!.address_city ?? prev.address_city,
        address_zip: newCompanyLookup.data!.address_zip ?? prev.address_zip,
        legal_form: newCompanyLookup.data!.legal_form ?? prev.legal_form,
      }));
      return;
    }
    if (lastFilledIcoRef.current && newCompany.ico !== lastFilledIcoRef.current) {
      lastFilledIcoRef.current = null;
      setNewCompany((prev) => ({ ...EMPTY_NEW_COMPANY, ico: prev.ico }));
    }
  }, [newCompanyLookup.data, newCompany.ico, showNewCompany]);

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

  const newCompanyReady = showNewCompany && !!newCompany.name.trim();
  const canSubmit =
    !!form.name.trim() &&
    !!form.stageId &&
    (!!form.companyId || newCompanyReady);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const valueNumber = form.value.trim() === "" ? 0 : Number(form.value.replace(/\s/g, ""));
    if (Number.isNaN(valueNumber) || valueNumber < 0) return;

    // If the salesperson opened the inline new-firma panel, save the
    // company first so the deal create call has a real company_id. We
    // don't roll the company back if the deal fails — leave it in place
    // and surface a recoverable toast, the salesperson can retry the
    // deal from /app/companies.
    let companyId = form.companyId;
    if (newCompanyReady) {
      try {
        const createdCompany = await createCompany.mutateAsync({
          name: newCompany.name.trim(),
          ico: newCompany.ico.trim() || null,
          dic: newCompany.dic.trim() || null,
          address_street: newCompany.address_street.trim() || null,
          address_city: newCompany.address_city.trim() || null,
          address_zip: newCompany.address_zip.trim() || null,
          legal_form: newCompany.legal_form.trim() || null,
        });
        companyId = createdCompany.id;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          toast.error("Firma s tímto IČO už ve vaší organizaci existuje. Vyberte ji ze seznamu.");
        } else {
          toast.error("Firmu se nepodařilo uložit. Zkuste to znovu.");
        }
        return;
      }
    }

    try {
      const created = await createDeal.mutateAsync({
        name: form.name.trim(),
        company_id: companyId,
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
      if (newCompanyReady) {
        toast.error(
          "Firma byla vytvořena, ale obchod uložit nešel. Zkuste ho přidat z detailu firmy.",
        );
      } else {
        toast.error("Obchod se nepodařilo uložit. Zkuste to znovu.");
      }
    }
  };

  const newIcoLookupErrorMessage = newCompanyLookup.isError
    ? describeLookupError(newCompanyLookup.error, debouncedNewIco)
    : null;
  const newIcoLength = newCompany.ico.replace(/\D/g, "").length;
  const newIcoLookupState:
    | "empty"
    | "typing"
    | "loading"
    | "success"
    | "not_found"
    | "error" = !newCompany.ico
    ? "empty"
    : !newIcoQuery
      ? "typing"
      : newCompanyLookup.isPending
        ? "loading"
        : newCompanyLookup.isError
          ? newCompanyLookup.error instanceof ApiError && newCompanyLookup.error.status === 404
            ? "not_found"
            : "error"
          : "success";

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
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-tertiary">
                <span>Žádná firma neodpovídá hledání.</span>
                {!showNewCompany ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewCompany(true);
                      // Seed nothing — IČO is the only useful prefilling
                      // when the search is a name.
                      setNewCompany(EMPTY_NEW_COMPANY);
                    }}
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                  >
                    <Plus size={12} strokeWidth={1.75} /> Vytvořit přes IČO
                  </button>
                ) : null}
              </div>
            ) : null}
          </label>

          {showNewCompany ? (
            <div className="rounded-md border border-border-subtle bg-surface-overlay p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  <Building2 size={12} strokeWidth={1.75} /> Nová firma
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCompany(false);
                    setNewCompany(EMPTY_NEW_COMPANY);
                    lastFilledIcoRef.current = null;
                  }}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Skrýt
                </button>
              </div>
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">IČO</span>
                  {newIcoLookupState === "typing" || newIcoLookupState === "loading" ? (
                    <span className="font-mono text-xs tabular-nums text-text-tertiary">
                      {newIcoLength} / 8
                    </span>
                  ) : null}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={newCompany.ico}
                  onChange={(e) =>
                    setNewCompany((prev) => ({
                      ...prev,
                      ico: e.target.value.replace(/\D/g, "").slice(0, 8),
                    }))
                  }
                  placeholder="27082440"
                  className="mt-2 block h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
                />
                {newIcoLookupState === "empty" ? (
                  <p className="mt-2 text-xs text-text-tertiary">
                    Zadejte IČO (8 číslic) — automaticky doplníme z ARES.
                  </p>
                ) : null}
                {newIcoLookupState === "loading" ? (
                  <p className="mt-2 text-xs text-text-tertiary" role="status">
                    Hledám v ARES…
                  </p>
                ) : null}
                {newIcoLookupState === "success" ? (
                  <p className="mt-2 text-xs text-success">Údaje doplněny z ARES.</p>
                ) : null}
                {newIcoLookupState === "not_found" && newIcoLookupErrorMessage ? (
                  <p className="mt-2 text-xs text-warning" role="alert">
                    {newIcoLookupErrorMessage}
                  </p>
                ) : null}
                {newIcoLookupState === "error" && newIcoLookupErrorMessage ? (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-danger" role="alert">
                      {newIcoLookupErrorMessage}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        if (newIcoQuery) void newCompanyLookup.refetch();
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      <RefreshCcw size={12} strokeWidth={1.75} /> Zkusit znovu
                    </button>
                  </div>
                ) : null}
              </label>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-text-secondary">Název firmy</span>
                <input
                  type="text"
                  autoComplete="organization"
                  value={newCompany.name}
                  onChange={(e) => setNewCompany((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-2 block h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                  placeholder="Doplní se z ARES, nebo zadejte ručně"
                />
              </label>
              <p className="mt-2 text-xs text-text-tertiary">
                Firmu uložíme společně s obchodem; další detaily můžete doplnit později z detailu
                firmy.
              </p>
            </div>
          ) : null}

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
