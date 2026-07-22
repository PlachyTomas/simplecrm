import { Pencil } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { type ContactOut, type ContactUpdate, useUpdateContact } from "@/app/contacts/useContacts";
import { CompanyCombobox } from "@/components/ui/CompanyCombobox";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";
import { useDismissGuard } from "@/lib/useDismissGuard";
import { useModalDialog } from "@/lib/useModalDialog";

interface EditContactModalProps {
  open: boolean;
  onClose: () => void;
  contact: ContactOut;
  /** Display name of the contact's current company, for the combobox. */
  companyName?: string;
}

interface FormState {
  first_name: string;
  last_name: string;
  position: string;
  email: string;
  phone: string;
  note: string;
}

const TEXT_KEYS = ["first_name", "last_name", "position", "email", "phone", "note"] as const;

function fromContact(contact: ContactOut): FormState {
  return {
    first_name: contact.first_name,
    last_name: contact.last_name,
    position: contact.position ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    note: contact.note ?? "",
  };
}

/** Changed fields only — the PUT is exclude_unset partial; "" clears to null. */
function buildPatch(contact: ContactOut, form: FormState, companyId: string): ContactUpdate {
  const patch: Record<string, string | null> = {};
  for (const key of TEXT_KEYS) {
    const next = form[key].trim() === "" ? null : form[key].trim();
    const prev = contact[key] ?? null;
    if (next !== prev) patch[key] = next;
  }
  const nextCompany = companyId === "" ? null : companyId;
  if (nextCompany !== (contact.company_id ?? null)) patch.company_id = nextCompany;
  return patch as ContactUpdate;
}

const inputCls =
  "mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none";
const labelCls = "text-xs font-medium text-text-secondary";

export function EditContactModal({ open, onClose, contact, companyName }: EditContactModalProps) {
  const { t } = useTranslation("contacts");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const toast = useToast();
  const update = useUpdateContact(contact.id);

  const [form, setForm] = useState<FormState>(() => fromContact(contact));
  const [companyId, setCompanyId] = useState(contact.company_id ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(fromContact(contact));
      setCompanyId(contact.company_id ?? "");
      setError(null);
    }
  }, [open, contact]);

  const patch = buildPatch(contact, form, companyId);
  const dirty = Object.keys(patch).length > 0;
  const { onBackdropClick, nudgeClass } = useDismissGuard(onClose, dirty);

  if (!open) return null;

  const set =
    (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.first_name.trim() === "" || form.last_name.trim() === "") {
      setError(t("editContactModal.firstNameRequired"));
      return;
    }
    try {
      if (dirty) await update.mutateAsync(patch);
      toast.success(t("editContactModal.savedToast"));
      onClose();
    } catch {
      toast.error(t("editContactModal.saveError"));
    }
  }

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-contact-title"
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
        <h1 id="edit-contact-title" className="text-2xl font-semibold">
          {t("editContactModal.title")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{t("editContactModal.subtitle")}</p>

        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{t("addContactModal.firstName")}</span>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={set("first_name")}
                data-testid={testIds.contacts.editModal.firstNameInput}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>{t("addContactModal.lastName")}</span>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={set("last_name")}
                data-testid={testIds.contacts.editModal.lastNameInput}
                className={inputCls}
              />
            </label>
          </div>

          <div className="block">
            <span className={labelCls} id="edit-contact-company-label">
              {t("addContactModal.companyLabel")}
            </span>
            <div className="mt-2">
              <CompanyCombobox
                value={companyId}
                onChange={(id) => setCompanyId(id)}
                initialDisplayName={companyName}
                inputId="edit-contact-company"
              />
            </div>
            <p className="mt-2 text-xs text-text-tertiary">{t("addContactModal.companyHint")}</p>
          </div>

          <label className="block">
            <span className={labelCls}>{t("addContactModal.positionOptional")}</span>
            <input
              type="text"
              value={form.position}
              onChange={set("position")}
              data-testid={testIds.contacts.editModal.positionInput}
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>{t("addContactModal.emailOptional")}</span>
              <input type="email" value={form.email} onChange={set("email")} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>{t("addContactModal.phoneOptional")}</span>
              <input
                type="tel"
                placeholder="123 456 789"
                value={form.phone}
                onChange={set("phone")}
                data-testid={testIds.contacts.editModal.phoneInput}
                className={`${inputCls} font-mono tabular-nums`}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelCls}>{t("editContactModal.noteOptional")}</span>
            <textarea
              rows={3}
              value={form.note}
              onChange={set("note")}
              className="mt-2 block w-full rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
          </label>
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
            data-testid={testIds.contacts.editModal.cancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("editContactModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={update.isPending || !dirty}
            data-testid={testIds.contacts.editModal.submit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {update.isPending ? t("editContactModal.saving") : t("editContactModal.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
