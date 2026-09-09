import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

/** Campaigns go out through the user's own mailbox, so a bulk-email button
 * leads here until that mailbox is verified. */
export function SmtpPrompt({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("emails");
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  if (!open) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="smtp-prompt-title"
      data-testid={testIds.emails.campaigns.smtpPrompt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h2 id="smtp-prompt-title" className="text-base font-semibold text-text-primary">
          {t("smtpPrompt.title")}
        </h2>
        <p className="mt-2 text-sm text-text-secondary">{t("smtpPrompt.body")}</p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            {t("smtpPrompt.close")}
          </button>
          <Link
            to="/app/settings/integrations"
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-text-on-accent hover:opacity-90"
          >
            {t("smtpPrompt.cta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
