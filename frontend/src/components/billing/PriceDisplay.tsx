import type { ParseKeys } from "i18next";
import { useTranslation } from "react-i18next";

import { formatCzk, formatCzkMinorWithFraction } from "@/components/billing/format";
import { useBillingSettings } from "@/components/billing/useBillingSettings";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "annual" | "custom";
type Size = "sm" | "md" | "lg" | "xl";

interface PriceDisplayProps {
  /** Price in CZK minor units (cents). */
  baseMinor: number;
  interval: Interval;
  size?: Size;
  /** When true, hides the VAT-status sub-line. Used when the parent already
   *  shows that copy (e.g. a global note under a pricing-card grid). */
  hideVatLine?: boolean;
  className?: string;
}

const HEADLINE_CLASSES: Record<Size, string> = {
  sm: "text-base font-semibold",
  md: "text-xl font-semibold",
  lg: "text-3xl font-bold",
  xl: "text-5xl font-bold tracking-tight",
};

const SUB_CLASSES: Record<Size, string> = {
  sm: "text-[11px]",
  md: "text-xs",
  lg: "text-xs",
  xl: "text-sm",
};

// The per-seat suffix is part of the headline line but reads as secondary;
// at the larger sizes we down-rank it so the price number stays the visual
// anchor and the line fits inside narrow card columns.
const SUFFIX_CLASSES: Record<Size, string> = {
  sm: "text-xs font-normal",
  md: "text-sm font-normal",
  lg: "text-base font-normal",
  xl: "text-base font-normal",
};

const SUFFIX_KEY: Record<Interval, ParseKeys<"common"> | null> = {
  monthly: "priceDisplay.suffixMonthly",
  annual: "priceDisplay.suffixAnnual",
  custom: null,
};

/**
 * The single place currency formatting + VAT copy lives. Imported by every
 * pricing surface (public /cenik, in-app pay-gate, /app/nastaveni/predplatne,
 * super-admin dialogs).
 *
 * `is_vat_payer = false` (current SimpleCRM state):
 *   99 Kc /user/month
 *   Not VAT registered
 *
 * `is_vat_payer = true` (after the seller crosses the 2M CZK turnover mark):
 *   99 Kc /user/month excl. VAT
 *   (119.79 Kc incl. VAT)
 */
export function PriceDisplay({
  baseMinor,
  interval,
  size = "md",
  hideVatLine,
  className,
}: PriceDisplayProps) {
  const { t } = useTranslation("common");
  const { data: settings } = useBillingSettings();
  const isVatPayer = settings?.is_vat_payer ?? false;
  const rate = Number(settings?.vat_rate_percent ?? "21.00");

  const baseKc = baseMinor / 100;
  const headline = formatCzk(baseKc);
  const suffixKey = SUFFIX_KEY[interval];
  const suffix = suffixKey ? t(suffixKey) : "";

  // Compute "with VAT" by raw multiplication; matches the backend's
  // Decimal.to_integral_value() for whole-cent results, with safe rounding
  // at the minor-unit level.
  const withVatMinor = isVatPayer ? Math.round(baseMinor * (1 + rate / 100)) : baseMinor;

  return (
    <div className={cn("flex flex-col gap-1 tabular-nums", className)}>
      <div className={cn("flex flex-wrap items-baseline gap-x-1", HEADLINE_CLASSES[size])}>
        <span>{headline}</span>
        {suffix ? (
          <span className={cn("text-text-secondary", SUFFIX_CLASSES[size])}>
            {suffix}
            {isVatPayer ? (
              <span className="text-text-tertiary"> {t("priceDisplay.exVat")}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      {hideVatLine ? null : (
        <p className={cn("text-text-tertiary", SUB_CLASSES[size])}>
          {isVatPayer
            ? t("priceDisplay.inclVatParen", { amount: formatCzkMinorWithFraction(withVatMinor) })
            : t("priceDisplay.notVatPayer")}
        </p>
      )}
    </div>
  );
}
