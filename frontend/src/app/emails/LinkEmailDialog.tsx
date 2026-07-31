/**
 * "Přiřadit" dialog for an unmatched captured mail — the missing verb of
 * Smart BCC. Two paths:
 *
 * 1. Existing company (combobox) + optionally one of its open deals.
 * 2. "Nová firma z tohoto e-mailu": company + contact + (optional) deal
 *    created in one go, every field prefilled from the mail itself —
 *    company from the sender's domain, contact from the address, deal
 *    from the subject. Speed-to-lead research says a 5-minute response
 *    is worth 21× more qualified leads, and adoption research says every
 *    retyped field kills usage — so the happy path costs zero typing
 *    (docs/research/2026-07-31-crm-user-wants-research.md). Creating the
 *    contact matters beyond this one mail: future messages from the same
 *    address auto-match through it.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useCreateCompany } from "@/app/companies/useCreateCompany";
import { useCreateContact } from "@/app/contacts/useCreateContact";
import { useCreateDeal } from "@/app/deals/useCreateDeal";
import { useDeals } from "@/app/deals/useDeals";
import { type SentEmailListItem, useLinkEmail } from "@/app/emails/useEmails";
import { usePipeline } from "@/app/settings/usePipelineSettings";
import { CompanyCombobox } from "@/components/ui/CompanyCombobox";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface LinkEmailDialogProps {
  /** Null/empty keeps the dialog unmounted; more than one email = bulk
   *  filing (existing-company path only — creating one new company from
   *  many unrelated mails would file them all wrong). */
  emails: SentEmailListItem[] | null;
  onClose: () => void;
}

const INPUT_CLASS =
  "mt-1 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none";

function capitalize(word: string): string {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
}

/** "karel.novy@firma.cz" → ["Karel", "Novy"]; single-token locals leave the
 * last name empty for the user to fill. */
function namesFromAddress(address: string | null | undefined): [string, string] {
  const local = (address ?? "").split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return [capitalize(parts[0] ?? ""), capitalize(parts.slice(1).join(" "))];
  return [capitalize(parts[0] ?? ""), ""];
}

/** "poptavky@uplne-nezname.cz" → "Uplne-nezname". */
function companyFromAddress(address: string | null | undefined): string {
  const domain = (address ?? "").split("@")[1] ?? "";
  const base = domain.split(".")[0] ?? "";
  return capitalize(base);
}

export function LinkEmailDialog({ emails, onClose }: LinkEmailDialogProps) {
  const { t } = useTranslation("emails");
  const toast = useToast();
  const open = emails !== null && emails.length > 0;
  const email = emails?.[0] ?? null;
  const isBulk = (emails?.length ?? 0) > 1;
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);

  // The address the mail is really "about": sender on inbound, first
  // recipient on an unmatched outbound row.
  const correspondent =
    email?.direction === "inbound" ? email.from_email : (email?.to_emails[0] ?? null);

  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [companyId, setCompanyId] = useState("");
  const [dealId, setDealId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [withDeal, setWithDeal] = useState(true);
  const [dealName, setDealName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && email) {
      setMode("existing");
      setCompanyId("");
      setDealId("");
      setCompanyName(companyFromAddress(correspondent));
      const [first, last] = namesFromAddress(correspondent);
      setFirstName(first);
      setLastName(last);
      setWithDeal(true);
      setDealName(email.subject);
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emails?.map((e) => e.id).join(",")]);

  const link = useLinkEmail();
  const createCompany = useCreateCompany();
  const createContact = useCreateContact();
  const createDeal = useCreateDeal();
  const { data: pipeline } = usePipeline();
  const firstOpenStageId = useMemo(
    () => pipeline?.stages.find((s) => s.stage_type === "open")?.id ?? pipeline?.stages[0]?.id,
    [pipeline],
  );

  // House picker pattern: fetch the company's open deals (limit 100) and
  // sort client-side; preselect the most recently updated one.
  const { data: dealsPage } = useDeals({
    companyId: companyId || undefined,
    status: "open",
    limit: 100,
  });
  const openDeals = useMemo(
    () =>
      [...(dealsPage?.items ?? [])].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [dealsPage],
  );
  useEffect(() => {
    setDealId(openDeals[0]?.id ?? "");
  }, [companyId, openDeals]);

  if (!open || !email || !emails) return null;

  const canSubmit =
    mode === "existing"
      ? !!companyId
      : companyName.trim() !== "" &&
        (!withDeal || dealName.trim() !== "") &&
        (!correspondent || (firstName.trim() !== "" && lastName.trim() !== ""));

  const submitExisting = async () => {
    const results = await Promise.allSettled(
      emails.map((e) => link.mutateAsync({ emailId: e.id, companyId, dealId: dealId || null })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) throw new Error(`${failed} failed`);
  };

  const submitCreate = async () => {
    const company = await createCompany.mutateAsync({
      name: companyName.trim(),
      email: correspondent ?? null,
    });
    if (correspondent) {
      // The contact is what makes FUTURE mail from this address auto-match;
      // a validation hiccup here shouldn't sink the company/deal/link.
      try {
        await createContact.mutateAsync({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          company_id: company.id,
          email: correspondent,
        });
      } catch {
        toast.error(t("linkDialog.contactFailed"));
      }
    }
    let createdDealId: string | null = null;
    if (withDeal) {
      if (!firstOpenStageId) throw new Error("no open stage available");
      const deal = await createDeal.mutateAsync({
        name: dealName.trim(),
        company_id: company.id,
        stage_id: firstOpenStageId,
        // Value is unknown at capture time; 0 renders as "not entered".
        value: 0,
      });
      createdDealId = deal.id;
    }
    await link.mutateAsync({ emailId: email.id, companyId: company.id, dealId: createdDealId });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    void (mode === "existing" ? submitExisting() : submitCreate())
      .then(() => {
        toast.success(t("linkDialog.toastSuccess"));
        onClose();
      })
      .catch(() => {
        toast.error(t("linkDialog.toastError"));
        setSubmitting(false);
      });
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-email-title"
      data-testid={testIds.emails.mail.linkDialog}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="link-email-title" className="text-lg font-semibold">
          {t("linkDialog.title")}
        </h2>
        <p className="mt-1 truncate text-sm text-text-tertiary">
          {isBulk ? t("linkDialog.bulkSubtitle", { count: emails.length }) : email.subject}
        </p>

        {mode === "existing" ? (
          <>
            <label htmlFor="link-email-company" className="mt-4 block">
              <span className="text-xs font-medium text-text-secondary">
                {t("linkDialog.companyLabel")}
              </span>
            </label>
            <div className="mt-1">
              <CompanyCombobox
                inputId="link-email-company"
                value={companyId}
                onChange={(id) => setCompanyId(id)}
                required
              />
            </div>

            {companyId ? (
              <label className="mt-3 block">
                <span className="text-xs font-medium text-text-secondary">
                  {t("linkDialog.dealLabel")}
                </span>
                <select
                  value={dealId}
                  onChange={(e) => setDealId(e.target.value)}
                  data-testid={testIds.emails.mail.linkDealSelect}
                  className={INPUT_CLASS}
                >
                  <option value="">{t("linkDialog.noDeal")}</option>
                  {openDeals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <button
              type="button"
              hidden={isBulk}
              onClick={() => setMode("create")}
              data-testid={testIds.emails.mail.linkCreateToggle}
              className="mt-4 text-sm font-medium text-accent hover:text-accent-hover"
            >
              + {t("linkDialog.createToggle")}
            </button>
          </>
        ) : (
          <>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-text-secondary">
                {t("linkDialog.newCompanyLabel")}
              </span>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                maxLength={200}
                data-testid={testIds.emails.mail.linkCompanyName}
                className={INPUT_CLASS}
              />
            </label>

            {correspondent ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-text-secondary">
                  {t("linkDialog.contactLegend", { address: correspondent })}
                </p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t("linkDialog.firstNamePlaceholder")}
                    required
                    maxLength={120}
                    className={cn(INPUT_CLASS, "mt-0")}
                  />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder={t("linkDialog.lastNamePlaceholder")}
                    required
                    maxLength={120}
                    className={cn(INPUT_CLASS, "mt-0")}
                  />
                </div>
              </div>
            ) : null}

            <label className="mt-3 flex select-none items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={withDeal}
                onChange={(e) => setWithDeal(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-accent focus:ring-accent"
              />
              {t("linkDialog.withDealLabel")}
            </label>
            {withDeal ? (
              <input
                type="text"
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                required
                maxLength={200}
                aria-label={t("linkDialog.dealNameLabel")}
                data-testid={testIds.emails.mail.linkDealName}
                className={INPUT_CLASS}
              />
            ) : null}

            <button
              type="button"
              onClick={() => setMode("existing")}
              className="mt-4 block text-sm text-text-tertiary hover:text-text-primary"
            >
              ← {t("linkDialog.backToExisting")}
            </button>
          </>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
          >
            {t("linkDialog.cancel")}
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            data-testid={testIds.emails.mail.linkSubmit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? t("linkDialog.saving")
              : mode === "create"
                ? t("linkDialog.submitCreate")
                : t("linkDialog.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
