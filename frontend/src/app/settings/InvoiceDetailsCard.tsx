import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, Search } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useLookupRegistry } from "@/app/companies/useLookupRegistry";
import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

interface FormState {
  ico: string;
  dic: string;
  billing_name: string;
  legal_form: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  billing_email: string;
}

const EMPTY_FORM: FormState = {
  ico: "",
  dic: "",
  billing_name: "",
  legal_form: "",
  address_street: "",
  address_city: "",
  address_zip: "",
  billing_email: "",
};

function fromOrg(org: OrganizationOut): FormState {
  return {
    ico: org.ico ?? "",
    dic: org.dic ?? "",
    billing_name: org.billing_name ?? "",
    legal_form: org.legal_form ?? "",
    address_street: org.address_street ?? "",
    address_city: org.address_city ?? "",
    address_zip: org.address_zip ?? "",
    billing_email: org.billing_email ?? "",
  };
}

function describeLookupError(error: unknown, ico: string): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return `IČO ${ico} nebylo v ARES nalezeno. Zkontrolujte zadání nebo vyplňte ručně.`;
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

/**
 * Settings → Organizace card that collects every customer-side field a
 * Czech tax invoice ("daňový doklad") requires: legal name, IČO, DIČ,
 * legal form, address, billing email. Same IČO+ARES autofill pattern as
 * `AddCompanyModal` so admins type 8 digits and the rest pre-fills; each
 * field stays editable in case ARES is missing something.
 *
 * The org's day-to-day `name` is *not* edited here on purpose — it's the
 * workspace label, not the invoice payee. `billing_name` overrides it on
 * invoices when set; when empty we fall back to `name` so existing orgs
 * see no change.
 */
export function InvoiceDetailsCard() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const orgQuery = useQuery<OrganizationOut>({
    queryKey: ["organizations", "current"],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", { token: accessToken }),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Tracks the IČO whose ARES result currently fills the form. When the user
  // edits IČO away from this value, we DON'T clobber the rest — unlike the
  // create-company flow, settings edits are sticky; the user explicitly
  // asked to keep what they entered.
  const lastFilledIcoRef = useRef<string | null>(null);
  // Once we've loaded the org, hydrate the form. Re-runs only when the
  // server's snapshot identity changes (e.g. another tab saved) so local
  // edits aren't reset on every refetch.
  useEffect(() => {
    if (orgQuery.data) {
      setForm(fromOrg(orgQuery.data));
      lastFilledIcoRef.current = orgQuery.data.ico ?? null;
    }
  }, [orgQuery.data]);

  const debouncedIco = useDebouncedValue(form.ico, 250);
  const icoQuery = /^\d{8}$/.test(debouncedIco) ? debouncedIco : "";
  // Don't auto-fire while we're still showing whatever the org already
  // had stored — only kick off when the user has typed a *new* 8-digit
  // value. Otherwise the saved IČO would trigger ARES on every mount.
  const icoChanged = !!icoQuery && icoQuery !== (orgQuery.data?.ico ?? "");

  const lookup = useLookupRegistry({
    country: "CZ",
    number: icoQuery,
    enabled: icoChanged,
  });

  useEffect(() => {
    if (lookup.data && lookup.data.ico === form.ico) {
      lastFilledIcoRef.current = lookup.data.ico;
      setForm((prev) => ({
        ...prev,
        ico: lookup.data!.ico,
        billing_name: lookup.data!.name,
        dic: lookup.data!.dic ?? prev.dic,
        legal_form: lookup.data!.legal_form ?? prev.legal_form,
        address_street: lookup.data!.address_street ?? prev.address_street,
        address_city: lookup.data!.address_city ?? prev.address_city,
        address_zip: lookup.data!.address_zip ?? prev.address_zip,
      }));
    }
  }, [lookup.data, form.ico]);

  const saveMutation = useMutation<OrganizationOut, Error, FormState>({
    mutationFn: (state) =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: {
          // Trim everything; empty strings are sent as null so the
          // backend clears the column rather than storing "".
          ico: state.ico.trim() || null,
          dic: state.dic.trim() || null,
          billing_name: state.billing_name.trim() || null,
          legal_form: state.legal_form.trim() || null,
          address_street: state.address_street.trim() || null,
          address_city: state.address_city.trim() || null,
          address_zip: state.address_zip.trim() || null,
          billing_email: state.billing_email.trim() || null,
        },
      }),
    onSuccess: (data) => {
      qc.setQueryData(["organizations", "current"], data);
      void qc.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Fakturační údaje uloženy.");
    },
    onError: () => {
      toast.error("Uložení se nezdařilo. Zkuste to prosím znovu.");
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveMutation.mutate(form);
  }

  function onIcoChange(value: string) {
    // Strip non-digits at input time so paste of "270 824 40" or
    // "CZ27082440" still resolves to a clean 8-digit IČO.
    setForm((prev) => ({ ...prev, ico: value.replace(/\D/g, "").slice(0, 8) }));
  }

  const lookupErrorMessage = lookup.isError
    ? describeLookupError(lookup.error, debouncedIco)
    : null;
  const icoLength = form.ico.replace(/\D/g, "").length;
  const lookupState: "idle" | "typing" | "loading" | "success" | "not_found" | "error" = !icoChanged
    ? "idle"
    : !icoQuery
      ? "typing"
      : lookup.isPending
        ? "loading"
        : lookup.isError
          ? lookup.error instanceof ApiError && lookup.error.status === 404
            ? "not_found"
            : "error"
          : "success";

  if (orgQuery.isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
        Načítání…
      </section>
    );
  }
  if (orgQuery.isError || !orgQuery.data) {
    return (
      <section
        role="alert"
        className="rounded-lg border border-border bg-surface p-6 text-sm text-danger"
      >
        Načítání fakturačních údajů se nezdařilo.
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="billing-details-card"
      className="rounded-lg border border-border bg-surface p-6"
    >
      <header>
        <h2 className="text-lg font-semibold">Fakturační údaje</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Tyto údaje se objeví na vašich daňových dokladech. Zadejte IČO a zbytek doplníme z ARES —
          každé pole pak můžete upravit.
        </p>
      </header>

      <div className="mt-6 space-y-5">
        <label className="block">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">IČO</span>
            {lookupState === "typing" || lookupState === "loading" ? (
              <span className="font-mono text-xs tabular-nums text-text-tertiary">
                {icoLength} / 8
              </span>
            ) : null}
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.ico}
            onChange={(e) => onIcoChange(e.target.value)}
            placeholder="27082440"
            className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          {lookupState === "idle" && form.ico ? (
            <p className="mt-2 text-xs text-text-tertiary">
              Uložené IČO — pole níže můžete upravit, nebo zadejte jiné IČO pro načtení z ARES.
            </p>
          ) : null}
          {lookupState === "idle" && !form.ico ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-text-tertiary">
              <Search size={12} strokeWidth={1.75} aria-hidden />
              Zadejte IČO (8 číslic) — automaticky doplníme z ARES.
            </p>
          ) : null}
          {lookupState === "typing" ? (
            <p className="mt-2 text-xs text-text-tertiary">
              Pokračujte ve psaní — po 8 číslicích spustíme vyhledávání.
            </p>
          ) : null}
          {lookupState === "loading" ? (
            <p role="status" className="mt-2 text-xs text-text-tertiary">
              Hledám v ARES…
            </p>
          ) : null}
          {lookupState === "success" ? (
            <p className="mt-2 text-xs text-success">Údaje doplněny z ARES — můžete je upravit.</p>
          ) : null}
          {lookupState === "not_found" && lookupErrorMessage ? (
            <p role="alert" className="mt-2 text-xs text-warning">
              {lookupErrorMessage}
            </p>
          ) : null}
          {lookupState === "error" && lookupErrorMessage ? (
            <div className="mt-2 flex items-center gap-2">
              <p role="alert" className="text-xs text-danger">
                {lookupErrorMessage}
              </p>
              <button
                type="button"
                onClick={() => void lookup.refetch()}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                <RefreshCcw size={12} strokeWidth={1.75} /> Zkusit znovu
              </button>
            </div>
          ) : null}
        </label>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Název pro fakturu</span>
          <input
            type="text"
            autoComplete="organization"
            value={form.billing_name}
            onChange={(e) => setForm((prev) => ({ ...prev, billing_name: e.target.value }))}
            placeholder={orgQuery.data.name}
            className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          <span className="mt-2 block text-xs text-text-tertiary">
            Pokud necháte prázdné, fakturujeme na &bdquo;{orgQuery.data.name}&ldquo;.
          </span>
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
              autoComplete="postal-code"
              value={form.address_zip}
              onChange={(e) => setForm((prev) => ({ ...prev, address_zip: e.target.value }))}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Fakturační e-mail</span>
          <input
            type="email"
            autoComplete="email"
            value={form.billing_email}
            onChange={(e) => setForm((prev) => ({ ...prev, billing_email: e.target.value }))}
            placeholder="faktury@example.cz"
            className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          />
          <span className="mt-2 block text-xs text-text-tertiary">
            Na tuto adresu budeme posílat daňové doklady. Pokud necháte prázdné, použijeme váš
            přihlašovací e-mail.
          </span>
        </label>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
        >
          {saveMutation.isPending ? "Ukládám…" : "Uložit fakturační údaje"}
        </button>
      </div>
    </form>
  );
}
