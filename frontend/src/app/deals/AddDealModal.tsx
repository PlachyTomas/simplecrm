import { Building2, Handshake, Plus, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { useCompanies } from "@/app/companies/useCompanies";
import { useCreateCompany } from "@/app/companies/useCreateCompany";
import { useLookupRegistry } from "@/app/companies/useLookupRegistry";
import { useContacts } from "@/app/contacts/useContacts";
import { useCreateContact } from "@/app/contacts/useCreateContact";
import { useCreateDeal } from "@/app/deals/useCreateDeal";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError } from "@/lib/api";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
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
  /**
   * Preset + lock the deal to this company (opened from the company detail
   * page). Hides the company search and inline new-company subform; the deal
   * is always created against this company.
   */
  lockedCompany?: { id: string; name: string };
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

interface NewContactDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const EMPTY_NEW_CONTACT: NewContactDraft = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
};

function describeLookupError(error: unknown, ico: string, t: TFunction<"deals">): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return t("addDealModal.icoNotFound", { ico });
    }
    if (error.status === 429) {
      return t("addDealModal.icoTooMany");
    }
    if (error.status === 400) {
      return t("addDealModal.icoBadFormat");
    }
    return t("addDealModal.icoAresDown");
  }
  return t("addDealModal.icoGenericError");
}

function buildEmptyForm(
  initialStageId: string | undefined,
  stages: PipelineStageOption[],
  lockedCompanyId?: string,
): FormState {
  return {
    name: "",
    companyId: lockedCompanyId ?? "",
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
  lockedCompany,
}: AddDealModalProps) {
  const { t } = useTranslation("deals");
  const lockedCompanyId = lockedCompany?.id;
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const { data: currentUser } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();
  const [companySearch, setCompanySearch] = useState("");
  const debouncedSearch = useDebouncedValue(companySearch, 250);
  const { data: companiesPage } = useCompanies({ limit: 25, search: debouncedSearch });
  const createDeal = useCreateDeal();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() =>
    buildEmptyForm(initialStageId, stages, lockedCompanyId),
  );
  // Inline "create new firma" sub-form. The salesperson opens it from
  // the search miss state — same company ID + ARES autofill as AddCompanyModal,
  // but inlined so a deal can be created in a single submit.
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompany, setNewCompany] = useState<NewCompanyDraft>(EMPTY_NEW_COMPANY);
  const lastFilledIcoRef = useRef<string | null>(null);
  const createCompany = useCreateCompany();
  // Inline "create contact person" sub-form so a brand-new lead's company
  // *and* its contact are captured in one submit. `showNewContact` only
  // gates the existing-company case (toggle to add a fresh person); for a
  // new company the fields are always shown.
  const [newContact, setNewContact] = useState<NewContactDraft>(EMPTY_NEW_CONTACT);
  const [showNewContact, setShowNewContact] = useState(false);
  const createContact = useCreateContact();

  useEffect(() => {
    if (open) {
      setForm(buildEmptyForm(initialStageId, stages, lockedCompanyId));
      setCompanySearch("");
      setShowNewCompany(false);
      setNewCompany(EMPTY_NEW_COMPANY);
      setNewContact(EMPTY_NEW_CONTACT);
      setShowNewContact(false);
      lastFilledIcoRef.current = null;
      createDeal.reset();
      createCompany.reset();
    }
    // createDeal / createCompany are stable enough; intentionally omitted
    // to avoid loops on isPending flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStageId, stages, lockedCompanyId]);

  // ARES autofill for the inline new-firma path. Mirrors the logic in
  // AddCompanyModal: debounce, only fire on exactly 8 digits, clear the
  // auto-filled fields when the user edits the company ID away from the last hit.
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
  // primary-contact picker. Skipped while companyId is empty.
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
  const hasCompany = !!lockedCompanyId || !!form.companyId || newCompanyReady;
  const hasStage = !!form.stageId;
  // Lead capture stays fast: only a company + stage are required. The deal
  // name defaults to the company name when left blank.
  const canSubmit = hasCompany && hasStage;
  const missingLabels: string[] = [];
  if (!hasCompany) missingLabels.push(t("addDealModal.missingCompany"));
  if (!hasStage) missingLabels.push(t("addDealModal.missingStage"));

  // Show the new-contact fields when there's no existing contact to pick:
  // a brand-new company, an existing company with no contacts yet, or when
  // the user explicitly opts to add a fresh person.
  const useNewContactFields =
    newCompanyReady || (!!form.companyId && (showNewContact || companyContacts.length === 0));
  const newContactProvided =
    useNewContactFields && !!newContact.firstName.trim() && !!newContact.lastName.trim();
  const resolvedCompanyName = lockedCompany
    ? lockedCompany.name.trim()
    : (newCompanyReady ? newCompany.name : companySearch).trim();

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
          toast.error(t("addDealModal.companyDuplicate"));
        } else {
          toast.error(t("addDealModal.companySaveError"));
        }
        return;
      }
    }

    // Create the contact person inline when its name fields are filled, then
    // attach it as the deal's primary contact. A contact failure never blocks
    // the deal — we save the deal without it and warn.
    let primaryContactId = form.primaryContactId || null;
    if (newContactProvided && companyId) {
      try {
        const createdContact = await createContact.mutateAsync({
          company_id: companyId,
          first_name: newContact.firstName.trim(),
          last_name: newContact.lastName.trim(),
          email: newContact.email.trim() || null,
          phone: newContact.phone.trim() || null,
        });
        primaryContactId = createdContact.id;
      } catch {
        toast.error(t("addDealModal.contactSaveError"));
      }
    }

    // Deal name defaults to the company name so a lead can be logged without
    // inventing a title.
    const effectiveName = form.name.trim() || resolvedCompanyName || t("addDealModal.defaultDealName");

    try {
      const created = await createDeal.mutateAsync({
        name: effectiveName,
        company_id: companyId,
        stage_id: form.stageId,
        owner_user_id: form.ownerId || null,
        value: String(valueNumber),
        expected_close_date: form.expectedCloseDate || null,
        currency: null,
        primary_contact_id: primaryContactId,
        probability_override: null,
      });
      toast.success(t("addDealModal.toastSaved"));
      onCreated?.(created.id);
      onClose();
    } catch {
      if (newCompanyReady) {
        toast.error(t("addDealModal.companyCreatedDealFailed"));
      } else {
        toast.error(t("addDealModal.saveError"));
      }
    }
  };

  const newIcoLookupErrorMessage = newCompanyLookup.isError
    ? describeLookupError(newCompanyLookup.error, debouncedNewIco, t)
    : null;
  const newIcoLength = newCompany.ico.replace(/\D/g, "").length;
  const newIcoLookupState: "empty" | "typing" | "loading" | "success" | "not_found" | "error" =
    !newCompany.ico
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
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-deal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
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
          {t("addDealModal.title")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{t("addDealModal.subtitle")}</p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("addDealModal.nameLabel")}
            </span>
            <input
              type="text"
              data-testid={testIds.deals.addModal.nameInput}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              placeholder={t("addDealModal.namePlaceholder")}
            />
          </label>

          {lockedCompany ? (
            <div>
              <span className="text-xs font-medium text-text-secondary">
                {t("addDealModal.companyLabel")}
              </span>
              <div className="mt-2 flex h-10 items-center rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary">
                {lockedCompany.name}
              </div>
            </div>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("addDealModal.companyLabel")} <span className="text-danger">*</span>
              </span>
              <input
                type="text"
                aria-required="true"
                data-testid={testIds.deals.addModal.companyInput}
                value={companySearch}
                onChange={(e) => {
                  setCompanySearch(e.target.value);
                  setForm((prev) => ({ ...prev, companyId: "" }));
                }}
                placeholder={t("addDealModal.companySearchPlaceholder")}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                autoComplete="off"
              />
              {!showNewCompany ? (
                <button
                  type="button"
                  data-testid={testIds.deals.addModal.newCompanyToggle}
                  onClick={() => {
                    setShowNewCompany(true);
                    // Opening the subform always wins over a previously
                    // selected company — clear it so hasCompany/submit
                    // resolve through newCompanyReady, not a stale pick.
                    setForm((prev) => ({ ...prev, companyId: "" }));
                    setNewCompany({ ...EMPTY_NEW_COMPANY, name: companySearch.trim() });
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                >
                  <Plus size={12} strokeWidth={1.75} /> {t("addDealModal.newCompanyToggle")}
                </button>
              ) : null}
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
                  <span>{t("addDealModal.noCompanyMatch")}</span>
                  {!showNewCompany ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCompany(true);
                        // Carry the typed name across so it isn't lost; the company
                        // ID is optional enrichment from there.
                        setNewCompany({ ...EMPTY_NEW_COMPANY, name: companySearch.trim() });
                      }}
                      className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                    >
                      <Plus size={12} strokeWidth={1.75} />{" "}
                      {t("addDealModal.createCompanyButton", { name: companySearch.trim() })}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </label>
          )}

          {showNewCompany ? (
            <div className="rounded-md border border-border-subtle bg-surface-overlay p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                  <Building2 size={12} strokeWidth={1.75} /> {t("addDealModal.newCompanyLabel")}
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
                  {t("addDealModal.hide")}
                </button>
              </div>
              <label className="block">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">
                    {t("addDealModal.icoLabel")}
                  </span>
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
                    {t("addDealModal.icoHintEmpty")}
                  </p>
                ) : null}
                {newIcoLookupState === "loading" ? (
                  <p className="mt-2 text-xs text-text-tertiary" role="status">
                    {t("addDealModal.icoHintLoading")}
                  </p>
                ) : null}
                {newIcoLookupState === "success" ? (
                  <p className="mt-2 text-xs text-success">{t("addDealModal.icoHintSuccess")}</p>
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
                      <RefreshCcw size={12} strokeWidth={1.75} /> {t("addDealModal.icoRetry")}
                    </button>
                  </div>
                ) : null}
              </label>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-text-secondary">
                  {t("addDealModal.companyNameLabel")}
                </span>
                <input
                  type="text"
                  autoComplete="organization"
                  value={newCompany.name}
                  onChange={(e) => setNewCompany((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-2 block h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                  placeholder={t("addDealModal.companyNamePlaceholder")}
                />
              </label>
              <p className="mt-2 text-xs text-text-tertiary">{t("addDealModal.newCompanyHint")}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("addDealModal.valueLabel")}
              </span>
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
              <span className="text-xs font-medium text-text-secondary">
                {t("addDealModal.expectedCloseLabel")}
              </span>
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

          {hasCompany ? (
            <div className="space-y-2">
              <span className="text-xs font-medium text-text-secondary">
                {t("addDealModal.contactSectionLabel")}
              </span>
              {useNewContactFields ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      aria-label={t("addDealModal.contactFirstNameAria")}
                      autoComplete="given-name"
                      value={newContact.firstName}
                      onChange={(e) =>
                        setNewContact((prev) => ({ ...prev, firstName: e.target.value }))
                      }
                      placeholder={t("addDealModal.firstNamePlaceholder")}
                      className="block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      aria-label={t("addDealModal.contactLastNameAria")}
                      autoComplete="family-name"
                      value={newContact.lastName}
                      onChange={(e) =>
                        setNewContact((prev) => ({ ...prev, lastName: e.target.value }))
                      }
                      placeholder={t("addDealModal.lastNamePlaceholder")}
                      className="block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="email"
                      aria-label={t("addDealModal.contactEmailAria")}
                      autoComplete="email"
                      value={newContact.email}
                      onChange={(e) =>
                        setNewContact((prev) => ({ ...prev, email: e.target.value }))
                      }
                      placeholder={t("addDealModal.emailPlaceholder")}
                      className="block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                    />
                    <input
                      type="tel"
                      aria-label={t("addDealModal.contactPhoneAria")}
                      autoComplete="tel"
                      value={newContact.phone}
                      onChange={(e) =>
                        setNewContact((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder={t("addDealModal.phonePlaceholder")}
                      className="block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                    />
                  </div>
                  {!!form.companyId && companyContacts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewContact(false);
                        setNewContact(EMPTY_NEW_CONTACT);
                      }}
                      className="text-xs font-medium text-accent hover:text-accent-hover"
                    >
                      {t("addDealModal.pickExistingContact")}
                    </button>
                  ) : (
                    <p className="text-xs text-text-tertiary">{t("addDealModal.contactHint")}</p>
                  )}
                </>
              ) : (
                <>
                  <select
                    value={form.primaryContactId}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, primaryContactId: e.target.value }))
                    }
                    className="block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
                  >
                    <option value="">{t("addDealModal.noContactOption")}</option>
                    {companyContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                        {c.position ? ` · ${c.position}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewContact(true);
                      setForm((prev) => ({ ...prev, primaryContactId: "" }));
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                  >
                    <Plus size={12} strokeWidth={1.75} /> {t("addDealModal.addNewPerson")}
                  </button>
                </>
              )}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("addDealModal.ownerLabel")}
              </span>
              <select
                value={form.ownerId}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="">{t("addDealModal.noOwnerOption")}</option>
                {orgUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("addDealModal.stageLabel")} <span className="text-danger">*</span>
              </span>
              <select
                value={form.stageId}
                aria-required="true"
                data-testid={testIds.deals.addModal.stageSelect}
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
            {t("addDealModal.createError")}
          </p>
        ) : null}

        {missingLabels.length > 0 ? (
          <p
            id="add-deal-missing"
            data-testid={testIds.deals.addModal.missingSummary}
            className="mt-4 text-xs text-text-tertiary"
            role="status"
          >
            {t("addDealModal.missingSummaryPrefix")}{" "}
            <span className="text-danger">{missingLabels.join(", ")}</span>.
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            data-testid={testIds.deals.addModal.cancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("addDealModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={createDeal.isPending || !canSubmit}
            aria-describedby={missingLabels.length > 0 ? "add-deal-missing" : undefined}
            data-testid={testIds.deals.addModal.submit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createDeal.isPending ? t("addDealModal.saving") : t("addDealModal.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
