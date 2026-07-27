import { Reply } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { type SentEmailOut, useCompanyEmails, useDealEmails } from "@/app/emails/useEmails";
import { formatDate } from "@/lib/format";
import { testIds } from "@/lib/testids";

interface EmailHistorySectionProps {
  dealId?: string;
  companyId?: string;
  locale: string;
  onReply: (email: SentEmailOut) => void;
}

/** Smart-BCC capture — the row was received, not sent from the CRM. */
function isInboundEmail(email: SentEmailOut): boolean {
  return email.direction === "inbound";
}

function StatusBadge({ email }: { email: SentEmailOut }) {
  const { t } = useTranslation("emails");
  if (isInboundEmail(email)) {
    // Inbound rows have no delivery outcome — `status` is always `sent`
    // ("recorded") server-side, so the badge states the direction instead.
    return (
      <span
        data-testid={testIds.emails.history.inboundBadge(email.id)}
        className="inline-flex items-center rounded-full bg-info-subtle px-2 py-0.5 text-xs font-medium text-info"
      >
        {t("history.statusReceived")}
      </span>
    );
  }
  if (email.status === "sent") {
    return (
      <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
        {t("history.statusSent")}
      </span>
    );
  }
  return (
    <span
      title={email.error ?? undefined}
      className="inline-flex items-center rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger"
    >
      {t("history.statusError")}
    </span>
  );
}

const CHIP = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/**
 * Opened/clicked pills. An unopened mail shows nothing on purpose — most sends
 * are never opened, and a permanent "unopened" chip would be pure noise.
 * Inbound rows carry no pixel and no rewritten links, so they never get chips.
 */
function EngagementChips({ email, locale }: { email: SentEmailOut; locale: string }) {
  const { t } = useTranslation("emails");
  if (isInboundEmail(email)) return null;
  if (!email.opened_at && !email.clicked_at) return null;
  const at = (iso: string) => formatDate(iso, locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <>
      {email.opened_at ? (
        <span
          title={t("history.openedTooltip", { at: at(email.opened_at) })}
          className={`${CHIP} bg-success-subtle text-success`}
        >
          {email.open_count > 1
            ? t("history.openedWithCount", { n: email.open_count })
            : t("history.opened")}
        </span>
      ) : null}
      {email.clicked_at ? (
        <span
          title={t("history.clickedTooltip", { at: at(email.clicked_at) })}
          className={`${CHIP} bg-accent-subtle text-accent`}
        >
          {email.click_count > 1
            ? t("history.clickedWithCount", { n: email.click_count })
            : t("history.clicked")}
        </span>
      ) : null}
    </>
  );
}

export function EmailHistorySection({
  dealId,
  companyId,
  locale,
  onReply,
}: EmailHistorySectionProps) {
  const { t } = useTranslation("emails");
  // Exactly one of dealId/companyId is provided; the unused hook stays disabled.
  const dealEmails = useDealEmails(dealId);
  const companyEmails = useCompanyEmails(companyId);
  const query = dealId ? dealEmails : companyEmails;
  const dt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale],
  );

  const items = query.data?.items ?? [];

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-text-primary">{t("history.title")}</h3>
      {query.isPending ? (
        <p className="mt-2 text-sm text-text-tertiary">{t("history.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">{t("history.empty")}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle rounded-md border border-border">
          {items.map((email) => (
            <li
              key={email.id}
              data-testid={testIds.emails.history.row(email.id)}
              className="flex items-start justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">{email.subject}</p>
                  <StatusBadge email={email} />
                  <EngagementChips email={email} locale={locale} />
                </div>
                <p className="mt-0.5 truncate text-xs text-text-tertiary">
                  {/* Inbound rows show the correspondent (From); on outbound
                      rows the addresses are our recipients (To). */}
                  {isInboundEmail(email)
                    ? t("history.fromPrefix", { address: email.from_email ?? t("history.unknown") })
                    : t("history.toPrefix", { address: email.to_emails.join(", ") })}{" "}
                  {/* When the message itself carries a time, show that: an
                      inbound row's `created_at` is when we captured it, which
                      can be days after the mail was written (a user BCCing an
                      old thread). Outbound rows set both within milliseconds,
                      so nothing changes for them. */}
                  · {dt.format(new Date(email.sent_at ?? email.created_at))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onReply(email)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
              >
                <Reply size={13} strokeWidth={1.75} aria-hidden /> {t("history.reply")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
