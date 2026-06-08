import { RefreshCcw, Search } from "lucide-react";
import { useEffect, useRef } from "react";

import { useLookupRegistry } from "@/app/companies/useLookupRegistry";
import { ApiError } from "@/lib/api";
import { testIds } from "@/lib/testids";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

import type { BillingFormState, BillingKind } from "./orgBillingForm";

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
 * Shared, fully-controlled billing form used by every surface that collects
 * a customer's tax-invoice details (settings, onboarding, checkout). The
 * markup + IČO→ARES autofill is ported from `InvoiceDetailsCard`, but the
 * field values live entirely in the `value` prop and every edit flows out
 * through `onChange` — there is no internal field state.
 *
 * "Firma" (business) collects IČO / DIČ / legal form; "Soukromá osoba"
 * (individual) drops those and keeps only a name + address. Both modes
 * share the address block and billing e-mail.
 *
 * Pass `savedIco` = the org's stored IČO so hydration doesn't re-trigger
 * ARES; only user-typed changes (IČO that differs from `savedIco`) do.
 */
export function OrgBillingFields({
  value,
  onChange,
  orgName,
  savedIco = "",
}: {
  value: BillingFormState;
  onChange: (next: BillingFormState) => void;
  orgName: string;
  savedIco?: string;
}) {
  // The IČO whose ARES result already populated the form. Seeded from
  // `savedIco` so a hydrated server IČO is treated as "already filled"
  // and does not auto-fire ARES on mount, preventing clobber of any
  // custom invoice name. Read in the effect's condition so the loop
  // can't re-fire even if `onChange`/`value` identity churns.
  const lastFilledIcoRef = useRef<string>(savedIco ?? "");

  const debouncedIco = useDebouncedValue(value.ico, 250);
  const icoQuery = /^\d{8}$/.test(debouncedIco) ? debouncedIco : "";
  // Only fire for a *new* 8-digit IČO the user just typed — one that
  // differs from both the server's saved value and the last ARES-filled
  // value. This mirrors the guard in InvoiceDetailsCard.
  const icoChanged = !!icoQuery && icoQuery !== (savedIco ?? "") && icoQuery !== lastFilledIcoRef.current;

  const lookup = useLookupRegistry({
    country: "CZ",
    number: icoQuery,
    enabled: icoChanged,
  });

  useEffect(() => {
    if (
      lookup.data &&
      lookup.data.ico === value.ico &&
      lastFilledIcoRef.current !== lookup.data.ico
    ) {
      lastFilledIcoRef.current = lookup.data.ico;
      onChange({
        ...value,
        ico: lookup.data.ico,
        billing_name: lookup.data.name,
        dic: lookup.data.dic ?? value.dic,
        legal_form: lookup.data.legal_form ?? value.legal_form,
        address_street: lookup.data.address_street ?? value.address_street,
        address_city: lookup.data.address_city ?? value.address_city,
        address_zip: lookup.data.address_zip ?? value.address_zip,
      });
    }
  }, [lookup.data, value, onChange]);

  function setKind(kind: BillingKind) {
    onChange({ ...value, kind });
  }

  function onIcoChange(next: string) {
    // Strip non-digits so paste of "270 824 40" or "CZ27082440" still
    // resolves to a clean 8-digit IČO.
    onChange({ ...value, ico: next.replace(/\D/g, "").slice(0, 8) });
  }

  const isBusiness = value.kind === "business";

  const lookupErrorMessage = lookup.isError
    ? describeLookupError(lookup.error, debouncedIco)
    : null;
  const icoLength = value.ico.replace(/\D/g, "").length;
  const lookupState: "idle" | "typing" | "loading" | "success" | "not_found" | "error" =
    !icoChanged
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

  const inputClass =
    "mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none";
  const monoInputClass =
    "mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none";

  return (
    <div className="space-y-5">
      {/* Kind toggle */}
      <div className="inline-flex rounded-md border border-border bg-surface-overlay p-0.5">
        <button
          type="button"
          data-testid={testIds.billing.kindBusiness}
          aria-pressed={isBusiness}
          onClick={() => setKind("business")}
          className={`inline-flex h-9 items-center justify-center rounded px-4 text-sm font-medium transition-colors duration-fast ${
            isBusiness
              ? "bg-accent text-text-on-accent"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Firma
        </button>
        <button
          type="button"
          data-testid={testIds.billing.kindIndividual}
          aria-pressed={!isBusiness}
          onClick={() => setKind("individual")}
          className={`inline-flex h-9 items-center justify-center rounded px-4 text-sm font-medium transition-colors duration-fast ${
            !isBusiness
              ? "bg-accent text-text-on-accent"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          Soukromá osoba
        </button>
      </div>

      {isBusiness ? (
        <>
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
              data-testid={testIds.billing.ico}
              value={value.ico}
              onChange={(e) => onIcoChange(e.target.value)}
              placeholder="27082440"
              className={monoInputClass}
            />
            {lookupState === "idle" && value.ico ? (
              <p className="mt-2 text-xs text-text-tertiary">
                Uložené IČO — pole níže můžete upravit, nebo zadejte jiné IČO pro načtení z ARES.
              </p>
            ) : null}
            {lookupState === "idle" && !value.ico ? (
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
              <p className="mt-2 text-xs text-success">
                Údaje doplněny z ARES — můžete je upravit.
              </p>
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
              data-testid={testIds.billing.billingName}
              value={value.billing_name}
              onChange={(e) => onChange({ ...value, billing_name: e.target.value })}
              placeholder={orgName}
              className={inputClass}
            />
            <span className="mt-2 block text-xs text-text-tertiary">
              Pokud necháte prázdné, fakturujeme na &bdquo;{orgName}&ldquo;.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">DIČ</span>
              <input
                type="text"
                autoComplete="off"
                value={value.dic}
                onChange={(e) => onChange({ ...value, dic: e.target.value })}
                className={monoInputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">Právní forma</span>
              <input
                type="text"
                value={value.legal_form}
                onChange={(e) => onChange({ ...value, legal_form: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
        </>
      ) : (
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Jméno a příjmení</span>
          <input
            type="text"
            autoComplete="name"
            data-testid={testIds.billing.billingName}
            value={value.billing_name}
            onChange={(e) => onChange({ ...value, billing_name: e.target.value })}
            placeholder={orgName}
            className={inputClass}
          />
        </label>
      )}

      {/* Address block (both modes) */}
      <label className="block">
        <span className="text-xs font-medium text-text-secondary">Ulice</span>
        <input
          type="text"
          autoComplete="street-address"
          data-testid={testIds.billing.addressStreet}
          value={value.address_street}
          onChange={(e) => onChange({ ...value, address_street: e.target.value })}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">Město</span>
          <input
            type="text"
            autoComplete="address-level2"
            data-testid={testIds.billing.addressCity}
            value={value.address_city}
            onChange={(e) => onChange({ ...value, address_city: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-text-secondary">PSČ</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            data-testid={testIds.billing.addressZip}
            value={value.address_zip}
            onChange={(e) => onChange({ ...value, address_zip: e.target.value })}
            className={monoInputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-text-secondary">Fakturační e-mail</span>
        <input
          type="email"
          autoComplete="email"
          value={value.billing_email}
          onChange={(e) => onChange({ ...value, billing_email: e.target.value })}
          placeholder="faktury@example.cz"
          className={inputClass}
        />
        <span className="mt-2 block text-xs text-text-tertiary">
          Na tuto adresu budeme posílat daňové doklady. Pokud necháte prázdné, použijeme váš
          přihlašovací e-mail.
        </span>
      </label>
    </div>
  );
}
