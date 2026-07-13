import type { TFunction } from "i18next";

import type { components } from "@/types/api.generated";

export type SubscriptionOut = components["schemas"]["SubscriptionOut"];
export type PlanCode = "monthly" | "annual";

export const SUPPORT_MAILTO = "mailto:podpora@simplecrm.cz";

export function enterpriseMailto(t: TFunction<"billing">): string {
  return (
    "mailto:podpora@simplecrm.cz?subject=" +
    encodeURIComponent(t("billingShared.enterpriseMailtoSubject"))
  );
}

export function formatCsDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(iso));
}

interface StatusPillSpec {
  label: string;
  className: string;
}

export function getStatusPill(
  sub: SubscriptionOut | null | undefined,
  t: TFunction<"billing">,
): StatusPillSpec {
  if (!sub) {
    return { label: t("billingShared.statusLoading"), className: "bg-surface-overlay text-text-tertiary" };
  }
  if (sub.is_comp) {
    return { label: t("billingShared.statusComp"), className: "bg-info-subtle text-info" };
  }
  if (sub.plan?.code === "enterprise" && sub.status === "active") {
    return { label: t("billingShared.statusEnterpriseActive"), className: "bg-info-subtle text-info" };
  }
  switch (sub.status) {
    case "trialing":
      return { label: t("billingShared.statusTrialing"), className: "bg-info-subtle text-info" };
    case "pending_activation":
      return {
        label: t("billingShared.statusPendingActivation"),
        className: "bg-warning-subtle text-warning",
      };
    case "active":
      return { label: t("billingShared.statusActive"), className: "bg-success-subtle text-success" };
    case "past_due":
      return { label: t("billingShared.statusPastDue"), className: "bg-warning-subtle text-warning" };
    case "canceled":
      return { label: t("billingShared.statusCanceled"), className: "bg-danger-subtle text-danger" };
    default:
      return { label: sub.status, className: "bg-surface-overlay text-text-tertiary" };
  }
}

export function planDisplayName(
  sub: SubscriptionOut | null | undefined,
  t: TFunction<"billing">,
): string {
  if (!sub?.plan) return "—";
  if (sub.is_comp) return t("billingShared.planNameComp");
  if (sub.plan.code === "enterprise") return t("billingShared.planNameEnterprise");
  return sub.plan.display_name_cs;
}

export function planInterval(
  sub: SubscriptionOut | null | undefined,
): "monthly" | "annual" | "custom" {
  const interval = sub?.plan?.billing_interval;
  if (interval === "monthly" || interval === "annual") return interval;
  return "custom";
}
