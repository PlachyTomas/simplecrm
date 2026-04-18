import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { useCompany } from "@/app/companies/useCompany";
import { useCurrentUser } from "@/auth/useCurrentUser";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3">
      <dt className="text-sm text-text-tertiary">{label}</dt>
      <dd className="col-span-2 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

export function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: company, isPending, isError } = useCompany(companyId);
  const { data: user } = useCurrentUser();

  const dateFmt = user
    ? new Intl.DateTimeFormat(user.organization.locale, { dateStyle: "long" })
    : null;

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="p-8">
        <Link
          to="/app/companies"
          className="mb-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={16} strokeWidth={1.75} /> Zpět na seznam
        </Link>
        <p className="mt-4 text-sm text-danger" role="alert">
          Firmu se nepodařilo načíst.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/app/companies"
        className="mb-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.75} /> Zpět na seznam
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        {company.ico ? (
          <p className="mt-1 font-mono text-sm text-text-tertiary">IČO {company.ico}</p>
        ) : null}
      </header>

      <section className="rounded-lg border border-border bg-surface">
        <dl className="divide-y divide-border-subtle px-6">
          <FieldRow label="DIČ">
            <span className="font-mono">{company.dic ?? "—"}</span>
          </FieldRow>
          <FieldRow label="Právní forma">{company.legal_form ?? "—"}</FieldRow>
          <FieldRow label="Ulice">{company.address_street ?? "—"}</FieldRow>
          <FieldRow label="Město">{company.address_city ?? "—"}</FieldRow>
          <FieldRow label="PSČ">{company.address_zip ?? "—"}</FieldRow>
          <FieldRow label="Web">
            {company.website ? (
              <a href={company.website} className="text-accent hover:text-accent-hover">
                {company.website}
              </a>
            ) : (
              "—"
            )}
          </FieldRow>
          <FieldRow label="Poznámka">{company.note ?? "—"}</FieldRow>
          <FieldRow label="Vytvořeno">
            {dateFmt ? dateFmt.format(new Date(company.created_at)) : company.created_at}
          </FieldRow>
          <FieldRow label="Vlastnictví vyprší">
            {dateFmt
              ? dateFmt.format(new Date(company.ownership_expires_at))
              : company.ownership_expires_at}
          </FieldRow>
        </dl>
      </section>
    </div>
  );
}
