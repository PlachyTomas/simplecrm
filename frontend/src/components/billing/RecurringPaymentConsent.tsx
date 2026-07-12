import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";

type PlanCode = "monthly" | "annual";

interface RecurringPaymentConsentProps {
  selected: PlanCode | null;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}

const PERIOD_KEY: Record<PlanCode | "unspecified", ParseKeys<"common">> = {
  annual: "recurringPaymentConsent.period.annual",
  monthly: "recurringPaymentConsent.period.monthly",
  unspecified: "recurringPaymentConsent.period.unspecified",
};

/**
 * Card-on-File consent block — required at the moment of the first charge
 * by Visa/Mastercard rules + Comgate's recurring-payments docs. The five
 * bullets mirror help.comgate.cz/docs/opakovane-platby item-by-item
 * (amount, frequency, duration, receipt, advance notice).
 *
 * Used both by the in-app ChoosePlanModal in Settings -> Subscription and
 * by the TrialExpiredGate. Both routes ultimately call the same
 * `initial-payment-init` endpoint, so the consent moment must gate both.
 */
export function RecurringPaymentConsent({
  selected,
  checked,
  onChange,
  disabled,
}: RecurringPaymentConsentProps) {
  const { t } = useTranslation("common");
  const periodLabel = t(PERIOD_KEY[selected ?? "unspecified"]);
  return (
    <div className="rounded-md border border-border-subtle bg-surface-overlay p-4">
      <p className="text-sm font-medium text-text-primary">
        {t("recurringPaymentConsent.heading")}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-text-secondary">
        <li>• {t("recurringPaymentConsent.chargeBullet", { period: periodLabel })}</li>
        <li>• {t("recurringPaymentConsent.durationBullet")}</li>
        <li>• {t("recurringPaymentConsent.receiptBullet")}</li>
        <li>• {t("recurringPaymentConsent.priceChangeBullet")}</li>
        <li>
          • {t("recurringPaymentConsent.cancelBulletPrefix")}{" "}
          <a
            href="/predplatne"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            {t("recurringPaymentConsent.cancelLinkText")}
          </a>
          .
        </li>
      </ul>
      <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
          aria-required="true"
        />
        <span>
          {t("recurringPaymentConsent.consentPrefix")}{" "}
          <a
            href="/obchodni-podminky#cl-6"
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-text-primary"
          >
            {t("recurringPaymentConsent.termsLinkText")}
          </a>
          .
        </span>
      </label>
    </div>
  );
}
