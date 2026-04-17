import { LifeBuoy, LogIn } from "lucide-react";

import type { TrialExpiredPayload } from "@/lib/api";

const SUPPORT_EMAIL = "podpora@simplecrm.cz";

interface TrialExpiredGateProps {
  payload?: TrialExpiredPayload;
  onSubscribe?: () => void;
  onExport?: () => void;
}

/**
 * Full-screen blocking gate rendered instead of the app content when the
 * organization's trial has ended and no subscription is active. Copy and
 * composition follow ui-design.md §5.11 verbatim.
 */
export function TrialExpiredGate({ payload, onSubscribe, onExport }: TrialExpiredGateProps) {
  const endedOn = payload?.trial_ends_at
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(
        new Date(payload.trial_ends_at),
      )
    : null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="trial-expired-title"
      className="fixed inset-0 flex items-center justify-center bg-bg px-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-lg">
        <div
          aria-hidden
          className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-md bg-warning-subtle text-warning"
        >
          <LogIn size={24} strokeWidth={1.75} />
        </div>
        <h1 id="trial-expired-title" className="text-2xl font-semibold">
          Vaše zkušební doba skončila
        </h1>
        <p className="mt-3 text-base text-text-secondary">
          Pokračujte za 99 Kč/uživatel/měsíc. Vaše data zůstanou v bezpečí.
        </p>
        {endedOn ? (
          <p className="mt-2 text-sm text-text-tertiary">Zkušební doba skončila {endedOn}.</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onSubscribe}
            className="inline-flex h-10 items-center justify-center rounded-md bg-accent px-5 text-sm font-medium text-text-on-accent transition-colors duration-fast hover:bg-accent-hover"
          >
            Přejít na předplatné
          </button>
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-10 items-center justify-center rounded-md bg-transparent px-5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
          >
            Exportovat data
          </button>
        </div>

        <p className="mt-6 inline-flex items-center justify-center gap-2 text-xs text-text-tertiary">
          <LifeBuoy size={14} strokeWidth={1.75} />
          <span>
            Máte otázky? Napište nám na{" "}
            <a className="text-accent hover:text-accent-hover" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
          </span>
        </p>
      </div>
    </div>
  );
}
