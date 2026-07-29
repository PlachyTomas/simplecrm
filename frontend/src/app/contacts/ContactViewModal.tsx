import { Building2, Mail, Pencil, Phone, User } from "lucide-react";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { type ContactOut } from "@/app/contacts/useContacts";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

interface ContactViewModalProps {
  open: boolean;
  onClose: () => void;
  contact: ContactOut;
  /** Display name of the contact's company, when the caller already knows it. */
  companyName?: string;
  /** Shown only when the viewer may edit — opens the edit modal in place. */
  onEdit?: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="mt-1 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

/** Placeholder for a field the contact hasn't filled in. */
function Empty() {
  return <span className="text-text-tertiary">—</span>;
}

/**
 * Read-only view of a contact, opened from a list that the user should not be
 * navigated away from (the company detail's Kontakty tab). Deliberately a
 * modal and not a route: leaving the company to read one phone number lost the
 * user their place. Mirrors `EditContactModal`'s shape so the two read as the
 * same object in two modes.
 */
export function ContactViewModal({
  open,
  onClose,
  contact,
  companyName,
  onEdit,
}: ContactViewModalProps) {
  const { t } = useTranslation("contacts");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);

  if (!open) return null;

  const fullName = `${contact.first_name} ${contact.last_name}`.trim();
  const company = contact.company_id ? (companyName ?? contact.company_name) : null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-contact-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg border border-border bg-surface p-6 shadow-lg md:rounded-lg">
        <div
          aria-hidden
          className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <User size={20} strokeWidth={1.75} />
        </div>
        <h1 id="view-contact-title" className="text-2xl font-semibold">
          {fullName}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {contact.position ?? t("viewContactModal.noPosition")}
        </p>

        <dl className="mt-6 space-y-5">
          <Field label={t("addContactModal.companyLabel")}>
            {company ? (
              <span className="inline-flex items-center gap-2">
                <Building2
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden
                  className="shrink-0 text-text-tertiary"
                />
                {company}
              </span>
            ) : (
              <Empty />
            )}
          </Field>

          {/* Email gets its own row: paired with the phone in a half-width
              column, a normal address broke mid-word. */}
          <Field label={t("viewContactModal.email")}>
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-2 break-words text-accent hover:text-accent-hover"
              >
                <Mail size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                {contact.email}
              </a>
            ) : (
              <Empty />
            )}
          </Field>

          <Field label={t("viewContactModal.phone")}>
            {contact.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-2 font-mono tabular-nums text-accent hover:text-accent-hover"
              >
                <Phone size={14} strokeWidth={1.75} aria-hidden className="shrink-0" />
                {contact.phone}
              </a>
            ) : (
              <Empty />
            )}
          </Field>

          <Field label={t("viewContactModal.note")}>
            {contact.note ? <span className="whitespace-pre-wrap">{contact.note}</span> : <Empty />}
          </Field>
        </dl>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            data-testid={testIds.contacts.viewModal.close}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("viewContactModal.close")}
          </button>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              data-testid={testIds.contacts.viewModal.edit}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
            >
              <Pencil size={14} strokeWidth={1.75} aria-hidden />
              {t("viewContactModal.edit")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
