/**
 * "Přiřadit" dialog for an unmatched captured mail — the missing verb of
 * Smart BCC. Research context (docs/research/2026-07-31-crm-user-wants-
 * research.md): inquiries that sit unfiled never get the fast follow-up
 * that closes them, and retyping their contents into the CRM is exactly
 * the data-entry burden that kills adoption. Two picks, zero typing:
 * company (combobox) + optionally one of its open deals, preselecting the
 * most recently updated one — the same rule the compose modal uses.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useDeals } from "@/app/deals/useDeals";
import { type SentEmailListItem, useLinkEmail } from "@/app/emails/useEmails";
import { CompanyCombobox } from "@/components/ui/CompanyCombobox";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";
import { useToast } from "@/lib/toast";

interface LinkEmailDialogProps {
  /** Null keeps the dialog unmounted. */
  email: SentEmailListItem | null;
  onClose: () => void;
}

export function LinkEmailDialog({ email, onClose }: LinkEmailDialogProps) {
  const { t } = useTranslation("emails");
  const toast = useToast();
  const open = email !== null;
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const [companyId, setCompanyId] = useState("");
  const [dealId, setDealId] = useState("");
  const link = useLinkEmail();

  useEffect(() => {
    if (open) {
      setCompanyId("");
      setDealId("");
    }
  }, [open, email?.id]);

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

  if (!open || !email) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || link.isPending) return;
    link.mutate(
      { emailId: email.id, companyId, dealId: dealId || null },
      {
        onSuccess: () => {
          toast.success(t("linkDialog.toastSuccess"));
          onClose();
        },
        onError: () => toast.error(t("linkDialog.toastError")),
      },
    );
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
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="link-email-title" className="text-lg font-semibold">
          {t("linkDialog.title")}
        </h2>
        <p className="mt-1 truncate text-sm text-text-tertiary">{email.subject}</p>

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
              className="mt-1 block h-10 w-full rounded-md border border-border bg-surface-overlay px-3 text-sm text-text-primary focus:border-accent focus:outline-none"
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
            disabled={!companyId || link.isPending}
            data-testid={testIds.emails.mail.linkSubmit}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {link.isPending ? t("linkDialog.saving") : t("linkDialog.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
