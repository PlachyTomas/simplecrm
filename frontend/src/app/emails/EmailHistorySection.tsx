import { Reply } from "lucide-react";
import { useMemo } from "react";

import {
  type SentEmailOut,
  useCompanyEmails,
  useDealEmails,
} from "@/app/emails/useEmails";

interface EmailHistorySectionProps {
  dealId?: string;
  companyId?: string;
  locale: string;
  onReply: (email: SentEmailOut) => void;
}

function StatusBadge({ email }: { email: SentEmailOut }) {
  if (email.status === "sent") {
    return (
      <span className="inline-flex items-center rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success">
        Odesláno
      </span>
    );
  }
  return (
    <span
      title={email.error ?? undefined}
      className="inline-flex items-center rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger"
    >
      Chyba
    </span>
  );
}

export function EmailHistorySection({
  dealId,
  companyId,
  locale,
  onReply,
}: EmailHistorySectionProps) {
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
      <h3 className="text-sm font-semibold text-text-primary">Odeslané e-maily</h3>
      {query.isPending ? (
        <p className="mt-2 text-sm text-text-tertiary">Načítání…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">Zatím žádné odeslané e-maily.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle rounded-md border border-border">
          {items.map((email) => (
            <li key={email.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">{email.subject}</p>
                  <StatusBadge email={email} />
                </div>
                <p className="mt-0.5 truncate text-xs text-text-tertiary">
                  {email.to_emails.join(", ")} · {dt.format(new Date(email.created_at))}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onReply(email)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-surface-overlay px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary"
              >
                <Reply size={13} strokeWidth={1.75} aria-hidden /> Odpovědět
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
