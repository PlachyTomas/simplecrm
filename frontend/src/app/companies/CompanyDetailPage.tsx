import { ArrowLeft, ExternalLink, Mail, Plus, Star } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useLocale } from "@/lib/i18n/useLocale";
import { useToast } from "@/lib/toast";
import { usePageTitle } from "@/lib/usePageTitle";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "contacts" | "deals" | "emails" | "activity" | "notes";

interface Tab {
  key: TabKey;
  labelKey: `companyDetail.tabs.${TabKey}`;
}

const TABS: Tab[] = [
  { key: "overview", labelKey: "companyDetail.tabs.overview" },
  { key: "contacts", labelKey: "companyDetail.tabs.contacts" },
  { key: "deals", labelKey: "companyDetail.tabs.deals" },
  { key: "emails", labelKey: "companyDetail.tabs.emails" },
  { key: "activity", labelKey: "companyDetail.tabs.activity" },
  { key: "notes", labelKey: "companyDetail.tabs.notes" },
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
  const { t } = useTranslation("companies");
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  const expiresRelative = relativeFromNow(company.ownership_expires_at, locale);
  return (
    <section className="rounded-lg border border-border bg-surface">
      <dl className="divide-y divide-border-subtle px-6">
        <FieldRow label={t("companyDetail.fields.dic")}>
          <span className="font-mono">{company.dic ?? "—"}</span>
        </FieldRow>
        <FieldRow label={t("companyDetail.fields.legalForm")}>{company.legal_form ?? "—"}</FieldRow>
        <FieldRow label={t("companyDetail.fields.industry")}>{company.industry ?? "—"}</FieldRow>
        <FieldRow label={t("companyDetail.fields.street")}>
          {company.address_street ?? "—"}
        </FieldRow>
        <FieldRow label={t("companyDetail.fields.city")}>{company.address_city ?? "—"}</FieldRow>
        <FieldRow label={t("companyDetail.fields.zip")}>{company.address_zip ?? "—"}</FieldRow>
        <FieldRow label={t("companyDetail.fields.web")}>
          {company.website ? (
            <a href={company.website} className="text-accent hover:text-accent-hover">
              {company.website}
            </a>
          ) : (
            "—"
          )}
        </FieldRow>
        <FieldRow label={t("companyDetail.fields.email")}>
          {company.email ? (
            <a href={`mailto:${company.email}`} className="text-accent hover:text-accent-hover">
              {company.email}
            </a>
          ) : (
            "—"
          )}
        </FieldRow>
        <FieldRow label={t("companyDetail.fields.phone")}>
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
        <FieldRow label={t("companyDetail.fields.created")}>
          {dateFmt.format(new Date(company.created_at))}
        </FieldRow>
        <FieldRow label={t("companyDetail.fields.ownershipExpires")}>
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
  const { t } = useTranslation("companies");
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isPending, isError } = useContacts({ companyId: company.id, limit: 100 });
  const update = useUpdateCompany(company.id);

  // The auto-fallback main_contact (set when main_contact_id is null but
  // the company has at least one contact). We tag this row with an "auto"
  // marker so the user knows it wasn't an explicit pick.
  const autoMainContactId =
    company.main_contact_id == null ? (company.main_contact?.id ?? null) : null;

  async function setMain(contactId: string) {
    try {
      await update.mutateAsync({ main_contact_id: contactId });
      toast.success(t("companyDetail.contactsTab.setMainSuccess"));
    } catch {
      toast.error(t("companyDetail.contactsTab.setMainError"));
    }
  }

  if (isPending) {
    return <p className="text-sm text-text-tertiary">{t("companyDetail.contactsTab.loading")}</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">{t("companyDetail.contactsTab.loadError")}</p>;
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{t("companyDetail.contactsTab.title")}</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
        >
          <Plus size={14} strokeWidth={2} /> {t("companyDetail.contactsTab.addButton")}
        </button>
      </div>
      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{t("companyDetail.contactsTab.empty")}</p>
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
                  aria-label={
                    isHighlighted
                      ? t("companyDetail.contactsTab.mainContact")
                      : t("companyDetail.contactsTab.setAsMain")
                  }
                  aria-pressed={isHighlighted}
                  title={
                    isHighlighted
                      ? t("companyDetail.contactsTab.mainContact")
                      : t("companyDetail.contactsTab.setAsMain")
                  }
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
                          {t("companyDetail.contactsTab.autoTag")}
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
  const { t } = useTranslation("companies");
  if (!closedAt) {
    return (
      <span className="inline-flex items-center rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-medium text-accent">
        {t("companyDetail.dealStatus.open")}
      </span>
    );
  }
  if (lostReason) {
    return (
      <span className="inline-flex items-center rounded-full bg-danger-subtle px-2.5 py-0.5 text-xs font-medium text-danger">
        {t("companyDetail.dealStatus.lost")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success">
      {t("companyDetail.dealStatus.won")}
    </span>
  );
}

const DEALS_TH =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary";

function DealsTab({ company, locale }: { company: CompanyOut; locale: string }) {
  const { t } = useTranslation("companies");
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
    return <p className="text-sm text-text-tertiary">{t("companyDetail.dealsTab.loading")}</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">{t("companyDetail.dealsTab.loadError")}</p>;
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{t("companyDetail.dealsTab.title")}</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
        >
          <Plus size={14} strokeWidth={2} /> {t("companyDetail.dealsTab.addButton")}
        </button>
      </div>
      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{t("companyDetail.dealsTab.empty")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border border-border-subtle">
          <table className="min-w-full divide-y divide-border-subtle">
            <thead>
              <tr>
                <th scope="col" className={DEALS_TH}>
                  {t("companyDetail.dealsTab.columns.name")}
                </th>
                <th scope="col" className={`${DEALS_TH} hidden sm:table-cell`}>
                  {t("companyDetail.dealsTab.columns.stage")}
                </th>
                <th scope="col" className={`${DEALS_TH} text-right`}>
                  {t("companyDetail.dealsTab.columns.value")}
                </th>
                <th scope="col" className={`${DEALS_TH} hidden lg:table-cell`}>
                  {t("companyDetail.dealsTab.columns.owner")}
                </th>
                <th scope="col" className={`${DEALS_TH} hidden lg:table-cell`}>
                  {t("companyDetail.dealsTab.columns.mainContact")}
                </th>
                <th scope="col" className={`${DEALS_TH} hidden md:table-cell`}>
                  {t("companyDetail.dealsTab.columns.created")}
                </th>
                <th scope="col" className={DEALS_TH}>
                  {t("companyDetail.dealsTab.columns.status")}
                </th>
                <th scope="col" className={`${DEALS_TH} text-right`}>
                  {t("companyDetail.dealsTab.columns.actions")}
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
                      ariaLabel={t("companyDetail.dealsTab.sendEmailAria", { name: d.name })}
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
  const { t } = useTranslation("companies");
  const { data: smtp } = useSmtpSettings();
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<SentEmailOut | null>(null);
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{t("companyDetail.emailsTab.title")}</h2>
        <GatedMailButton
          verified={isSmtpVerified(smtp)}
          onClick={() => {
            setReplyTarget(null);
            setComposeOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-text-on-accent hover:bg-accent-hover"
        >
          <Mail size={14} strokeWidth={2} /> {t("companyDetail.emailsTab.sendButton")}
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
  const { t } = useTranslation("companies");
  const { data, isPending, isError } = useActivities({
    companyId,
    limit: 50,
  });
  if (isPending) {
    return <p className="text-sm text-text-tertiary">{t("companyDetail.activityTab.loading")}</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">{t("companyDetail.activityTab.loadError")}</p>;
  }
  if (data.items.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("companyDetail.activityTab.title")}</h2>
        <p className="mt-4 text-sm text-text-secondary">{t("companyDetail.activityTab.empty")}</p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("companyDetail.activityTab.title")}</h2>
      <ol className="mt-4 space-y-3 border-l border-border-subtle pl-5">
        {data.items.map((a) => (
          <ActivityRow key={a.id} activity={a} />
        ))}
      </ol>
    </section>
  );
}

function NotesTab({ companyId, initialNote }: { companyId: string; initialNote: string | null }) {
  const { t } = useTranslation("companies");
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
      toast.success(t("companyDetail.notesTab.saveSuccess"));
      setEditing(false);
    } catch {
      toast.error(t("companyDetail.notesTab.saveError"));
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{t("companyDetail.notesTab.title")}</h2>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-accent hover:text-accent-hover"
          >
            {initialNote
              ? t("companyDetail.notesTab.editButton")
              : t("companyDetail.notesTab.addButton")}
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
            placeholder={t("companyDetail.notesTab.placeholder")}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={update.isPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent disabled:opacity-60"
            >
              {update.isPending
                ? t("companyDetail.notesTab.saving")
                : t("companyDetail.notesTab.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(initialNote ?? "");
                setEditing(false);
              }}
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary"
            >
              {t("companyDetail.notesTab.cancel")}
            </button>
          </div>
        </div>
      ) : initialNote ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-text-primary">{initialNote}</p>
      ) : (
        <p className="mt-3 text-sm text-text-secondary">{t("companyDetail.notesTab.empty")}</p>
      )}
    </section>
  );
}

export function CompanyDetailPage() {
  const { t } = useTranslation("companies");
  const { companyId } = useParams<{ companyId: string }>();
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { data: company, isPending, isError } = useCompany(companyId);
  const { data: usersPage } = useOrgUsers();
  usePageTitle(company?.name ?? t("companyDetail.defaultTitle"));
  const ownerName = useMemo(() => {
    if (!company?.owner_user_id) return null;
    return usersPage?.items.find((u) => u.id === company.owner_user_id)?.name ?? null;
  }, [company, usersPage]);

  if (isPending) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        {t("companyDetail.loading")}
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
          <ArrowLeft size={16} strokeWidth={1.75} /> {t("companyDetail.backToList")}
        </Link>
        <p className="mt-4 text-sm text-danger" role="alert">
          {t("companyDetail.loadError")}
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
        <ArrowLeft size={16} strokeWidth={1.75} /> {t("companyDetail.backToList")}
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
          {company.ico ? (
            <span className="font-mono">{t("companyDetail.icoLabel", { ico: company.ico })}</span>
          ) : null}
          {ownerName ? (
            <span>
              {t("companyDetail.ownerPrefix")}{" "}
              <span className="text-text-secondary">{ownerName}</span>
            </span>
          ) : (
            <span>{t("companyDetail.pooled")}</span>
          )}
          {company.ico ? (
            <a
              href={`https://ares.gov.cz/ekonomicke-subjekty?ico=${company.ico}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent hover:text-accent-hover"
            >
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden />{" "}
              {t("companyDetail.openInAres")}
            </a>
          ) : null}
        </div>
      </header>

      <nav
        aria-label={t("companyDetail.tabsAriaLabel")}
        className="mb-6 border-b border-border-subtle"
      >
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
                  {t(tab.labelKey)}
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
