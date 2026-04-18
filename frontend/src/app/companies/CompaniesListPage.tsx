import { Building2 } from "lucide-react";
import { Link } from "react-router-dom";

import { useCompanies } from "@/app/companies/useCompanies";
import { useCurrentUser } from "@/auth/useCurrentUser";

export function CompaniesListPage() {
  const { data: companies, isPending, isError } = useCompanies();
  const { data: user } = useCurrentUser();

  const dateFmt = user
    ? new Intl.DateTimeFormat(user.organization.locale, { dateStyle: "medium" })
    : null;

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání firem…
      </div>
    );
  }

  if (isError || !companies) {
    return (
      <div className="p-8 text-sm text-danger" role="alert">
        Firmy se nepodařilo načíst. Zkuste to prosím znovu.
      </div>
    );
  }

  if (companies.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div
          aria-hidden
          className="inline-flex h-12 w-12 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Building2 size={24} strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold">Zatím tu nejsou žádné firmy</h2>
        <p className="max-w-sm text-sm text-text-secondary">
          Přidání firem a jejich editace dorazí v další fázi. Pro teď zobrazujeme tento přehled jen
          ke čtení.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Firmy</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Celkem {companies.total}{" "}
          {companies.total === 1 ? "firma" : companies.total < 5 ? "firmy" : "firem"}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="min-w-full divide-y divide-border-subtle">
          <thead>
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                Název
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                IČO
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                Město
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary"
              >
                Založeno
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {companies.items.map((company) => (
              <tr
                key={company.id}
                className="transition-colors duration-fast hover:bg-surface-overlay"
              >
                <td className="px-4 py-3 text-sm">
                  <Link
                    to={`/app/companies/${company.id}`}
                    className="font-medium text-text-primary hover:text-accent"
                  >
                    {company.name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                  {company.ico ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {company.address_city ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-text-tertiary">
                  {dateFmt ? dateFmt.format(new Date(company.created_at)) : company.created_at}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
