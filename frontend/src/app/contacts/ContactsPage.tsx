import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AddContactModal } from "@/app/contacts/AddContactModal";
import { ContactDetailPanel } from "@/app/contacts/ContactDetailPanel";
import { type ContactOut, useContacts } from "@/app/contacts/useContacts";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

function ContactRow({
  contact,
  isActive,
  onSelect,
}: {
  contact: ContactOut;
  isActive: boolean;
  onSelect: () => void;
}) {
  const initials = `${contact.first_name.charAt(0)}${contact.last_name.charAt(0)}`.toUpperCase();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 border-b border-border-subtle px-4 py-3 text-left transition-colors duration-fast",
          isActive ? "bg-accent-subtle" : "hover:bg-surface-overlay",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold",
            isActive ? "bg-accent text-text-on-accent" : "bg-surface-overlay text-text-primary",
          )}
        >
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-medium",
              isActive ? "text-accent" : "text-text-primary",
            )}
          >
            {contact.first_name} {contact.last_name}
          </p>
          {contact.email ? (
            <p className="truncate text-xs text-text-tertiary">{contact.email}</p>
          ) : null}
        </div>
      </button>
    </li>
  );
}

export function ContactsPage() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: contacts, isPending, isError } = useContacts();

  const handleSelect = (id: string) => {
    navigate(`/app/contacts/${id}`);
  };

  const handleCreated = (id: string) => {
    navigate(`/app/contacts/${id}`);
  };

  const items = contacts?.items ?? [];
  const showSplitOnDesktop = true;
  const detailVisibleOnMobile = !!contactId;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <section
        aria-label="Seznam kontaktů"
        className={cn(
          "flex flex-col border-border-subtle md:w-80 md:border-r",
          detailVisibleOnMobile && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <h1 className="text-lg font-semibold">Kontakty</h1>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="Přidat kontakt"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-accent text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            <Plus size={16} strokeWidth={1.75} />
          </button>
        </div>

        {isError ? (
          <div className="px-4 py-6 text-sm text-danger" role="alert">
            Kontakty se nepodařilo načíst.
          </div>
        ) : isPending ? (
          <div className="px-4 py-6 text-sm text-text-tertiary" role="status">
            Načítání…
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Přidejte první kontakt"
            body="Kontakty patří k firmám. Po přidání je uvidíte v levém panelu i na detailu firmy."
            primary={{
              label: "+ Přidat kontakt",
              onClick: () => setModalOpen(true),
            }}
          />
        ) : (
          <ul role="list" className="flex-1 overflow-y-auto">
            {items.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                isActive={contact.id === contactId}
                onSelect={() => handleSelect(contact.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Detail kontaktu"
        className={cn(
          "min-w-0 flex-1 overflow-y-auto",
          showSplitOnDesktop ? "md:block" : "",
          detailVisibleOnMobile ? "block" : "hidden md:block",
        )}
      >
        <ContactDetailPanel contactId={contactId} />
      </section>

      <AddContactModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
