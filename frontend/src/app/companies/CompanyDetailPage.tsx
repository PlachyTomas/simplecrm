import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useActivities } from "@/app/activities/useActivities";
import type { ActivityOut } from "@/app/activities/useActivities";
import { OwnershipBadge } from "@/app/companies/OwnershipBadge";
import { useCompany } from "@/app/companies/useCompany";
import type { CompanyOut } from "@/app/companies/useCompanies";
import { useUpdateCompany } from "@/app/companies/useUpdateCompany";
import { AddContactModal } from "@/app/contacts/AddContactModal";
import { useContacts } from "@/app/contacts/useContacts";
import { useDeals } from "@/app/deals/useDeals";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
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

function relativeFromNow(targetIso: string, locale: string): string {
  const target = new Date(targetIso).getTime();
  const diffDays = Math.round((target - Date.now()) / (1000 * 60 * 60 * 24));
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (Math.abs(diffDays) < 60) return rtf.format(diffDays, "day");
    if (Math.abs(diffDays) < 365 * 2) return rtf.format(Math.round(diffDays / 30), "month");
    return rtf.format(Math.round(diffDays / 365), "year");
  } catch {
    return "";
  }
}

function OverviewTab({ company, locale }: { company: CompanyOut; locale: string }) {
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const expiresRelative = relativeFromNow(company.ownership_expires_at, locale);
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
          <div>
            <p>{dateFmt.format(new Date(company.ownership_expires_at))}</p>
            {expiresRelative ? (
              <p className="mt-0.5 text-xs text-text-tertiary">{expiresRelative}</p>
            ) : null}
          </div>
        </FieldRow>
      </dl>
    </section>
  );
}

function ContactsTab({ companyId }: { companyId: string }) {
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const { data, isPending, isError } = useContacts({ companyId, limit: 100 });
  if (isPending) {
    return <p className="text-sm text-text-tertiary">Načítání kontaktů…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">Kontakty se nepodařilo načíst.</p>;
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Kontakty</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
        >
          <Plus size={14} strokeWidth={2} /> Přidat kontakt
        </button>
      </div>
      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">
          K této firmě zatím není přiřazen žádný kontakt.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {data.items.map((c) => {
            const fullName = `${c.first_name} ${c.last_name}`.trim();
            return (
              <li key={c.id} className="py-3">
                <Link
                  to={`/app/contacts/${c.id}`}
                  className="flex items-center gap-3 text-sm text-text-primary hover:text-accent"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-overlay text-sm font-semibold"
                  >
                    {fullName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium">{fullName}</span>
                    {c.position || c.email ? (
                      <span className="block text-xs text-text-tertiary">
                        {[c.position, c.email].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <AddContactModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(id) => navigate(`/app/contacts/${id}`)}
        forCompanyId={companyId}
      />
    </section>
  );
}

function DealsTab({ companyId, locale }: { companyId: string; locale: string }) {
  const { data, isPending, isError } = useDeals({ companyId, limit: 100 });
  const moneyFmt = useMemo(
    () =>
      (value: string, currency: string) =>
        new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value)),
    [locale],
  );
  if (isPending) {
    return <p className="text-sm text-text-tertiary">Načítání obchodů…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">Obchody se nepodařilo načíst.</p>;
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Obchody</h2>
      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">
          K této firmě zatím není přiřazen žádný obchod.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {data.items.map((d) => (
            <li key={d.id} className="py-3">
              <Link
                to={`/app/deals/${d.id}`}
                className="flex items-center justify-between gap-4 text-sm text-text-primary hover:text-accent"
              >
                <span>
                  <span className="block font-medium">{d.name}</span>
                  {d.closed_at ? (
                    <span className="block text-xs text-text-tertiary">
                      Uzavřeno {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                        new Date(d.closed_at),
                      )}
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-text-secondary">
                  {moneyFmt(d.value, d.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const ACTIVITY_LABEL: Record<string, string> = {
  note: "Poznámka",
  stage_change: "Změna fáze",
  owner_change: "Změna vlastníka",
  deal_won: "Obchod vyhrán",
  deal_lost: "Obchod ztracen",
  company_freed: "Firma uvolněna z poolu",
};

function ActivityTab({ companyId, locale }: { companyId: string; locale: string }) {
  const { data, isPending, isError } = useActivities({
    entityType: "company",
    entityId: companyId,
    limit: 50,
  });
  const dt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  if (isPending) {
    return <p className="text-sm text-text-tertiary">Načítání aktivit…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">Aktivity se nepodařilo načíst.</p>;
  }
  if (data.items.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">Aktivita</h2>
        <p className="mt-4 text-sm text-text-secondary">
          K této firmě zatím není zaznamenaná žádná aktivita.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">Aktivita</h2>
      <ol className="mt-4 space-y-3 border-l border-border-subtle pl-5">
        {data.items.map((a: ActivityOut) => (
          <li key={a.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[26px] top-1 inline-block h-2.5 w-2.5 rounded-full bg-accent"
            />
            <p className="text-sm font-medium text-text-primary">
              {ACTIVITY_LABEL[a.activity_type] ?? a.activity_type}
            </p>
            <p className="text-xs text-text-tertiary">{dt.format(new Date(a.created_at))}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NotesTab({
  companyId,
  initialNote,
}: {
  companyId: string;
  initialNote: string | null;
}) {
  const update = useUpdateCompany(companyId);
  const toast = useToast();
  const [draft, setDraft] = useState(initialNote ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(initialNote ?? "");
  }, [initialNote]);

  async function handleSave() {
    try {
      await update.mutateAsync({ note: draft.trim() ? draft : null });
      toast.success("Poznámka uložena.");
      setEditing(false);
    } catch {
      toast.error("Poznámku se nepodařilo uložit.");
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Poznámky</h2>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            {initialNote ? "Upravit" : "+ Přidat poznámku"}
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            maxLength={2000}
            className="block w-full rounded-md border border-border bg-surface-overlay p-3 text-sm text-text-primary focus:border-accent focus:outline-none"
            placeholder="Napište poznámku k této firmě…"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={update.isPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent disabled:opacity-60"
            >
              {update.isPending ? "Ukládám…" : "Uložit"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(initialNote ?? "");
                setEditing(false);
              }}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary"
            >
              Zrušit
            </button>
          </div>
        </div>
      ) : initialNote ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-text-primary">{initialNote}</p>
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
  const { data: usersPage } = useOrgUsers();
  usePageTitle(company?.name ?? "Detail firmy");
  const ownerName = useMemo(() => {
    if (!company?.owner_user_id) return null;
    return usersPage?.items.find((u) => u.id === company.owner_user_id)?.name ?? null;
  }, [company, usersPage]);

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

  const locale = user?.organization?.locale ?? "cs-CZ";

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/app/companies"
        className="mb-4 inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.75} /> Zpět na seznam
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <OwnershipBadge
            ownershipExpiresAt={company.ownership_expires_at}
            ownerUserId={company.owner_user_id}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-tertiary">
          {company.ico ? <span className="font-mono">IČO {company.ico}</span> : null}
          {ownerName ? (
            <span>
              Vlastník: <span className="text-text-secondary">{ownerName}</span>
            </span>
          ) : (
            <span>Ve sdíleném poolu</span>
          )}
          {company.ico ? (
            <a
              href={`https://ares.gov.cz/ekonomicke-subjekty?ico=${company.ico}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:text-accent-hover"
            >
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden /> Otevřít v ARES
            </a>
          ) : null}
        </div>
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
          <ContactsTab companyId={company.id} />
        ) : activeTab === "deals" ? (
          <DealsTab companyId={company.id} locale={locale} />
        ) : activeTab === "activity" ? (
          <ActivityTab companyId={company.id} locale={locale} />
        ) : (
          <NotesTab companyId={company.id} initialNote={company.note ?? null} />
        )}
      </div>
    </div>
  );
}
