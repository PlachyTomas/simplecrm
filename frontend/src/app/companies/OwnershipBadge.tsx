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
  if (!ownerUserId) return null;
  const now = Date.now();
  const expiresMs = new Date(ownershipExpiresAt).getTime();
  const daysRemaining = Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24));

  if (daysRemaining > 30) return null;

  const isCritical = daysRemaining <= 7;
  const label = (() => {
    if (daysRemaining <= 0) return "K uvolnění";
    if (daysRemaining === 1) return "1 den";
    if (daysRemaining < 5) return `${daysRemaining} dny`;
    return `${daysRemaining} dní`;
  })();

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isCritical ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning",
      )}
      title={`Zbývá ${daysRemaining} dní do automatického uvolnění`}
    >
      {compact ? label : `Uvolní se za ${label}`}
    </span>
  );
}
