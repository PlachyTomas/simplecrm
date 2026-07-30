import { Check, Copy, HelpCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useInboundAddress } from "@/app/settings/useInboundAddress";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

/**
 * The Mail page's "?" — a small dialog explaining how mail gets into
 * SimpleCRM via the user's personal Smart-BCC address. Reading the address
 * reuses `useInboundAddress` (Settings → Integrace owns rotation).
 */
export function SmartBccHelp() {
  const { t } = useTranslation("emails");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useModalDialog<HTMLDivElement>(() => setOpen(false), open);
  const { data, isPending, isError } = useInboundAddress();
  const address = data?.address ?? "";

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard API is unavailable over plain HTTP and in some in-app
      // browsers — fall back to a selectable prompt (same as InboundAddressCard).
      window.prompt(t("bccHelp.copyPrompt"), address);
    }
  }

  return (
    <>
      <button
        type="button"
        data-testid={testIds.emails.mail.helpButton}
        onClick={() => setOpen(true)}
        aria-label={t("bccHelp.buttonAria")}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
      >
        <HelpCircle size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="smart-bcc-help-title"
          data-testid={testIds.emails.mail.helpDialog}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
            <h2 id="smart-bcc-help-title" className="text-lg font-semibold">
              {t("bccHelp.title")}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{t("bccHelp.intro")}</p>
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t("bccHelp.addressLabel")}
              </p>
              {isError ? (
                <p className="mt-1 text-sm text-danger">{t("bccHelp.loadError")}</p>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-overlay px-3 py-2 font-mono text-xs text-text-primary">
                    {isPending ? "…" : address}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copy()}
                    disabled={!address}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface-overlay px-2.5 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary disabled:opacity-60"
                  >
                    {copied ? (
                      <>
                        <Check size={13} strokeWidth={2} aria-hidden /> {t("bccHelp.copied")}
                      </>
                    ) : (
                      <>
                        <Copy size={13} strokeWidth={1.75} aria-hidden /> {t("bccHelp.copy")}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-text-secondary">
              <li>{t("bccHelp.stepBcc")}</li>
              <li>{t("bccHelp.stepForward")}</li>
            </ul>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Link
                to="/app/settings/integrations"
                onClick={() => setOpen(false)}
                className="text-sm text-accent hover:text-accent-hover"
              >
                {t("bccHelp.settingsLink")}
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-hover"
              >
                {t("bccHelp.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
