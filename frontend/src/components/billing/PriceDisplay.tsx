import { useBillingSettings } from "@/components/billing/useBillingSettings";
import { cn } from "@/lib/utils";

type Interval = "monthly" | "annual" | "custom";
type Size = "sm" | "md" | "lg" | "xl";

interface PriceDisplayProps {
  /** Price in CZK minor units (haléře). */
  baseMinor: number;
  interval: Interval;
  size?: Size;
  /** When true, hides the DPH-status sub-line. Used when the parent already
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

const SUFFIX: Record<Interval, string> = {
  monthly: "/uživatel/měsíc",
  annual: "/uživatel/rok",
  custom: "",
};

const cs = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
});

const csWithFraction = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 2,
});

/**
 * The single place currency formatting + DPH copy lives. Imported by every
 * pricing surface (public /cenik, in-app pay-gate, /app/nastaveni/predplatne,
 * super-admin dialogs).
 *
 * `is_vat_payer = false` (current SimpleCRM state):
 *   99 Kč /uživatel/měsíc
 *   Nejsem plátce DPH
 *
 * `is_vat_payer = true` (after the seller crosses 2 M Kč obrat):
 *   99 Kč /uživatel/měsíc bez DPH
 *   (119,79 Kč s DPH)
 */
export function PriceDisplay({
  baseMinor,
  interval,
  size = "md",
  hideVatLine,
  className,
}: PriceDisplayProps) {
  const { data: settings } = useBillingSettings();
  const isVatPayer = settings?.is_vat_payer ?? false;
  const rate = Number(settings?.vat_rate_percent ?? "21.00");

  const baseKc = baseMinor / 100;
  const headline = cs.format(baseKc);
  const suffix = SUFFIX[interval];

  // Compute "with DPH" by raw multiplication; matches the backend's
  // Decimal.to_integral_value() for whole-haléře results, with safe rounding
  // at the haléře level.
  const withVatMinor = isVatPayer ? Math.round(baseMinor * (1 + rate / 100)) : baseMinor;
  const withVatKc = withVatMinor / 100;

  return (
    <div className={cn("flex flex-col gap-1 tabular-nums", className)}>
      <div className={HEADLINE_CLASSES[size]}>
        {headline}
        {suffix ? (
          <>
            <span className="text-text-secondary">{suffix}</span>
            {isVatPayer ? (
              <span className="text-text-tertiary text-sm font-normal"> bez DPH</span>
            ) : null}
          </>
        ) : null}
      </div>
      {hideVatLine ? null : (
        <p className={cn("text-text-tertiary", SUB_CLASSES[size])}>
          {isVatPayer
            ? `(${csWithFraction.format(withVatKc)} s DPH)`
            : "Nejsem plátce DPH"}
        </p>
      )}
    </div>
  );
}
