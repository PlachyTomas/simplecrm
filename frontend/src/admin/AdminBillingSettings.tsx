import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";

import { useAdminBillingSettings } from "@/admin/hooks";
import { useAuth } from "@/auth/useAuth";
import { ApiError, apiFetch } from "@/lib/api";

interface FormState {
  is_vat_payer: boolean;
  vat_rate_percent: string;
  seller_iban: string;
  seller_ico: string;
  contact_email: string;
}

const DEFAULT_FORM: FormState = {
  is_vat_payer: false,
  vat_rate_percent: "21.00",
  seller_iban: "",
  seller_ico: "",
  contact_email: "",
};

export function AdminBillingSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  const { data, isPending } = useAdminBillingSettings();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the form from the fetched settings the first time they arrive.
  useEffect(() => {
    if (!data) return;
    setForm({
      is_vat_payer: data.is_vat_payer,
      vat_rate_percent: String(data.vat_rate_percent),
      seller_iban: data.seller_iban ?? "",
      seller_ico: data.seller_ico ?? "",
      contact_email: data.contact_email,
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        is_vat_payer: form.is_vat_payer,
        vat_rate_percent: form.vat_rate_percent,
        contact_email: form.contact_email,
      };
      // Only send IBAN/IČO when set; backend types them as nullable so
      // empty strings would be coerced to "" rather than null.
      if (form.seller_iban) body.seller_iban = form.seller_iban;
      if (form.seller_ico) body.seller_ico = form.seller_ico;
      return apiFetch("/api/v1/admin/billing-settings", {
        method: "PUT",
        token: accessToken,
        body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "billing-settings"] });
      // Also invalidate the public read so the marketing /cenik footer
      // picks up the new DPH state without a hard reload.
      queryClient.invalidateQueries({ queryKey: ["billing-settings", "public"] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    },
    onError: (err) => {
      setError(
        err instanceof ApiError
          ? "Uložení selhalo. Zkontrolujte hodnoty a zkuste to znovu."
          : "Něco se pokazilo. Zkuste to prosím znovu.",
      );
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  if (isPending) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6 text-sm text-text-tertiary">
        Načítání…
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-2xl space-y-6 rounded-lg border border-border bg-surface p-6"
    >
      <header>
        <h2 className="text-lg font-semibold">Fakturační nastavení</h2>
        <p className="mt-1 text-sm text-text-tertiary">
          Tato nastavení ovlivňují všechny ceny v aplikaci a faktury, které posíláme zákazníkům.
        </p>
      </header>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={form.is_vat_payer}
          onChange={(e) => setForm((s) => ({ ...s, is_vat_payer: e.target.checked }))}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          <span className="font-medium text-text-primary">Jsem plátce DPH</span>
          <span className="mt-1 block text-text-tertiary">
            Při zapnutí všechny ceny v aplikaci přepočtou s DPH a fakturační doklady obsahují DPH
            řádek.
          </span>
        </span>
      </label>

      <label className="block text-sm font-medium">
        Sazba DPH (%)
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={form.vat_rate_percent}
          onChange={(e) => setForm((s) => ({ ...s, vat_rate_percent: e.target.value }))}
          className="mt-1 block h-10 w-32 rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <label className="block text-sm font-medium">
        IBAN
        <input
          type="text"
          maxLength={34}
          value={form.seller_iban}
          onChange={(e) => setForm((s) => ({ ...s, seller_iban: e.target.value }))}
          placeholder="CZ65 0800 0000 1920 0014 5399"
          className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <label className="block text-sm font-medium">
        IČO
        <input
          type="text"
          maxLength={8}
          value={form.seller_ico}
          onChange={(e) => setForm((s) => ({ ...s, seller_ico: e.target.value }))}
          className="mt-1 block h-10 w-32 rounded-md border border-border bg-bg px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      <label className="block text-sm font-medium">
        Kontaktní e-mail
        <input
          type="email"
          maxLength={120}
          value={form.contact_email}
          onChange={(e) => setForm((s) => ({ ...s, contact_email: e.target.value }))}
          className="mt-1 block h-10 w-full rounded-md border border-border bg-bg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {mutation.isPending ? "Ukládáme…" : "Uložit"}
        </button>
        {savedFlash ? (
          <span className="text-sm text-success" role="status">
            Uloženo.
          </span>
        ) : null}
      </div>
    </form>
  );
}
