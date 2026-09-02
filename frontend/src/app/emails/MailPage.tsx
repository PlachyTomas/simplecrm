import type { TFunction } from "i18next";
import { ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useDeals } from "@/app/deals/useDeals";
import { EmailComposeModal } from "@/app/emails/EmailComposeModal";
import { EmailDetailModal } from "@/app/emails/EmailDetailModal";
import { LinkEmailDialog } from "@/app/emails/LinkEmailDialog";
import { EngagementChips, StatusBadge } from "@/app/emails/EmailHistorySection";
import {
  type MailListFilters,
  type SentEmailListItem,
  type SentEmailOut,
  useMailList,
} from "@/app/emails/useEmails";
import { useCompanies } from "@/app/companies/useCompanies";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { usePageTitle } from "@/lib/usePageTitle";

const PAGE_SIZE = 25;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary";

const FILTER_SELECT_CLASS =
  "h-9 max-w-[12rem] truncate rounded-md border border-border bg-surface-overlay px-2 text-xs font-medium text-text-secondary focus:border-accent focus:outline-none";

/** One URL param folds direction + unmatched into a single quick filter.
 * Inbound capture is parked: no "received" option until it returns. */
const TYPES = ["sent", "unmatched"] as const;
type MailType = (typeof TYPES)[number];

function isType(value: string): value is MailType {
  return (TYPES as readonly string[]).includes(value);
}

/** Outbound rows list our recipients; inbound rows name the correspondent. */
function counterparty(email: SentEmailListItem, t: TFunction<"emails">): string {
  if (email.direction === "inbound") {
    return t("mailPage.fromShort", { address: email.from_email ?? t("history.unknown") });
  }
  const [first, ...rest] = email.to_emails;
  const more = rest.length > 0 ? ` ${t("mailPage.moreRecipients", { count: rest.length })}` : "";
  return t("mailPage.toShort", { address: (first ?? "—") + more });
}

/**
 * The unified Mail page (email suite Stage 0), currently presented as a
 * sent-mail overview: inbound capture is parked, so the page lists mail sent
 * from SimpleCRM plus any historic captured rows. Rows open
 * `EmailDetailModal`; unmatched rows carry the assign flow.
 */
export function MailPage() {
  const { t } = useTranslation("emails");
  usePageTitle("E-maily");
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawType = searchParams.get("type") ?? "";
  const typeFilter = isType(rawType) ? rawType : "";
  const companyFilter = searchParams.get("company") ?? "";
  const dealFilter = searchParams.get("deal") ?? "";
  const mineOnly = searchParams.get("mine") === "1";
  const page = Math.max(0, Number(searchParams.get("page") ?? "0") || 0);

  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 250);

  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<SentEmailOut | null>(null);
  const [linkTarget, setLinkTarget] = useState<SentEmailListItem[] | null>(null);
  // Bulk selection — unmatched rows only (matched mail is already filed).
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Immutably patch the query string; changing any filter resets pagination.
  const patchParams = (updates: Record<string, string | null>, resetPage = true) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (resetPage && !("page" in updates)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  };

  // Reflect the debounced box into the URL, skipping the mount echo.
  useEffect(() => {
    if ((searchParams.get("q") ?? "") === debouncedSearch) return;
    patchParams({ q: debouncedSearch || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // A stale `type` from a bookmark (e.g. the retired "received") is silently
  // ignored by `isType` — strip it so re-shared URLs don't carry a phantom
  // filter.
  useEffect(() => {
    if (rawType && !isType(rawType)) patchParams({ type: null }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawType]);

  const { data: user } = useCurrentUser();
  // Salespeople only ever see their own history server-side — the toggle
  // would be a no-op checkbox, so it hides.
  const showMineToggle = user != null && user.role !== "salesperson";

  const filters: MailListFilters = {
    search: debouncedSearch || undefined,
    direction: typeFilter === "sent" ? "outbound" : undefined,
    unmatched: typeFilter === "unmatched" || undefined,
    mine: mineOnly || undefined,
    companyId: companyFilter || undefined,
    dealId: dealFilter || undefined,
  };
  const { data, isPending, isError } = useMailList({
    ...filters,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // Picker sources — the house fetch-100 pattern (no server-side search).
  const { data: companiesPage } = useCompanies({ limit: 100 });
  const { data: dealsPage } = useDeals({
    companyId: companyFilter || undefined,
    limit: 100,
  });

  const dt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  const unmatchedOnPage = (data?.items ?? []).filter((e) => !e.company_id && !e.deal_id);
  const allUnmatchedSelected =
    unmatchedOnPage.length > 0 && unmatchedOnPage.every((e) => selected.has(e.id));
  const toggleAllUnmatched = () =>
    setSelected(allUnmatchedSelected ? new Set() : new Set(unmatchedOnPage.map((e) => e.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];
  const hasActiveFilters =
    searchInput !== "" ||
    typeFilter !== "" ||
    companyFilter !== "" ||
    dealFilter !== "" ||
    mineOnly;

  const clearFilters = () => {
    setSearchInput("");
    patchParams({ q: null, type: null, company: null, deal: null, mine: null });
  };

  const setPage = (updater: (p: number) => number) => {
    const nextPage = updater(page);
    patchParams({ page: nextPage > 0 ? String(nextPage) : null }, false);
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("mailPage.title")}</h1>
        <p className="mt-1 text-sm text-text-tertiary">{t("mailPage.subtitle")}</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative block md:max-w-md md:flex-1">
          <span className="sr-only">{t("mailPage.searchLabel")}</span>
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            type="search"
            data-testid={testIds.emails.mail.searchInput}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("mailPage.searchPlaceholder")}
            className="h-10 w-full rounded-md border border-border bg-surface-overlay pl-9 pr-3 text-sm text-text-primary placeholder:text-text-placeholder focus:border-accent focus:outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid={testIds.emails.mail.typeFilter}
            aria-label={t("mailPage.typeFilterLabel")}
            value={typeFilter}
            onChange={(e) => patchParams({ type: e.target.value })}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">{t("mailPage.typeAll")}</option>
            <option value="sent">{t("mailPage.typeSent")}</option>
            <option value="unmatched">{t("mailPage.typeUnmatched")}</option>
          </select>
          <select
            data-testid={testIds.emails.mail.companyFilter}
            aria-label={t("mailPage.companyFilterLabel")}
            value={companyFilter}
            // A company change invalidates any picked deal of another company.
            onChange={(e) => patchParams({ company: e.target.value, deal: null })}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">{t("mailPage.companyAll")}</option>
            {(companiesPage?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            data-testid={testIds.emails.mail.dealFilter}
            aria-label={t("mailPage.dealFilterLabel")}
            value={dealFilter}
            onChange={(e) => patchParams({ deal: e.target.value })}
            className={FILTER_SELECT_CLASS}
          >
            <option value="">{t("mailPage.dealAll")}</option>
            {(dealsPage?.items ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {showMineToggle ? (
            <label className="inline-flex select-none items-center gap-2 text-xs font-medium text-text-secondary">
              <input
                type="checkbox"
                data-testid={testIds.emails.mail.mineToggle}
                checked={mineOnly}
                onChange={(e) => patchParams({ mine: e.target.checked ? "1" : null })}
                className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
              />
              {t("mailPage.mineOnly")}
            </label>
          ) : null}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-md px-2 text-xs font-medium text-text-tertiary transition-colors duration-fast hover:text-text-primary"
            >
              {t("mailPage.clearFilters")}
            </button>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <p className="text-sm text-text-tertiary" role="status">
          {t("mailPage.loading")}
        </p>
      ) : isError ? (
        <p className="text-sm text-danger" role="alert">
          {t("mailPage.loadError")}
        </p>
      ) : items.length === 0 ? (
        typeFilter === "unmatched" && !debouncedSearch && !companyFilter && !dealFilter ? (
          // Peak-end: an empty Nepřiřazené is an achievement, not a dead end.
          <EmptyState
            icon={Inbox}
            title={t("mailPage.unmatchedClearTitle")}
            body={t("mailPage.unmatchedClearBody")}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title={hasActiveFilters ? t("mailPage.emptyFilteredTitle") : t("mailPage.emptyTitle")}
            body={hasActiveFilters ? t("mailPage.emptyFilteredBody") : t("mailPage.emptyBody")}
            tone={hasActiveFilters ? "filtered" : "default"}
          />
        )
      ) : (
        <>
          {selected.size > 0 ? (
            <div
              data-testid={testIds.emails.mail.bulkBar}
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-accent-subtle px-4 py-2.5"
            >
              <p className="text-sm font-medium text-text-primary">
                {t("mailPage.bulk.selectedCount", { count: selected.size })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid={testIds.emails.mail.bulkAssign}
                  onClick={() => setLinkTarget(unmatchedOnPage.filter((e) => selected.has(e.id)))}
                  className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
                >
                  {t("mailPage.bulk.assign", { count: selected.size })}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="h-9 rounded-md px-2 text-sm text-text-tertiary transition-colors duration-fast hover:text-text-primary"
                >
                  {t("mailPage.bulk.clear")}
                </button>
              </div>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border-subtle">
              <thead>
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={t("mailPage.bulk.selectAll")}
                      data-testid={testIds.emails.mail.bulkSelectAll}
                      checked={allUnmatchedSelected}
                      disabled={unmatchedOnPage.length === 0}
                      onChange={toggleAllUnmatched}
                      className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
                    />
                  </th>
                  <th scope="col" className={TH}>
                    {t("mailPage.columns.subject")}
                  </th>
                  <th scope="col" className={`${TH} hidden md:table-cell`}>
                    {t("mailPage.columns.counterparty")}
                  </th>
                  <th scope="col" className={`${TH} hidden lg:table-cell`}>
                    {t("mailPage.columns.company")}
                  </th>
                  <th scope="col" className={`${TH} hidden lg:table-cell`}>
                    {t("mailPage.columns.deal")}
                  </th>
                  <th scope="col" className={TH}>
                    {t("mailPage.columns.date")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface">
                {items.map((email) => (
                  <tr key={email.id} data-testid={testIds.emails.mail.row(email.id)}>
                    <td className="w-10 px-4 py-3">
                      {!email.company_id && !email.deal_id ? (
                        <input
                          type="checkbox"
                          aria-label={t("mailPage.bulk.selectOne", { subject: email.subject })}
                          checked={selected.has(email.id)}
                          onChange={() => toggleOne(email.id)}
                          className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
                        />
                      ) : null}
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOpenEmailId(email.id)}
                          className="max-w-full truncate text-left text-sm font-medium text-text-primary hover:text-accent"
                        >
                          {email.subject}
                        </button>
                        <StatusBadge email={email} />
                        <EngagementChips email={email} locale={locale} />
                        {/* Unmatched mail is a lead nobody can act on yet —
                            filing it is the row's one action. */}
                        {!email.company_id && !email.deal_id ? (
                          <button
                            type="button"
                            data-testid={testIds.emails.mail.linkButton(email.id)}
                            onClick={() => setLinkTarget([email])}
                            className="inline-flex items-center rounded-full border border-accent px-2 py-0.5 text-xs font-medium text-accent transition-colors duration-fast hover:bg-accent-subtle"
                          >
                            {t("mailPage.assign")}
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-tertiary md:hidden">
                        {counterparty(email, t)}
                      </p>
                    </td>
                    <td className="hidden max-w-xs truncate px-4 py-3 text-sm text-text-secondary md:table-cell">
                      {counterparty(email, t)}
                    </td>
                    <td className="hidden max-w-[12rem] truncate px-4 py-3 text-sm lg:table-cell">
                      {email.company_name ?? <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="hidden max-w-[12rem] truncate px-4 py-3 text-sm lg:table-cell">
                      {email.deal_name ?? <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums text-text-secondary">
                      {dt.format(new Date(email.sent_at ?? email.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <p>
                {t("mailPage.pageInfo", {
                  from: page * PAGE_SIZE + 1,
                  to: Math.min(total, (page + 1) * PAGE_SIZE),
                  total,
                })}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t("mailPage.prevPage")}
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-overlay transition-colors duration-fast hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={t("mailPage.nextPage")}
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-overlay transition-colors duration-fast hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <EmailDetailModal
        emailId={openEmailId}
        onClose={() => setOpenEmailId(null)}
        onSwitch={setOpenEmailId}
        onReply={(email) => {
          setOpenEmailId(null);
          setReplyTarget(email);
        }}
      />
      {replyTarget ? (
        <EmailComposeModal open onClose={() => setReplyTarget(null)} replyTo={replyTarget} />
      ) : null}
      <LinkEmailDialog
        emails={linkTarget}
        onClose={() => {
          setLinkTarget(null);
          setSelected(new Set());
        }}
      />
    </div>
  );
}
