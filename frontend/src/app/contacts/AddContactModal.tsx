import { UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCreateContact } from "@/app/contacts/useCreateContact";
import { CompanyCombobox } from "@/components/ui/CompanyCombobox";
import { useDismissGuard } from "@/lib/useDismissGuard";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contactId: string) => void;
  /** When opened from a Firma context (e.g. Company detail's Kontakty tab),
   * pre-select that company and hide the picker. */
  forCompanyId?: string;
}

interface Form {
  first_name: string;
  last_name: string;
  company_id: string;
  email: string;
  phone: string;
  position: string;
}

const EMPTY: Form = {
  first_name: "",
  last_name: "",
  company_id: "",
  email: "",
  phone: "",
  position: "",
};

export function AddContactModal({ open, onClose, onCreated, forCompanyId }: AddContactModalProps) {
  const { t } = useTranslation("contacts");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const mutation = useCreateContact();

  // The preset company (opened from a company page) isn't the user's typing;
  // a company they picked themselves is.
  const dirty =
    form.first_name.trim() !== "" ||
    form.last_name.trim() !== "" ||
    form.email.trim() !== "" ||
    form.phone.trim() !== "" ||
    form.position.trim() !== "" ||
    form.company_id !== (forCompanyId ?? "");
  const { onBackdropClick, nudgeClass } = useDismissGuard(onClose, dirty);

  useEffect(() => {
    if (open) setForm({ ...EMPTY, company_id: forCompanyId ?? "" });
  }, [open, forCompanyId]);

  if (!open) return null;

  const canSubmit = !!form.first_name.trim() && !!form.last_name.trim() && !!form.company_id;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    try {
      const created = await mutation.mutateAsync({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        company_id: form.company_id,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        position: form.position.trim() || null,
      });
      // Toast here (not at call sites): several origins keep the user where
      // they are after creating, and a silent close reads as "nothing
      // happened" — mirror AddCompanyModal's own createSuccess toast.
      toast.success(t("addContactModal.createSuccess"));
      onCreated(created.id);
      onClose();
    } catch {
      /* mutation.isError surfaces */
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-contact-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={onBackdropClick}
    >
      <form
        onSubmit={onSubmit}
        className={`max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-border bg-surface p-6 shadow-lg md:rounded-lg ${nudgeClass}`}
      >
        <div
          aria-hidden
          className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <UserPlus size={20} strokeWidth={1.75} />
        </div>
        <h1 id="add-contact-title" className="text-2xl font-semibold">
          {t("addContactModal.title")}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{t("addContactModal.subtitle")}</p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("addContactModal.firstName")}
            </span>
            <input
              type="text"
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
              required
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("addContactModal.lastName")}
            </span>
            <input
              type="text"
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
              required
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {!forCompanyId ? (
          <div className="mt-4">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("addContactModal.companyLabel")}
              </span>
              <div className="mt-2">
                <CompanyCombobox
                  value={form.company_id}
                  onChange={(id) => setForm((p) => ({ ...p, company_id: id }))}
                  required
                />
              </div>
              <span className="mt-1 block text-xs text-text-tertiary">
                {t("addContactModal.companyHint")}
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("addContactModal.positionOptional")}
            </span>
            <input
              type="text"
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("addContactModal.emailOptional")}
            </span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("addContactModal.phoneOptional")}
            </span>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {mutation.isError ? (
          <p
            className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {t("addContactModal.saveError")}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("addContactModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending || !canSubmit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? t("addContactModal.saving") : t("addContactModal.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
