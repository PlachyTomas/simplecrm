import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const SESSION_KEY = "simplecrm-trial-banner-dismissed-at";

interface TrialBannerProps {
  daysRemaining: number;
  endsOn: string;
  onUpgrade?: () => void;
}

/**
 * Top-of-app banner that appears only when ≤3 trial days remain. Dismissible
 * per session — sessionStorage records the time so reloading the page in the
 * same tab doesn't re-show it. The magenta upgrade CTA is justified here
 * because conversion is itself a celebration moment per the brief.
 */
export function TrialBanner({ daysRemaining, endsOn, onUpgrade }: TrialBannerProps) {
  const { t } = useTranslation("common");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) setDismissed(true);
    } catch {
      /* sessionStorage unavailable — banner stays visible */
    }
  }, []);

  if (daysRemaining > 3 || dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, String(Date.now()));
    } catch {
      /* fine — UI dismissal is enough */
    }
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 border-b border-danger-subtle bg-danger-subtle px-4 py-2 md:px-8"
    >
      <div className="flex min-w-0 items-center gap-2 text-sm text-danger">
        <AlertTriangle size={16} strokeWidth={1.75} aria-hidden />
        <span className="truncate">
          {t("trial.endsIn", { count: daysRemaining })}
          <span className="hidden sm:inline"> — {t("trial.expiresOn", { date: endsOn })}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onUpgrade}
          className="inline-flex h-8 items-center justify-center rounded-md bg-brand-accent px-3 text-xs font-semibold text-text-on-brand-accent transition-colors duration-fast hover:bg-brand-accent-hover"
        >
          {t("trial.upgradeCta")}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={t("trial.dismissAriaLabel")}
          className="rounded-md p-1 text-danger hover:bg-danger-subtle"
        >
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}
