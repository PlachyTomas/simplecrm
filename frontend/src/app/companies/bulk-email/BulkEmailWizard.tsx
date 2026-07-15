import type { ParseKeys, TFunction } from "i18next";
import { ChevronDown, ChevronRight, Mail, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import {
  type BulkEmailFilters,
  type CampaignOut,
  type RecipientCandidate,
  useResolveRecipients,
  useSendBulkEmail,
} from "@/app/companies/bulk-email/useBulkEmail";
import { useOrgUsers } from "@/app/settings/useUsersTeams";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface EmailOption {
  email: string;
  label: string;
  contactId: string | null;
}

/** Build the selectable address list for a company: its default address
 * first (a contact's name when it maps to one, else a generic company-email
 * label), then any remaining contacts that have an email. */
function emailOptions(c: RecipientCandidate, t: TFunction<"emails">): EmailOption[] {
  const out: EmailOption[] = [];
  const seen = new Set<string>();
  const contactByEmail = new Map<string, RecipientCandidate["contacts"][number]>();
  for (const ct of c.contacts) {
    if (ct.email) contactByEmail.set(ct.email.toLowerCase(), ct);
  }
  if (c.default_email) {
    const ct = contactByEmail.get(c.default_email.toLowerCase());
    out.push({
      email: c.default_email,
      label: ct ? `${ct.first_name} ${ct.last_name}` : t("wizard.defaultEmailLabel"),
      contactId: ct?.id ?? null,
    });
    seen.add(c.default_email.toLowerCase());
  }
  for (const ct of c.contacts) {
    if (ct.email && !seen.has(ct.email.toLowerCase())) {
      out.push({ email: ct.email, label: `${ct.first_name} ${ct.last_name}`, contactId: ct.id });
      seen.add(ct.email.toLowerCase());
    }
  }
  return out;
}

const inputClass =
  "mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none";

const SKIP_LABEL_KEY: Record<string, ParseKeys<"emails">> = {
  no_email: "wizard.skipReasonNoEmail",
  blocked: "wizard.skipReasonBlocked",
};

export function BulkEmailWizard({
  open,
  onClose,
  initialFilters,
}: {
  open: boolean;
  onClose: () => void;
  initialFilters: BulkEmailFilters;
}) {
  const { t } = useTranslation("emails");
  const toast = useToast();
  const navigate = useNavigate();
  const { data: usersPage } = useOrgUsers();
  const resolve = useResolveRecipients();
  const send = useSendBulkEmail();

  const [step, setStep] = useState(1);
  const [candidates, setCandidates] = useState<RecipientCandidate[] | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [createDeals, setCreateDeals] = useState(false);
  const [dealTitle, setDealTitle] = useState("");
  const [result, setResult] = useState<CampaignOut | null>(null);

  // On open, auto-resolve recipients from the handed-in Firmy filters (no filter step).
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setCandidates(null);
    setSelected({});
    setExpanded(new Set());
    setSubject("");
    setBody("");
    setAttachment(null);
    setCreateDeals(false);
    setDealTitle("");
    setResult(null);
    resolve.mutate(initialFilters, {
      onSuccess: (cands) => {
        setCandidates(cands);
        const initial: Record<string, string[]> = {};
        for (const c of cands) {
          if (c.emailable && c.default_email) initial[c.company_id] = [c.default_email];
        }
        setSelected(initial);
      },
      onError: () => toast.error(t("wizard.loadRecipientsError")),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const totalSelected = useMemo(
    () => Object.values(selected).reduce((n, emails) => n + emails.length, 0),
    [selected],
  );

  if (!open) return null;

  const selectAllCompanies = () => {
    const next: Record<string, string[]> = {};
    for (const c of candidates ?? []) {
      if (c.emailable && c.default_email) next[c.company_id] = [c.default_email];
    }
    setSelected(next);
  };
  const selectNoCompanies = () => setSelected({});

  const usersById = new Map((usersPage?.items ?? []).map((u) => [u.id, u.name] as const));
  const summaryParts: string[] = [];
  if (initialFilters.unowned) summaryParts.push(t("wizard.filterUnowned"));
  else if (initialFilters.owner_user_id)
    summaryParts.push(
      usersById.get(initialFilters.owner_user_id) ?? t("wizard.filterUnknownOwner"),
    );
  if (initialFilters.industry) summaryParts.push(initialFilters.industry);
  if (initialFilters.city) summaryParts.push(initialFilters.city);
  const filterSummary = summaryParts.length
    ? summaryParts.join(" · ")
    : t("wizard.filterAllPortfolio");

  const toggleEmail = (companyId: string, email: string) => {
    setSelected((prev) => {
      const current = prev[companyId] ?? [];
      const next = current.includes(email)
        ? current.filter((e) => e !== email)
        : [...current, email];
      return { ...prev, [companyId]: next };
    });
  };

  const toggleExpand = (companyId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  };

  const doSend = () => {
    const candidateById = new Map((candidates ?? []).map((c) => [c.company_id, c]));
    const recipients = Object.entries(selected)
      .filter(([, emails]) => emails.length > 0)
      .map(([companyId, emails]) => {
        const cand = candidateById.get(companyId);
        const opts = cand ? emailOptions(cand, t) : [];
        const firstContact = opts.find((o) => o.email === emails[0])?.contactId ?? null;
        return { company_id: companyId, emails, contact_id: firstContact };
      });

    send.mutate(
      {
        payload: {
          subject: subject.trim(),
          body,
          recipients,
          create_deals: createDeals,
          deal_title: createDeals ? dealTitle.trim() || null : null,
        },
        attachment,
      },
      {
        onSuccess: (campaign) => setResult(campaign),
        onError: (err) =>
          toast.error(
            err instanceof ApiError && err.status === 422
              ? t("wizard.sendRejected")
              : t("wizard.sendFailed"),
          ),
      },
    );
  };

  const emailableCount = (candidates ?? []).filter((c) => c.emailable).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-email-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 px-0 backdrop-blur-sm md:items-center md:px-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl md:rounded-2xl">
        <header className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <Mail size={18} strokeWidth={1.75} className="text-accent" />
            <h2 id="bulk-email-title" className="text-base font-semibold text-text-primary">
              {t("wizard.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("wizard.close")}
            className="rounded-md p-1 text-text-tertiary hover:bg-surface-overlay hover:text-text-primary"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {result ? (
          <SendResult
            result={result}
            onClose={onClose}
            onHistory={() => navigate("/app/email-campaigns")}
          />
        ) : (
          <>
            <div className="border-b border-border-subtle px-5 py-2">
              <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
                {[t("wizard.stepRecipients"), t("wizard.stepText"), t("wizard.stepSend")].map(
                  (label, i) => (
                    <li
                      key={label}
                      className={cn(
                        "font-medium",
                        step === i + 1 ? "text-accent" : step > i + 1 ? "text-text-secondary" : "",
                      )}
                    >
                      {i + 1}. {label}
                    </li>
                  ),
                )}
              </ol>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {step === 1 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-text-tertiary">
                      {t("wizard.filterLabel")}{" "}
                      <span className="text-text-secondary">{filterSummary}</span>
                    </p>
                    {(candidates ?? []).some((c) => c.emailable) ? (
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={selectAllCompanies}
                          className="text-accent hover:text-accent-hover"
                        >
                          {t("wizard.selectAll")}
                        </button>
                        <span className="text-text-tertiary">·</span>
                        <button
                          type="button"
                          onClick={selectNoCompanies}
                          className="text-text-secondary hover:text-text-primary"
                        >
                          {t("wizard.selectNone")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {resolve.isPending ? (
                    <p className="py-8 text-center text-sm text-text-tertiary">
                      {t("wizard.loadingCompanies")}
                    </p>
                  ) : null}
                  {candidates && candidates.length === 0 ? (
                    <p className="py-8 text-center text-sm text-text-tertiary">
                      {t("wizard.noCompaniesMatch")}
                    </p>
                  ) : null}
                  {(candidates ?? []).map((c) => {
                    const opts = emailOptions(c, t);
                    const chosen = selected[c.company_id] ?? [];
                    return (
                      <div
                        key={c.company_id}
                        className={cn(
                          "rounded-md border px-3 py-2",
                          c.emailable
                            ? "border-border bg-surface"
                            : "border-border-subtle bg-surface-overlay opacity-70",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-text-primary">
                              {c.company_name}
                            </p>
                            {c.emailable ? (
                              <p className="text-xs text-text-tertiary">
                                {t("wizard.addressesSelected", { count: chosen.length })}
                              </p>
                            ) : (
                              <p className="text-xs text-warning">
                                {t("wizard.skippedPrefix")}{" "}
                                {c.skip_reason && c.skip_reason in SKIP_LABEL_KEY
                                  ? t(SKIP_LABEL_KEY[c.skip_reason]!)
                                  : c.skip_reason}
                              </p>
                            )}
                          </div>
                          {c.emailable && opts.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(c.company_id)}
                              className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
                            >
                              {expanded.has(c.company_id) ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                              {t("wizard.recipientsToggle")}
                            </button>
                          ) : null}
                        </div>
                        {c.emailable && expanded.has(c.company_id) ? (
                          <div className="mt-2 space-y-1 border-t border-border-subtle pt-2">
                            {opts.map((o) => (
                              <label
                                key={o.email}
                                className="flex items-center gap-2 text-sm text-text-secondary"
                              >
                                <input
                                  type="checkbox"
                                  checked={chosen.includes(o.email)}
                                  onChange={() => toggleEmail(c.company_id, o.email)}
                                />
                                <span className="font-medium text-text-primary">{o.label}</span>
                                <span className="truncate text-text-tertiary">{o.email}</span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {step === 2 ? (
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">
                      {t("wizard.subjectLabel")}
                    </span>
                    <input
                      className={inputClass}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder={t("wizard.subjectPlaceholder")}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">
                      {t("wizard.bodyLabel")}
                    </span>
                    <textarea
                      className={cn(inputClass, "min-h-[160px] resize-y")}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={t("wizard.bodyPlaceholder")}
                    />
                  </label>
                  <p className="text-xs text-text-tertiary">
                    {t("wizard.placeholdersHintPrefix")}{" "}
                    <code className="rounded bg-surface-overlay px-1">{"{firma}"}</code>,{" "}
                    <code className="rounded bg-surface-overlay px-1">{"{kontakt}"}</code>,{" "}
                    <code className="rounded bg-surface-overlay px-1">{"{vlastnik}"}</code>{" "}
                    {t("wizard.placeholdersHintSuffix")}
                  </p>
                  <label className="block">
                    <span className="text-xs font-medium text-text-secondary">
                      {t("wizard.attachmentLabel")}
                    </span>
                    <input
                      type="file"
                      className="mt-1 block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-surface-overlay file:px-3 file:py-1.5 file:text-sm file:text-text-secondary"
                      onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="space-y-3">
                  <p className="text-sm text-text-secondary">
                    {t("wizard.sendSummaryPrefix")} <strong>{totalSelected}</strong>{" "}
                    {t("wizard.sendSummarySuffix")}
                  </p>
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={createDeals}
                      onChange={(e) => setCreateDeals(e.target.checked)}
                    />
                    {t("wizard.createDealsCheckbox")}
                  </label>
                  {createDeals ? (
                    <label className="block">
                      <span className="text-xs font-medium text-text-secondary">
                        {t("wizard.dealTitleLabel")}
                      </span>
                      <input
                        className={inputClass}
                        value={dealTitle}
                        onChange={(e) => setDealTitle(e.target.value)}
                        placeholder={subject || t("wizard.dealTitlePlaceholder")}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border-subtle px-5 py-4">
              <button
                type="button"
                onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))}
                className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                {step === 1 ? t("wizard.cancel") : t("wizard.back")}
              </button>

              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={totalSelected === 0}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("wizard.nextWithCount", { count: totalSelected })}
                </button>
              ) : step === 2 ? (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!subject.trim() || !body.trim()}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("wizard.next")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={doSend}
                  disabled={send.isPending || totalSelected === 0}
                  className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {send.isPending
                    ? t("wizard.sending")
                    : t("wizard.sendWithCount", { count: totalSelected })}
                </button>
              )}
            </footer>
            {step === 1 && emailableCount === 0 && candidates ? (
              <p className="px-5 pb-3 text-xs text-text-tertiary">
                {t("wizard.noEmailableCompanies")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SendResult({
  result,
  onClose,
  onHistory,
}: {
  result: CampaignOut;
  onClose: () => void;
  onHistory: () => void;
}) {
  const { t } = useTranslation("emails");
  return (
    <div className="px-5 py-6">
      <p className="text-sm font-medium text-text-primary">{t("wizard.resultDone")}</p>
      <ul className="mt-3 space-y-1 text-sm">
        <li className="text-success">{t("wizard.resultSent", { count: result.sent_count })}</li>
        <li className="text-danger">{t("wizard.resultFailed", { count: result.failed_count })}</li>
        <li className="text-text-tertiary">
          {t("wizard.resultSkipped", { count: result.skipped_count })}
        </li>
      </ul>
      <p className="mt-3 text-xs text-text-tertiary">{t("wizard.resultNote")}</p>
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onHistory}
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90"
        >
          {t("wizard.viewHistory")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          {t("wizard.close")}
        </button>
      </div>
    </div>
  );
}
