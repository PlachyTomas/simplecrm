import { ArrowLeft } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useCompany } from "@/app/companies/useCompany";
import type { CompanyOut } from "@/app/companies/useCompanies";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "contacts" | "deals" | "activity" | "notes";

interface Tab {
  key: TabKey;
  label: string;
}

const TABS: Tab[] = [
  { key: "overview", label: "Přehled" },
  { key: "contacts", label: "Kontakty" },
  { key: "deals", label: "Obchody" },
  { key: "activity", label: "Aktivita" },
  { key: "notes", label: "Poznámky" },
];

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-3">
      <dt className="text-sm text-text-tertiary">{label}</dt>
      <dd className="col-span-2 text-sm text-text-primary">{children}</dd>
    </div>
  );
}

function OverviewTab({ company, locale }: { company: CompanyOut; locale: string }) {
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  return (
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
        <FieldRow label="Vytvořeno">{dateFmt.format(new Date(company.created_at))}</FieldRow>
        <FieldRow label="Vlastnictví vyprší">
          {dateFmt.format(new Date(company.ownership_expires_at))}
        </FieldRow>
      </dl>
    </section>
  );
}

function PlaceholderTab({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-text-secondary">{description}</p>
    </section>
  );
}

function NotesTab({ note }: { note: string | null }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Poznámky</h2>
      {note ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-text-primary">{note}</p>
      ) : (
        <p className="mt-3 text-sm text-text-secondary">
          K této firmě zatím nejsou žádné poznámky.
        </p>
      )}
    </section>
  );
}

export function CompanyDetailPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { data: company, isPending, isError } = useCompany(companyId);
  const { data: user } = useCurrentUser();

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

  const locale = user?.organization.locale ?? "cs-CZ";

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

      <nav aria-label="Karty detailu" className="mb-6 border-b border-border-subtle">
        <ul role="tablist" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <li key={tab.key} role="presentation">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`tab-panel-${tab.key}`}
                  id={`tab-${tab.key}`}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-fast",
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent text-text-secondary hover:text-text-primary",
                  )}
                >
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div role="tabpanel" id={`tab-panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === "overview" ? (
          <OverviewTab company={company} locale={locale} />
        ) : activeTab === "contacts" ? (
          <PlaceholderTab
            title="Kontakty"
            description="Seznam kontaktů firmy bude součástí Fáze 4.3."
          />
        ) : activeTab === "deals" ? (
          <PlaceholderTab
            title="Obchody"
            description="Přehled obchodů firmy dorazí s Kanbanem v Fázi 5."
          />
        ) : activeTab === "activity" ? (
          <PlaceholderTab
            title="Aktivita"
            description="Časová osa aktivit přibude společně s dashboardy v Fázi 6."
          />
        ) : (
          <NotesTab note={company.note ?? null} />
        )}
      </div>
    </div>
  );
}
