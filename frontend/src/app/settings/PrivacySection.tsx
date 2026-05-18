import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

type AdminAccessLogList = components["schemas"]["AdminAccessLogList"];
type AdminAccessLogRow = components["schemas"]["AdminAccessLogRow"];

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

export function PrivacySection() {
  const query = useAdminAccessLog();

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
    </section>
  );
}
