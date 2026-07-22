import { Pencil } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CompanyOut } from "@/app/companies/useCompanies";
import { useFreeCompany, useReassignCompany } from "@/app/companies/useCompanyOwnership";
import { type CompanyUpdate, useUpdateCompany } from "@/app/companies/useUpdateCompany";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";
import { useDismissGuard } from "@/lib/useDismissGuard";
import { useModalDialog } from "@/lib/useModalDialog";

interface EditCompanyModalProps {
  open: boolean;
  onClose: () => void;
  company: CompanyOut;
}

/** Detail fields the modal edits, all as input strings ("" = empty). */
interface FormState {
  name: string;
  ico: string;
  dic: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  legal_form: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
}

const FIELD_KEYS = [
  "name",
  "ico",
  "dic",
  "address_street",
  "address_city",
  "address_zip",
  "legal_form",
  "email",
  "phone",
  "website",
  "industry",
] as const;

function fromCompany(company: CompanyOut): FormState {
  return {
    name: company.name,
    ico: company.ico ?? "",
    dic: company.dic ?? "",
    address_street: company.address_street ?? "",
    address_city: company.address_city ?? "",
    address_zip: company.address_zip ?? "",
    legal_form: company.legal_form ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    website: company.website ?? "",
    industry: company.industry ?? "",
  };
}

/**
 * Only fields the user actually changed go into the PUT (the endpoint is
 * exclude_unset partial), so untouched values can't clobber concurrent
 * edits and the activity log gets a precise from→to diff. Empty input
 * means "clear the field" and is sent as null.
 */
function buildPatch(company: CompanyOut, form: FormState): CompanyUpdate {
  const patch: Record<string, string | null> = {};
  for (const key of FIELD_KEYS) {
    const next = form[key].trim() === "" ? null : form[key].trim();
    const prev = company[key] ?? null;
    if (next !== prev) patch[key] = next;
  }
  return patch as CompanyUpdate;
}

const inputCls =
  "mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none";
const labelCls = "text-xs font-medium text-text-secondary";

export function EditCompanyModal({ open, onClose, company }: EditCompanyModalProps) {
  const { t } = useTranslation("companies");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const toast = useToast();
  const update = useUpdateCompany(company.id);
  const reassign = useReassignCompany(company.id);
  const free = useFreeCompany(company.id);
  const { data: currentUser } = useCurrentUser();
  const { data: usersPage } = useOrgUsers();

  const [form, setForm] = useState<FormState>(() => fromCompany(company));
  const [owner, setOwner] = useState(company.owner_user_id ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(fromCompany(company));
      setOwner(company.owner_user_id ?? "");
      setError(null);
    }
  }, [open, company]);

  // Ownership transfers are manager/admin actions server-side (`/reassign`,
  // `/free`) — salespeople edit details only.
  const canManageOwner = currentUser?.role === "admin" || currentUser?.role === "manager";
  const ownerChanged = owner !== (company.owner_user_id ?? "");

  const patch = buildPatch(company, form);
  const dirty = Object.keys(patch).length > 0 || (canManageOwner && ownerChanged);
  const { onBackdropClick, nudgeClass } = useDismissGuard(onClose, dirty);

  if (!open) return null;

  const pending = update.isPending || reassign.isPending || free.isPending;

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.name.trim() === "") {
      setError(t("editCompanyModal.nameRequired"));
      return;
    }
    const ico = form.ico.trim();
    if (ico !== "" && !/^\d{8}$/.test(ico)) {
      setError(t("editCompanyModal.icoBadFormat"));
      return;
    }
    try {
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync(patch);
      }
      if (canManageOwner && ownerChanged) {
        if (owner === "") {
          await free.mutateAsync();
        } else {
          await reassign.mutateAsync({ new_owner_user_id: owner });
        }
      }
      toast.success(t("editCompanyModal.savedToast"));
      onClose();
    } catch {
      toast.error(t("editCompanyModal.saveError"));
    }
  }

  const users = (usersPage?.items ?? []).filter((u) => u.is_active);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-company-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={onBackdropClick}
    >
      <form
        onSubmit={handleSubmit}
        className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-border bg-surface p-6 shadow-lg md:rounded-lg ${nudgeClass}`}
      >
        <div
          aria-hidden
          className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Pencil size={20} strokeWidth={1.75} />
        </div>
        <h1 id="edit-company-title" className="text-2xl font-semibold">
          {t("editCompanyModal.title")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{t("editCompanyModal.subtitle")}</p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className={labelCls}>{t("addCompanyModal.nameLabel")}</span>
            <input
              type="text"
              required
              value={form.name}
              onChange={set("name")}
              data-testid={testIds.companies.editModal.nameInput}
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.icoLabel")}</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="12345678"
                value={form.ico}
                onChange={set("ico")}
                data-testid={testIds.companies.editModal.icoInput}
                className={`${inputCls} font-mono tabular-nums`}
              />
            </label>
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.dicLabel")}</span>
              <input
                type="text"
                autoComplete="off"
                placeholder="CZ12345678"
                value={form.dic}
                onChange={set("dic")}
                className={`${inputCls} font-mono tabular-nums`}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.legalFormLabel")}</span>
              <input
                type="text"
                value={form.legal_form}
                onChange={set("legal_form")}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.industryLabel")}</span>
              <input
                type="text"
                placeholder={t("addCompanyModal.industryPlaceholder")}
                value={form.industry}
                onChange={set("industry")}
                className={inputCls}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>{t("addCompanyModal.streetLabel")}</span>
            <input
              type="text"
              value={form.address_street}
              onChange={set("address_street")}
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.cityLabel")}</span>
              <input
                type="text"
                value={form.address_city}
                onChange={set("address_city")}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.zipLabel")}</span>
              <input
                type="text"
                value={form.address_zip}
                onChange={set("address_zip")}
                className={inputCls}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.emailLabel")}</span>
              <input
                type="email"
                placeholder={t("addCompanyModal.emailPlaceholder")}
                value={form.email}
                onChange={set("email")}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>{t("addCompanyModal.phoneLabel")}</span>
              <input
                type="tel"
                placeholder={t("addCompanyModal.phonePlaceholder")}
                value={form.phone}
                onChange={set("phone")}
                data-testid={testIds.companies.editModal.phoneInput}
                className={`${inputCls} font-mono tabular-nums`}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>{t("addCompanyModal.websiteLabel")}</span>
            <input
              type="url"
              placeholder={t("addCompanyModal.websitePlaceholder")}
              value={form.website}
              onChange={set("website")}
              className={inputCls}
            />
          </label>

          {canManageOwner ? (
            <label className="block">
              <span className={labelCls}>{t("editCompanyModal.ownerLabel")}</span>
              <select
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                data-testid={testIds.companies.editModal.ownerSelect}
                className={inputCls}
              >
                <option value="">{t("editCompanyModal.ownerPool")}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              {ownerChanged && owner !== "" ? (
                <p className="mt-2 text-xs text-warning">{t("editCompanyModal.ownerHint")}</p>
              ) : null}
            </label>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            data-testid={testIds.companies.editModal.cancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("editCompanyModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending || !dirty}
            data-testid={testIds.companies.editModal.submit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? t("editCompanyModal.saving") : t("editCompanyModal.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
