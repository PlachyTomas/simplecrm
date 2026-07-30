/**
 * Settings → Integrations card for Smart BCC (feature F3).
 *
 * The user BCCs their personal magic address from their own mail client; an
 * MTA-side worker posts the message to the backend, which files it on the
 * matching company/contact/deal timeline. This card is the only place that
 * address is surfaced — reading it is what mints the token server-side.
 *
 * A message whose correspondent matches no contact is stored but linked to
 * no company, so it appears on no company page — the Mail page's
 * "Nepřiřazené" filter is where those surface (/app/emails?type=unmatched).
 */

import { Check, Copy, Inbox, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useInboundAddress, useRotateInboundAddress } from "@/app/settings/useInboundAddress";
import { testIds } from "@/lib/testids";
import { useToast } from "@/lib/toast";

export function InboundAddressCard() {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const { data, isPending, isError } = useInboundAddress();
  const rotate = useRotateInboundAddress();
  const [copied, setCopied] = useState(false);

  const address = data?.address ?? "";

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard API is unavailable over plain HTTP and in some in-app
      // browsers — fall back to a selectable prompt, same as the invite link.
      window.prompt(t("inboundAddress.copyPrompt"), address);
    }
  }

  function onRotate() {
    if (!window.confirm(t("inboundAddress.rotateConfirm"))) return;
    rotate.mutate(undefined, {
      onSuccess: () => toast.success(t("inboundAddress.rotateSuccess")),
      onError: () => toast.error(t("inboundAddress.rotateError")),
    });
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-accent-subtle p-2 text-accent">
          <Inbox size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">{t("inboundAddress.title")}</p>
          <p className="mt-0.5 text-sm text-text-secondary">{t("inboundAddress.intro")}</p>

          {isError ? (
            <p
              className="mt-3 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {t("inboundAddress.loadError")}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code
                data-testid={testIds.settings.inboundAddress.value}
                className="min-w-0 flex-1 truncate rounded-md border border-border-subtle bg-surface-overlay px-3 py-2 font-mono text-sm text-text-primary"
              >
                {isPending ? t("inboundAddress.loading") : address}
              </code>
              <button
                type="button"
                onClick={() => void copy()}
                disabled={!address}
                data-testid={testIds.settings.inboundAddress.copy}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copied ? (
                  <>
                    <Check size={14} strokeWidth={2} className="text-success" aria-hidden />
                    {t("inboundAddress.copied")}
                  </>
                ) : (
                  <>
                    <Copy size={14} strokeWidth={1.75} aria-hidden />
                    {t("inboundAddress.copy")}
                  </>
                )}
              </button>
            </div>
          )}

          <p className="mt-2 text-xs text-text-tertiary">{t("inboundAddress.unmatchedHint")}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRotate}
              disabled={rotate.isPending || isPending}
              data-testid={testIds.settings.inboundAddress.rotate}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:border-danger-subtle hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} strokeWidth={1.75} aria-hidden />
              {rotate.isPending ? t("inboundAddress.rotating") : t("inboundAddress.rotate")}
            </button>
            <span className="text-xs text-text-tertiary">{t("inboundAddress.rotateHint")}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
