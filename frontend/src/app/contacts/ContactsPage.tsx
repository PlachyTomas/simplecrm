import { Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { AddContactModal } from "@/app/contacts/AddContactModal";
import { ContactDetailPanel } from "@/app/contacts/ContactDetailPanel";
import { type ContactOut, useContacts } from "@/app/contacts/useContacts";
import { EmptyState } from "@/components/ui/empty-state";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { usePageTitle } from "@/lib/usePageTitle";
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
          // 2px indigo seam on the active row's left edge — brief §5 selected-row pattern.
          "flex w-full items-center gap-3 border-b border-l-2 border-border-subtle border-l-transparent px-4 py-3 text-left transition-colors duration-fast",
          isActive ? "border-l-accent bg-accent-subtle" : "hover:bg-surface-overlay",
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
  const { t } = useTranslation("contacts");
  usePageTitle(t("contactsPage.pageTitle"));
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 250);

  const { data: contacts, isPending, isError } = useContacts();

  const handleSelect = (id: string) => {
    navigate(`/app/contacts/${id}`);
  };

  const handleCreated = (id: string) => {
    navigate(`/app/contacts/${id}`);
  };

  // Memoize allItems so the dependent filter useMemo's dependencies are
  // stable across re-renders that don't change the list contents.
  const allItems = useMemo(() => contacts?.items ?? [], [contacts]);
  const items = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((c) => {
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      return (
        name.includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [allItems, debouncedSearch]);
  const showSplitOnDesktop = true;
  const detailVisibleOnMobile = !!contactId;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
      <section
        aria-label={t("contactsPage.listAriaLabel")}
        className={cn(
          "flex flex-col border-border-subtle md:w-80 md:border-r",
          detailVisibleOnMobile && "hidden md:flex",
        )}
      >
        <div className="space-y-3 border-b border-border-subtle px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">{t("contactsPage.pageTitle")}</h1>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden /> {t("contactsPage.addButton")}
            </button>
          </div>
          {allItems.length > 0 ? (
            <label className="relative block">
              <span className="sr-only">{t("contactsPage.searchLabel")}</span>
              <Search
                size={14}
                strokeWidth={1.75}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t("contactsPage.searchPlaceholder")}
                className="h-9 w-full rounded-md border border-border bg-surface-overlay pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
              />
            </label>
          ) : null}
        </div>

        {isError ? (
          <div className="px-4 py-6 text-sm text-danger" role="alert">
            {t("contactsPage.loadError")}
          </div>
        ) : isPending ? (
          <div className="px-4 py-6 text-sm text-text-tertiary" role="status">
            {t("contactsPage.loading")}
          </div>
        ) : allItems.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("contactsPage.emptyState.title")}
            body={t("contactsPage.emptyState.body")}
            primary={{
              label: t("contactsPage.emptyState.cta"),
              onClick: () => setModalOpen(true),
            }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Users}
            tone="filtered"
            title={t("contactsPage.emptyFiltered.title")}
            body={t("contactsPage.emptyFiltered.body")}
            primary={{
              label: t("contactsPage.emptyFiltered.cta"),
              onClick: () => setSearchInput(""),
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
        aria-label={t("contactsPage.detailAriaLabel")}
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
