import { RefreshCcw, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { useLookupRegistry } from "@/app/companies/useLookupRegistry";
import { ApiError } from "@/lib/api";
import { testIds } from "@/lib/testids";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

import type { BillingFormState, BillingKind } from "./orgBillingForm";

function describeLookupError(t: TFunction<"common">, error: unknown, ico: string): string {
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return t("orgBillingFields.errors.notFound", { ico });
    }
    if (error.status === 429) {
      return t("orgBillingFields.errors.tooMany");
    }
    if (error.status === 400) {
      return t("orgBillingFields.errors.badFormat");
    }
    return t("orgBillingFields.errors.unavailable");
  }
  return t("orgBillingFields.errors.generic");
}

/**
 * Shared, fully-controlled billing form used by every surface that collects
 * a customer's tax-invoice details (settings, onboarding, checkout). The
 * markup + company-ID-to-ARES autofill is ported from `InvoiceDetailsCard`,
 * but the field values live entirely in the `value` prop and every edit
 * flows out through `onChange` — there is no internal field state.
 *
 * Business mode collects the company ID / VAT ID / legal form; individual
 * mode drops those and keeps only a name + address. Both modes share the
 * address block and billing e-mail.
 *
 * Pass `savedIco` = the org's stored company ID so hydration doesn't
 * re-trigger ARES; only user-typed changes (an ID that differs from
 * `savedIco`) do.
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
  const { t } = useTranslation("common");
  // The company ID whose ARES result already populated the form. Seeded
  // from `savedIco` so a hydrated server ID is treated as "already
  // filled" and does not auto-fire ARES on mount, preventing clobber of
  // any custom invoice name. Read in the effect's condition so the loop
  // can't re-fire even if `onChange`/`value` identity churns.
  const lastFilledIcoRef = useRef<string>(savedIco ?? "");

  const debouncedIco = useDebouncedValue(value.ico, 250);
  const icoQuery = /^\d{8}$/.test(debouncedIco) ? debouncedIco : "";
  // Only fire for a *new* 8-digit company ID the user just typed — one
  // that differs from both the server's saved value and the last
  // ARES-filled value. This mirrors the guard in InvoiceDetailsCard.
  const icoChanged =
    !!icoQuery && icoQuery !== (savedIco ?? "") && icoQuery !== lastFilledIcoRef.current;

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
    // resolves to a clean 8-digit company ID.
    onChange({ ...value, ico: next.replace(/\D/g, "").slice(0, 8) });
  }

  const isBusiness = value.kind === "business";

  const lookupErrorMessage = lookup.isError
    ? describeLookupError(t, lookup.error, debouncedIco)
    : null;
  const icoLength = value.ico.replace(/\D/g, "").length;
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
          {t("orgBillingFields.kindBusiness")}
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
          {t("orgBillingFields.kindIndividual")}
        </button>
      </div>

      {isBusiness ? (
        <>
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                {t("orgBillingFields.icoLabel")}
              </span>
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
                {t("orgBillingFields.icoHintSaved")}
              </p>
            ) : null}
            {lookupState === "idle" && !value.ico ? (
              <p className="mt-2 inline-flex items-center gap-1 text-xs text-text-tertiary">
                <Search size={12} strokeWidth={1.75} aria-hidden />
                {t("orgBillingFields.icoHintEmpty")}
              </p>
            ) : null}
            {lookupState === "typing" ? (
              <p className="mt-2 text-xs text-text-tertiary">
                {t("orgBillingFields.icoHintTyping")}
              </p>
            ) : null}
            {lookupState === "loading" ? (
              <p role="status" className="mt-2 text-xs text-text-tertiary">
                {t("orgBillingFields.icoHintLoading")}
              </p>
            ) : null}
            {lookupState === "success" ? (
              <p className="mt-2 text-xs text-success">{t("orgBillingFields.icoHintSuccess")}</p>
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
                  <RefreshCcw size={12} strokeWidth={1.75} /> {t("orgBillingFields.icoRetryCta")}
                </button>
              </div>
            ) : null}
          </label>

          <label className="block">
            <span className="text-xs font-medium text-text-secondary">
              {t("orgBillingFields.billingNameLabel")}
            </span>
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
              {t("orgBillingFields.billingNameHint", { orgName })}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("orgBillingFields.dicLabel")}
              </span>
              <input
                type="text"
                autoComplete="off"
                value={value.dic}
                onChange={(e) => onChange({ ...value, dic: e.target.value })}
                className={monoInputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-text-secondary">
                {t("orgBillingFields.legalFormLabel")}
              </span>
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
          <span className="text-xs font-medium text-text-secondary">
            {t("orgBillingFields.individualNameLabel")}
          </span>
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
        <span className="text-xs font-medium text-text-secondary">
          {t("orgBillingFields.streetLabel")}
        </span>
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
          <span className="text-xs font-medium text-text-secondary">
            {t("orgBillingFields.cityLabel")}
          </span>
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
          <span className="text-xs font-medium text-text-secondary">
            {t("orgBillingFields.zipLabel")}
          </span>
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
        <span className="text-xs font-medium text-text-secondary">
          {t("orgBillingFields.billingEmailLabel")}
        </span>
        <input
          type="email"
          autoComplete="email"
          value={value.billing_email}
          onChange={(e) => onChange({ ...value, billing_email: e.target.value })}
          placeholder="faktury@example.cz"
          className={inputClass}
        />
        <span className="mt-2 block text-xs text-text-tertiary">
          {t("orgBillingFields.billingEmailHint")}
        </span>
      </label>
    </div>
  );
}
