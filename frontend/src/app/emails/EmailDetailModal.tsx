import { Reply } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { EngagementChips, StatusBadge } from "@/app/emails/EmailHistorySection";
import { type SentEmailOut, useEmail } from "@/app/emails/useEmails";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { useModalDialog } from "@/lib/useModalDialog";

interface EmailDetailModalProps {
  /** Null keeps the modal unmounted — parents keep one `openEmailId` state. */
  emailId: string | null;
  onClose: () => void;
  /** Switch to another mail in the same thread; parents pass their id setter. */
  onSwitch?: (emailId: string) => void;
  /** When absent the Reply button is hidden (e.g. timeline contexts). */
  onReply?: (email: SentEmailOut) => void;
  /** Close the surrounding page/dialog when following an entity link. */
  onNavigate?: () => void;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-24 shrink-0 text-text-tertiary">{label}</dt>
      <dd className="min-w-0 break-words text-text-primary">{children}</dd>
    </div>
  );
}

/**
 * Read-only view of one captured mail: header meta, plain-text body and the
 * rest of its thread. Bodies are stored as text (inbound HTML is stripped at
 * ingest), so rendering is a `pre-wrap` paragraph — nothing to sanitize here.
 */
export function EmailDetailModal({
  emailId,
  onClose,
  onSwitch,
  onReply,
  onNavigate,
}: EmailDetailModalProps) {
  const { t } = useTranslation("emails");
  const locale = useLocale();
  const open = emailId !== null;
  const dialogRef = useModalDialog<HTMLDivElement>(onClose, open);
  const { data: email, isPending, isError } = useEmail(emailId ?? undefined);

  if (!open) return null;

  const threadRest = (email?.thread ?? []).filter((m) => m.id !== email?.id);
  const when = email
    ? formatDate(email.sent_at ?? email.created_at, locale, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={t("detail.title")}
      data-testid={testIds.emails.mail.detailDialog}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 px-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-lg">
        {isPending || !email ? (
          <p className="p-6 text-sm text-text-tertiary" role="status">
            {isError ? t("detail.loadError") : t("detail.loading")}
          </p>
        ) : (
          <>
            <header className="shrink-0 border-b border-border-subtle p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0 flex-1 break-words text-lg font-semibold">
                  {email.subject}
                </h2>
                <StatusBadge email={email} />
                <EngagementChips email={email} locale={locale} />
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <dl className="space-y-1.5">
                {email.direction === "inbound" ? (
                  <MetaRow label={t("detail.from")}>
                    {email.from_email ?? t("history.unknown")}
                  </MetaRow>
                ) : email.sender_name ? (
                  <MetaRow label={t("detail.sender")}>{email.sender_name}</MetaRow>
                ) : null}
                {email.to_emails.length > 0 ? (
                  <MetaRow label={t("detail.to")}>{email.to_emails.join(", ")}</MetaRow>
                ) : null}
                {email.cc_emails.length > 0 ? (
                  <MetaRow label={t("detail.cc")}>{email.cc_emails.join(", ")}</MetaRow>
                ) : null}
                <MetaRow label={t("detail.date")}>{when}</MetaRow>
                {email.company_id ? (
                  <MetaRow label={t("detail.company")}>
                    <Link
                      to={`/app/companies/${email.company_id}`}
                      onClick={() => {
                        onClose();
                        onNavigate?.();
                      }}
                      className="text-accent hover:text-accent-hover"
                    >
                      {email.company_name ?? t("detail.company")}
                    </Link>
                  </MetaRow>
                ) : null}
                {email.deal_id ? (
                  <MetaRow label={t("detail.deal")}>
                    <Link
                      to={`/app/deals/${email.deal_id}`}
                      onClick={() => {
                        onClose();
                        onNavigate?.();
                      }}
                      className="text-accent hover:text-accent-hover"
                    >
                      {email.deal_name ?? t("detail.deal")}
                    </Link>
                  </MetaRow>
                ) : null}
              </dl>
              <p className="mt-4 whitespace-pre-wrap break-words border-t border-border-subtle pt-4 text-sm text-text-primary">
                {email.body.trim() !== "" ? email.body : t("detail.noBody")}
              </p>
              {threadRest.length > 0 ? (
                <section className="mt-5 border-t border-border-subtle pt-4">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {t("detail.threadTitle", { count: threadRest.length + 1 })}
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {threadRest.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => onSwitch?.(m.id)}
                          disabled={!onSwitch}
                          className="text-left text-sm text-accent hover:text-accent-hover disabled:cursor-default disabled:text-text-secondary"
                        >
                          {m.subject}
                          <span className="ml-2 text-xs text-text-tertiary">
                            {formatDate(m.sent_at ?? m.created_at, locale, {
                              dateStyle: "medium",
                            })}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
            <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-border-subtle p-4">
              {onReply ? (
                <button
                  type="button"
                  data-testid={testIds.emails.mail.detailReply}
                  onClick={() => onReply(email)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface-overlay px-3 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
                >
                  <Reply size={14} strokeWidth={1.75} aria-hidden /> {t("detail.reply")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-hover"
              >
                {t("detail.close")}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
