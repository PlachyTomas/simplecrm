import { UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useCreateContact } from "@/app/contacts/useCreateContact";

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contactId: string) => void;
}

interface Form {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
}

const EMPTY: Form = { first_name: "", last_name: "", email: "", phone: "", position: "" };

export function AddContactModal({ open, onClose, onCreated }: AddContactModalProps) {
  const [form, setForm] = useState<Form>(EMPTY);
  const mutation = useCreateContact();

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  if (!open) return null;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) return;
    try {
      const created = await mutation.mutateAsync({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        position: form.position.trim() || null,
      });
      onCreated(created.id);
      onClose();
    } catch {
      /* mutation.isError surfaces */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-contact-title"
      className="bg-bg/80 fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <div
          aria-hidden
          className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <UserPlus size={20} strokeWidth={1.75} />
        </div>
        <h1 id="add-contact-title" className="text-2xl font-semibold">
          Přidat kontakt
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Zadejte jméno a případně další kontaktní údaje.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Jméno</span>
            <input
              type="text"
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
              required
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Příjmení</span>
            <input
              type="text"
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
              required
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Pozice (volitelné)</span>
            <input
              type="text"
              value={form.position}
              onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">E-mail (volitelné)</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Telefon (volitelné)</span>
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
            Kontakt se nepodařilo uložit. Zkontrolujte údaje a zkuste to znovu.
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
            disabled={mutation.isPending || !form.first_name.trim() || !form.last_name.trim()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? "Ukládám…" : "Uložit kontakt"}
          </button>
        </div>
      </form>
    </div>
  );
}
