import { Building2, Mail, Phone, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useCompany } from "@/app/companies/useCompany";
import { useContact, useUpdateContact } from "@/app/contacts/useContacts";
import { CompanyCombobox } from "@/components/ui/CompanyCombobox";
import { useToast } from "@/lib/toast";

interface ContactDetailPanelProps {
  contactId: string | undefined;
}

export function ContactDetailPanel({ contactId }: ContactDetailPanelProps) {
  const { data: contact, isPending, isError } = useContact(contactId);
  const { data: company } = useCompany(contact?.company_id ?? undefined);
  const updateContact = useUpdateContact(contactId);
  const toast = useToast();
  const [editingCompany, setEditingCompany] = useState(false);
  const [pendingCompanyId, setPendingCompanyId] = useState("");

  if (!contactId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-text-tertiary">
        <div
          aria-hidden
          className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Users size={24} strokeWidth={1.75} />
        </div>
        <p className="text-sm">Vyberte kontakt ze seznamu.</p>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="p-8 text-sm text-danger" role="alert">
        Kontakt se nepodařilo načíst.
      </div>
    );
  }

  const fullName = `${contact.first_name} ${contact.last_name}`.trim();

  async function handleAssignCompany() {
    if (!pendingCompanyId) return;
    try {
      await updateContact.mutateAsync({ company_id: pendingCompanyId });
      setEditingCompany(false);
      setPendingCompanyId("");
    } catch {
      toast.error("Firmu se nepodařilo přiřadit ke kontaktu.");
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex items-center gap-4">
        <span
          aria-hidden
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-overlay text-lg font-semibold text-text-primary"
        >
          {fullName.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h2 className="text-xl font-semibold">{fullName}</h2>
          {contact.position ? (
            <p className="text-sm text-text-secondary">{contact.position}</p>
          ) : null}
        </div>
      </header>

      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Firma
        </h3>
        {contact.company_id && company ? (
          <Link
            to={`/app/companies/${contact.company_id}`}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-primary transition-colors duration-fast hover:border-accent-border hover:text-accent"
          >
            <Building2 size={16} strokeWidth={1.75} className="text-text-tertiary" />
            {company.name}
          </Link>
        ) : (
          <div className="space-y-2 rounded-md border border-border bg-surface px-4 py-3">
            <p className="text-sm text-text-tertiary">Tento kontakt zatím nemá přiřazenou firmu.</p>
            {!editingCompany ? (
              <button
                type="button"
                onClick={() => setEditingCompany(true)}
                className="text-sm font-medium text-accent hover:text-accent-hover"
              >
                + Přiřadit firmu
              </button>
            ) : (
              <div className="space-y-2">
                <CompanyCombobox
                  value={pendingCompanyId}
                  onChange={(id) => setPendingCompanyId(id)}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAssignCompany}
                    disabled={!pendingCompanyId || updateContact.isPending}
                    className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-text-on-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updateContact.isPending ? "Ukládám…" : "Uložit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCompany(false);
                      setPendingCompanyId("");
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-surface-overlay px-3 text-xs font-medium text-text-secondary"
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3">
        {contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-primary transition-colors duration-fast hover:border-accent-border hover:text-accent"
          >
            <Mail size={16} strokeWidth={1.75} className="text-text-tertiary" />
            {contact.email}
          </a>
        ) : null}
        {contact.phone ? (
          <a
            href={`tel:${contact.phone}`}
            className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-primary transition-colors duration-fast hover:border-accent-border hover:text-accent"
          >
            <Phone size={16} strokeWidth={1.75} className="text-text-tertiary" />
            {contact.phone}
          </a>
        ) : null}
        {!contact.email && !contact.phone ? (
          <p className="text-sm text-text-tertiary">
            Ke kontaktu zatím nejsou vyplněny e-mail ani telefon.
          </p>
        ) : null}
      </section>

      {contact.note ? (
        <section className="rounded-md border border-border bg-surface p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            Poznámka
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">{contact.note}</p>
        </section>
      ) : null}
    </div>
  );
}
