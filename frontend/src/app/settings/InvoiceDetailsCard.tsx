import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";

import { useAuth } from "@/auth/useAuth";
import { OrgBillingFields } from "@/components/billing/OrgBillingFields";
import {
  type BillingFormState,
  billingFormFromOrg,
  billingFormToPayload,
  emptyBillingForm,
} from "@/components/billing/orgBillingForm";
import { apiFetch } from "@/lib/api";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];

/**
 * Settings → Organizace card that collects every customer-side field a
 * Czech tax invoice ("daňový doklad") requires: legal name, IČO, DIČ,
 * legal form, address, billing email. The fields + IČO→ARES autofill +
 * Firma/soukromá osoba toggle live in the shared `OrgBillingFields`, so
 * Settings, the trial gate, and the change-plan modal all render one
 * identical form.
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

  const [form, setForm] = useState<BillingFormState>(emptyBillingForm);
  // Once the org loads, hydrate the form. Re-runs only when the server's
  // snapshot identity changes (e.g. another tab saved) so local edits
  // aren't reset on every refetch.
  useEffect(() => {
    if (orgQuery.data) setForm(billingFormFromOrg(orgQuery.data));
  }, [orgQuery.data]);

  const saveMutation = useMutation<OrganizationOut, Error, BillingFormState>({
    mutationFn: (state) =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: billingFormToPayload(state),
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

      <div className="mt-6">
        <OrgBillingFields
          value={form}
          onChange={setForm}
          orgName={orgQuery.data.name ?? ""}
          savedIco={orgQuery.data.ico ?? ""}
        />
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={saveMutation.isPending}
          data-testid={testIds.billing.submit}
          className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:opacity-50"
        >
          {saveMutation.isPending ? "Ukládám…" : "Uložit fakturační údaje"}
        </button>
      </div>
    </form>
  );
}
