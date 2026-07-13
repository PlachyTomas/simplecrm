import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface OwnershipBadgeProps {
  ownershipExpiresAt: string;
  ownerUserId: string | null | undefined;
  compact?: boolean;
}

/**
 * Renders a colored pill when a company is nearing the 365-day ownership
 * deadline. Pooled companies (no owner) render nothing — the auto-freeing
 * job already released them.
 *
 * ui-design.md §4.3:
 *   warning (orange) — < 30 days
 *   danger  (red)    — < 7 days
 */
export function OwnershipBadge({ ownershipExpiresAt, ownerUserId, compact }: OwnershipBadgeProps) {
  const { t } = useTranslation("companies");
  if (!ownerUserId) return null;
  const now = Date.now();
  const expiresMs = new Date(ownershipExpiresAt).getTime();
  const daysRemaining = Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24));

  if (daysRemaining > 30) return null;

  const isCritical = daysRemaining <= 7;
  const label =
    daysRemaining <= 0
      ? t("ownershipBadge.releasing")
      : t("ownershipBadge.daysRemaining", { count: daysRemaining });

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isCritical ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning",
      )}
      title={t("ownershipBadge.expiresTitle", { count: daysRemaining })}
    >
      {compact ? label : `${t("ownershipBadge.releasesInPrefix")} ${label}`}
    </span>
  );
}
