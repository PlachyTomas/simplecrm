import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type OrganizationOut = components["schemas"]["OrganizationOut"];
type OrganizationUpdate = components["schemas"]["OrganizationUpdate"];

interface OnboardingFormProps {
  /** Current placeholder values to prefill. */
  defaults: {
    name: string;
    ico: string | null;
  };
}

/**
 * First-time onboarding form. Rendered over the app shell by AppShell when the
 * current user's organization has no IČO set. Submitting calls
 * `PUT /api/v1/organizations/current` and invalidates `/auth/me`; once the
 * next `/auth/me` returns an `ico`, AppShell stops rendering this component.
 *
 * ARES auto-fill will wire into the `ico` field's blur handler in Phase 3.
 */
export function OnboardingForm({ defaults }: OnboardingFormProps) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState(defaults.name);
  const [ico, setIco] = useState(defaults.ico ?? "");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: OrganizationUpdate) =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", {
        method: "PUT",
        token: accessToken,
        body: payload as Record<string, unknown>,
      }),
    onSuccess: () => {
      // Let the shell re-read /auth/me so its `user.organization.ico` flips.
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = ico.trim();
    if (!/^\d{8}$/.test(trimmed)) {
      setError("IČO musí mít přesně 8 číslic.");
      return;
    }
    if (name.trim().length === 0) {
      setError("Zadejte název firmy.");
      return;
    }
    mutation.mutate({
      name: name.trim(),
      ico: trimmed,
      address_city: city.trim() || null,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="bg-bg/80 fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm"
    >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <div
          aria-hidden
          className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Building2 size={20} strokeWidth={1.75} />
        </div>
        <h1 id="onboarding-title" className="text-2xl font-semibold">
          Dokončete nastavení firmy
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Vyplňte prosím IČO a název firmy. Podrobnosti doplníme z ARES v dalším kroku.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">IČO</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={ico}
              onChange={(e) => setIco(e.target.value)}
              placeholder="27082440"
              required
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Název firmy</span>
            <input
              type="text"
              autoComplete="organization"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-text-secondary">Město (volitelné)</span>
            <input
              type="text"
              autoComplete="address-level2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-2 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        {error || mutation.isError ? (
          <p
            className="mt-4 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
            role="alert"
          >
            {error ?? "Uložení se nezdařilo. Zkuste to prosím znovu."}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {mutation.isPending ? "Ukládám…" : "Uložit a pokračovat"}
        </button>
      </form>
    </div>
  );
}
