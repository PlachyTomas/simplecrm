import { ArrowLeft, ExternalLink, Mail, Plus, Star } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ActivityRow } from "@/app/activities/ActivityRow";
import { useActivities } from "@/app/activities/useActivities";
import { OwnershipBadge } from "@/app/companies/OwnershipBadge";
import { useCompany } from "@/app/companies/useCompany";
import type { CompanyOut } from "@/app/companies/useCompanies";
import { useUpdateCompany } from "@/app/companies/useUpdateCompany";
import { AddContactModal } from "@/app/contacts/AddContactModal";
import { useContacts } from "@/app/contacts/useContacts";
import { AddDealModal } from "@/app/deals/AddDealModal";
import { DealDetailDialog } from "@/app/deals/DealDetailDialog";
import { useDealDialog } from "@/app/deals/useDealDialog";
import { useDeals, type DealListItem } from "@/app/deals/useDeals";
import { EmailComposeModal } from "@/app/emails/EmailComposeModal";
import { EmailHistorySection } from "@/app/emails/EmailHistorySection";
import { GatedMailButton } from "@/app/emails/GatedMailButton";
import type { SentEmailOut } from "@/app/emails/useEmails";
import { usePipelineBoard } from "@/app/pipeline/useBoard";
import { isSmtpVerified, useSmtpSettings } from "@/app/settings/useSmtpSettings";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "contacts" | "deals" | "emails" | "activity" | "notes";

interface Tab {
  key: TabKey;
  label: string;
}

const TABS: Tab[] = [
  { key: "overview", label: "Přehled" },
  { key: "contacts", label: "Kontakty" },
  { key: "deals", label: "Obchody" },
  { key: "emails", label: "E-maily" },
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
        <FieldRow label="Obor">{company.industry ?? "—"}</FieldRow>
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
        <FieldRow label="E-mail">
          {company.email ? (
            <a href={`mailto:${company.email}`} className="text-accent hover:text-accent-hover">
              {company.email}
            </a>
          ) : (
            "—"
          )}
        </FieldRow>
        <FieldRow label="Telefon">
          {company.phone ? (
            <a
              href={`tel:${company.phone}`}
              className="font-mono text-accent hover:text-accent-hover"
            >
              {company.phone}
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

function ContactsTab({ company }: { company: CompanyOut }) {
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isPending, isError } = useContacts({ companyId: company.id, limit: 100 });
  const update = useUpdateCompany(company.id);

  // The auto-fallback main_contact (set when main_contact_id is null but
  // the company has at least one contact). We tag this row with
  // "(automaticky)" so the user knows it wasn't an explicit pick.
  const autoMainContactId =
    company.main_contact_id == null ? (company.main_contact?.id ?? null) : null;

  async function setMain(contactId: string) {
    try {
      await update.mutateAsync({ main_contact_id: contactId });
      toast.success("Hlavní kontakt nastaven.");
    } catch {
      toast.error("Hlavní kontakt se nepodařilo nastavit.");
    }
  }

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
            const isMain = company.main_contact_id === c.id;
            const isAutoMain = !isMain && autoMainContactId === c.id;
            const isHighlighted = isMain || isAutoMain;
            return (
              <li key={c.id} className="flex items-center gap-2 py-3">
                <button
                  type="button"
                  aria-label={isHighlighted ? "Hlavní kontakt" : "Nastavit jako hlavní kontakt"}
                  aria-pressed={isHighlighted}
                  title={isHighlighted ? "Hlavní kontakt" : "Nastavit jako hlavní kontakt"}
                  onClick={() => setMain(c.id)}
                  disabled={update.isPending || isMain}
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-fast",
                    isHighlighted
                      ? "text-accent"
                      : "text-text-tertiary hover:bg-surface-overlay hover:text-text-primary",
                    update.isPending && "opacity-60",
                  )}
                >
                  <Star
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden
                    className={cn(isHighlighted && "fill-accent")}
                  />
                </button>
                <Link
                  to={`/app/contacts/${c.id}`}
                  className="flex flex-1 items-center gap-3 text-sm text-text-primary hover:text-accent"
                >
                  <span
                    aria-hidden
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-overlay text-sm font-semibold"
                  >
                    {fullName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{fullName}</span>
                      {isAutoMain ? (
                        <span className="text-[11px] uppercase tracking-wider text-text-tertiary">
                          automaticky
                        </span>
                      ) : null}
                    </span>
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
        forCompanyId={company.id}
      />
    </section>
  );
}

function DealStatusBadge({
  closedAt,
  lostReason,
}: {
  closedAt: string | null | undefined;
  lostReason: string | null | undefined;
}) {
  if (!closedAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-medium text-accent">
        Otevřeno
      </span>
    );
  }
  if (lostReason) {
    return (
      <span className="inline-flex items-center rounded-full bg-danger-subtle px-2.5 py-0.5 text-xs font-medium text-danger">
        Neúspěch
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">
      Vyhráno
    </span>
  );
}

const DEALS_TH =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary";

function DealsTab({ company, locale }: { company: CompanyOut; locale: string }) {
  const { data, isPending, isError } = useDeals({ companyId: company.id, limit: 100 });
  const { data: board } = usePipelineBoard();
  const { data: smtp } = useSmtpSettings();
  const { dealId: dialogDealId, openDeal, closeDeal } = useDealDialog();
  const [addOpen, setAddOpen] = useState(false);
  const [composeDeal, setComposeDeal] = useState<DealListItem | null>(null);
  const stageOptions = useMemo(
    () => (board?.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
    [board?.stages],
  );
  const smtpVerified = isSmtpVerified(smtp);
  const moneyFmt = useMemo(
    () => (value: string, currency: string) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(value)),
    [locale],
  );
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  if (isPending) {
    return <p className="text-sm text-text-tertiary">Načítání obchodů…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">Obchody se nepodařilo načíst.</p>;
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Obchody</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
        >
          <Plus size={14} strokeWidth={2} /> Přidat obchod
        </button>
      </div>
      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">
          K této firmě zatím není přiřazen žádný obchod.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border border-border-subtle">
          <table className="min-w-full divide-y divide-border-subtle">
            <thead>
              <tr>
                <th scope="col" className={DEALS_TH}>
                  Název
                </th>
                <th scope="col" className={`${DEALS_TH} hidden sm:table-cell`}>
                  Fáze
                </th>
                <th scope="col" className={`${DEALS_TH} text-right`}>
                  Hodnota
                </th>
                <th scope="col" className={`${DEALS_TH} hidden lg:table-cell`}>
                  Vlastník
                </th>
                <th scope="col" className={`${DEALS_TH} hidden lg:table-cell`}>
                  Hlavní kontakt
                </th>
                <th scope="col" className={`${DEALS_TH} hidden md:table-cell`}>
                  Vytvořeno
                </th>
                <th scope="col" className={DEALS_TH}>
                  Stav
                </th>
                <th scope="col" className={`${DEALS_TH} text-right`}>
                  Akce
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {data.items.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => openDeal(d.id)}
                  className="cursor-pointer transition-colors duration-fast hover:bg-surface-overlay"
                >
                  <td className="px-4 py-3 text-sm">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeal(d.id);
                      }}
                      className="text-left font-medium text-text-primary hover:text-accent"
                    >
                      {d.name}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-secondary sm:table-cell">
                    {d.stage_name}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-text-secondary">
                    {Number(d.value) > 0 ? (
                      moneyFmt(d.value, d.currency)
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-secondary lg:table-cell">
                    {d.owner_name ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-secondary lg:table-cell">
                    {d.primary_contact_name ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-tertiary md:table-cell">
                    {dateFmt.format(new Date(d.created_at))}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <DealStatusBadge closedAt={d.closed_at} lostReason={d.lost_reason} />
                  </td>
                  {/* Stop row-click (open detail) when using the mail action. */}
                  <td className="px-4 py-3 text-right text-sm" onClick={(e) => e.stopPropagation()}>
                    <GatedMailButton
                      verified={smtpVerified}
                      onClick={() => setComposeDeal(d)}
                      ariaLabel={`Poslat e-mail k obchodu ${d.name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
                    >
                      <Mail size={16} strokeWidth={1.75} aria-hidden />
                    </GatedMailButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialogDealId ? <DealDetailDialog dealId={dialogDealId} onClose={closeDeal} /> : null}
      <AddDealModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        stages={stageOptions}
        lockedCompany={{ id: company.id, name: company.name }}
      />
      {composeDeal ? (
        <EmailComposeModal
          key={composeDeal.id}
          open
          onClose={() => setComposeDeal(null)}
          dealId={composeDeal.id}
          defaultTo={composeDeal.primary_contact_email ?? composeDeal.company_email ?? null}
        />
      ) : null}
    </section>
  );
}

function EmailsTab({ company, locale }: { company: CompanyOut; locale: string }) {
  const { data: smtp } = useSmtpSettings();
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<SentEmailOut | null>(null);
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">E-maily</h2>
        <GatedMailButton
          verified={isSmtpVerified(smtp)}
          onClick={() => {
            setReplyTarget(null);
            setComposeOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
        >
          <Mail size={14} strokeWidth={2} /> Poslat e-mail
        </GatedMailButton>
      </div>
      <EmailHistorySection
        companyId={company.id}
        locale={locale}
        onReply={(email) => {
          setReplyTarget(email);
          setComposeOpen(true);
        }}
      />
      {composeOpen ? (
        <EmailComposeModal
          key={replyTarget?.id ?? "new"}
          open
          onClose={() => {
            setComposeOpen(false);
            setReplyTarget(null);
          }}
          companyId={company.id}
          defaultTo={company.email ?? null}
          replyTo={replyTarget}
        />
      ) : null}
    </section>
  );
}

function ActivityTab({ companyId }: { companyId: string }) {
  const { data, isPending, isError } = useActivities({
    companyId,
    limit: 50,
  });
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
        {data.items.map((a) => (
          <ActivityRow key={a.id} activity={a} />
        ))}
      </ol>
    </section>
  );
}

function NotesTab({ companyId, initialNote }: { companyId: string; initialNote: string | null }) {
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
          <ContactsTab company={company} />
        ) : activeTab === "deals" ? (
          <DealsTab company={company} locale={locale} />
        ) : activeTab === "emails" ? (
          <EmailsTab company={company} locale={locale} />
        ) : activeTab === "activity" ? (
          <ActivityTab companyId={company.id} />
        ) : (
          <NotesTab companyId={company.id} initialNote={company.note ?? null} />
        )}
      </div>
    </div>
  );
}
