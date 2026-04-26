import { Building2, RefreshCcw } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { useCreateCompany } from "@/app/companies/useCreateCompany";
import { useLookupRegistry } from "@/app/companies/useLookupRegistry";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

interface AddCompanyModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (companyId: string) => void;
}

interface FormState {
  name: string;
  ico: string;
  dic: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  legal_form: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  ico: "",
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

export function AddCompanyModal({ open, onClose, onCreated }: AddCompanyModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
    }
  }, [open]);

  // Auto-trigger the lookup when the IČO is exactly 8 digits, debounced
  // 250ms so a fast paste of "27082440" only fires one request.
  const debouncedIco = useDebouncedValue(form.ico, 250);
  const icoQuery = /^\d{8}$/.test(debouncedIco) ? debouncedIco : "";

  const lookup = useLookupRegistry({ country: "CZ", number: icoQuery, enabled: !!icoQuery });
  const createMutation = useCreateCompany();
  const toast = useToast();

  useEffect(() => {
    if (lookup.data) {
      setForm((prev) => ({
        ...prev,
        name: lookup.data!.name,
        ico: lookup.data!.ico,
        dic: lookup.data!.dic ?? prev.dic,
        address_street: lookup.data!.address_street ?? prev.address_street,
        address_city: lookup.data!.address_city ?? prev.address_city,
        address_zip: lookup.data!.address_zip ?? prev.address_zip,
        legal_form: lookup.data!.legal_form ?? prev.legal_form,
      }));
    }
  }, [lookup.data]);

  if (!open) return null;

  const handleRetry = () => {
    if (icoQuery) {
      void lookup.refetch();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    try {
      const created = await createMutation.mutateAsync({
        name: form.name.trim(),
        ico: form.ico.trim() || null,
        dic: form.dic.trim() || null,
        address_street: form.address_street.trim() || null,
        address_city: form.address_city.trim() || null,
        address_zip: form.address_zip.trim() || null,
        legal_form: form.legal_form.trim() || null,
      });
      toast.success("Firma uložena.");
      onCreated(created.id);
      onClose();
    } catch {
      toast.error("Firmu se nepodařilo uložit. Zkuste to znovu.");
    }
  };

  const lookupErrorMessage = lookup.isError ? describeLookupError(lookup.error, debouncedIco) : null;
  const icoLength = form.ico.replace(/\D/g, "").length;
  const lookupState:
    | "empty"
    | "typing"
    | "loading"
    | "success"
    | "not_found"
    | "error" = !form.ico
    ? "empty"
    : !icoQuery
      ? "typing"
      : lookup.isPending
        ? "loading"
        : lookup.isError
          ? lookup.error instanceof ApiError && lookup.error.status === 404
            ? "not_found"
            : "error"
          : "success";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-company-title"
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
          <Building2 size={20} strokeWidth={1.75} />
        </div>
        <h1 id="add-company-title" className="text-2xl font-semibold">
          Přidat firmu
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Zadejte IČO a údaje se doplní z ARES. Pokud firmu v registru nenajdeme, můžete údaje zadat
          ručně.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">IČO</span>
              {lookupState === "typing" || lookupState === "loading" ? (
                <span className="font-mono text-[11px] tabular-nums text-text-tertiary">
                  {icoLength} / 8
                </span>
              ) : null}
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={form.ico}
              onChange={(e) =>
                // Strip non-digit characters at input time so paste of
                // "270 824 40" or "CZ27082440" still resolves correctly.
                setForm((prev) => ({ ...prev, ico: e.target.value.replace(/\D/g, "").slice(0, 8) }))
              }
              placeholder="27082440"
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
            {lookupState === "empty" ? (
              <p className="mt-2 text-xs text-text-tertiary">
                Zadejte IČO (8 číslic) — automaticky doplníme z ARES.
              </p>
            ) : null}
            {lookupState === "typing" ? (
              <p className="mt-2 text-xs text-text-tertiary">
                Pokračujte ve psaní — po 8 číslicích spustíme vyhledávání.
              </p>
            ) : null}
            {lookupState === "loading" ? (
              <p className="mt-2 text-xs text-text-tertiary" role="status">
                Hledám v ARES…
              </p>
            ) : null}
            {lookupState === "success" ? (
              <p className="mt-2 text-xs text-success">Údaje doplněny z ARES.</p>
            ) : null}
            {lookupState === "not_found" && lookupErrorMessage ? (
              <p className="mt-2 text-xs text-warning" role="alert">
                {lookupErrorMessage}
              </p>
            ) : null}
            {lookupState === "error" && lookupErrorMessage ? (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-xs text-danger" role="alert">
                  {lookupErrorMessage}
                </p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                >
                  <RefreshCcw size={12} strokeWidth={1.75} /> Zkusit znovu
                </button>
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Název firmy</span>
            <input
              type="text"
              autoComplete="organization"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">DIČ</span>
              <input
                type="text"
                autoComplete="off"
                value={form.dic}
                onChange={(e) => setForm((prev) => ({ ...prev, dic: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Právní forma</span>
              <input
                type="text"
                value={form.legal_form}
                onChange={(e) => setForm((prev) => ({ ...prev, legal_form: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Ulice</span>
            <input
              type="text"
              autoComplete="street-address"
              value={form.address_street}
              onChange={(e) => setForm((prev) => ({ ...prev, address_street: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Město</span>
              <input
                type="text"
                autoComplete="address-level2"
                value={form.address_city}
                onChange={(e) => setForm((prev) => ({ ...prev, address_city: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">PSČ</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.address_zip}
                onChange={(e) => setForm((prev) => ({ ...prev, address_zip: e.target.value }))}
                className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
          </div>
        </div>

        {createMutation.isError ? (
          <p
            className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
            role="alert"
          >
            Firmu se nepodařilo uložit. Zkontrolujte údaje a zkuste to znovu.
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
            disabled={createMutation.isPending || !form.name.trim()}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createMutation.isPending ? "Ukládám…" : "Uložit firmu"}
          </button>
        </div>
      </form>
    </div>
  );
}
