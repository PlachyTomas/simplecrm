import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { ApiError, apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type AdminAccessLogList = components["schemas"]["AdminAccessLogList"];
type AdminAccessLogRow = components["schemas"]["AdminAccessLogRow"];
type OrganizationEraseOut = components["schemas"]["OrganizationEraseOut"];
type OrganizationOut = components["schemas"]["OrganizationOut"];

const ACTION_LABEL: Record<AdminAccessLogRow["action"], string> = {
  list_users: "Zobrazení seznamu uživatelů",
  view_subscription: "Zobrazení detailu předplatného",
  view_invoices: "Zobrazení fakturační historie",
  view_activity: "Zobrazení aktivity předplatného",
  impersonate: "Přihlášení jménem uživatele (impersonace)",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useAdminAccessLog() {
  const { accessToken } = useAuth();
  return useQuery<AdminAccessLogList>({
    queryKey: ["org", "admin-access-log"],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<AdminAccessLogList>("/api/v1/organizations/me/admin-access-log?limit=100", {
        token: accessToken,
      }),
  });
}

function useCurrentOrganization() {
  const { accessToken } = useAuth();
  return useQuery<OrganizationOut>({
    queryKey: ["org", "current"],
    enabled: !!accessToken,
    queryFn: () =>
      apiFetch<OrganizationOut>("/api/v1/organizations/current", { token: accessToken }),
  });
}

function useEraseOrganization() {
  const { accessToken } = useAuth();
  return useMutation<OrganizationEraseOut, ApiError, { confirmation_name: string }>({
    mutationFn: (body) =>
      apiFetch<OrganizationEraseOut>("/api/v1/organizations/me/erase", {
        method: "POST",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
  });
}

export function PrivacySection() {
  const query = useAdminAccessLog();
  const org = useCurrentOrganization();
  const me = useCurrentUser();

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">Přístup operátora</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Pověřené osoby provozovatele SimpleCRM mají pro účely podpory, řešení incidentů
          a údržby omezený přístup k Vašim datům. Každý takový přístup je zaznamenán a najdete
          ho v tabulce níže. Podrobnosti k povinnostem provozovatele jsou v{" "}
          <Link
            to="/zpracovatelska-smlouva#cl-5"
            className="underline hover:text-text-primary"
            target="_blank"
            rel="noreferrer"
          >
            čl. 5 Zpracovatelské smlouvy
          </Link>
          .
        </p>

        <div className="mt-5">
          {query.isPending ? (
            <p className="text-sm text-text-tertiary" role="status">
              Načítání…
            </p>
          ) : query.isError ? (
            <p className="text-sm text-danger" role="alert">
              Načtení historie přístupů se nezdařilo.
            </p>
          ) : query.data && query.data.items.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              Žádný přístup nebyl zaznamenán. Pokud někdo z týmu SimpleCRM kdykoli do vašich dat
              nahlédne, objeví se zde nový záznam.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-text-tertiary">
                  <tr>
                    <th className="border-b border-border-subtle py-2 pr-4 font-medium">Kdy</th>
                    <th className="border-b border-border-subtle py-2 pr-4 font-medium">Akce</th>
                    <th className="border-b border-border-subtle py-2 pr-4 font-medium">
                      Pověřená osoba
                    </th>
                    <th className="border-b border-border-subtle py-2 font-medium">
                      Dotčený uživatel
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data?.items.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="border-b border-border-subtle py-2 pr-4 text-text-secondary">
                        {formatTimestamp(row.created_at)}
                      </td>
                      <td className="border-b border-border-subtle py-2 pr-4 text-text-primary">
                        {ACTION_LABEL[row.action]}
                      </td>
                      <td className="border-b border-border-subtle py-2 pr-4 text-text-secondary">
                        {row.super_admin_email}
                      </td>
                      <td className="border-b border-border-subtle py-2 text-text-secondary">
                        {row.target_user_email ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {me.data?.role === "admin" && org.data ? <DangerZone orgName={org.data.name} /> : null}
    </section>
  );
}

function DangerZone({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-danger/40 rounded-lg border bg-danger-subtle p-6">
      <h2 className="text-lg font-semibold text-text-primary">Trvale smazat organizaci</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Nevratně smaže veškerá osobní data: kontakty, firmy, obchody, aktivity i uživatelské
        účty. Vystavené daňové doklady ze zákona uchováváme dalších 10 let dle § 31 zákona
        o účetnictví — bez Vašich přístupových údajů.
      </p>
      <p className="mt-2 text-xs text-text-tertiary">
        Před smazáním Vám doporučujeme exportovat data ze sekce Reporty. Aktivní předplatné
        automaticky zrušíme v rámci smazání.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-md border border-danger bg-surface px-5 text-sm font-medium text-danger transition-colors duration-fast hover:bg-danger hover:text-text-on-accent"
      >
        Smazat organizaci…
      </button>

      {open ? <EraseOrgDialog orgName={orgName} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function EraseOrgDialog({ orgName, onClose }: { orgName: string; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { accessToken, clearAuth } = useAuth();
  const queryClient = useQueryClient();
  const erase = useEraseOrganization();

  const matches = typed === orgName;
  const submitDisabled = !matches || erase.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitDisabled) return;
    setError(null);
    erase.mutate(
      { confirmation_name: typed },
      {
        onSuccess: async () => {
          // Anonymization deactivates every user; existing tokens stop
          // working on the next request. Best-effort logout to invalidate
          // the refresh cookie, then clear local state and bounce to the
          // public landing.
          try {
            await apiFetch<void>("/api/v1/auth/logout", {
              method: "POST",
              token: accessToken,
            });
          } catch {
            // Already gone server-side — no recovery needed.
          }
          clearAuth();
          queryClient.clear();
          navigate("/", { replace: true });
        },
        onError: (err) => {
          const detail =
            err instanceof ApiError
              ? (err.body as { detail?: string } | null)?.detail
              : undefined;
          setError(detail ?? "Smazání se nezdařilo. Zkuste to prosím znovu.");
        },
      },
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="erase-org-title"
      className="bg-bg/80 fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget && !erase.isPending) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="erase-org-title" className="text-lg font-semibold text-text-primary">
          Trvale smazat organizaci?
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Tuto akci nelze vrátit zpět. Pro potvrzení opište přesný název organizace:
        </p>
        <p className="mt-2 rounded-md border border-border bg-surface-overlay px-3 py-2 text-sm font-mono text-text-primary">
          {orgName}
        </p>
        <label className="mt-4 block text-xs font-medium text-text-tertiary">
          Název organizace
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={erase.isPending}
            autoComplete="off"
            autoFocus
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary"
          />
        </label>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitDisabled}
            className="hover:bg-danger/90 inline-flex h-10 items-center justify-center rounded-md bg-danger px-5 text-sm font-semibold text-text-on-accent transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-50"
          >
            {erase.isPending ? "Mažeme…" : "Trvale smazat"}
          </button>
          <button
            type="button"
            disabled={erase.isPending}
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Zrušit
          </button>
        </div>
      </form>
    </div>
  );
}
