import type { components } from "@/types/api.generated";

export type SubscriptionOut = components["schemas"]["SubscriptionOut"];
export type PlanCode = "monthly" | "annual";

export const SUPPORT_MAILTO = "mailto:podpora@simplecrm.cz";
export const ENTERPRISE_MAILTO =
  "mailto:podpora@simplecrm.cz?subject=" + encodeURIComponent("SimpleCRM enterprise — dotaz");

const csDate = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" });
export function formatCsDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return csDate.format(new Date(iso));
}

interface StatusPillSpec {
  label: string;
  className: string;
}

export function getStatusPill(sub: SubscriptionOut | null | undefined): StatusPillSpec {
  if (!sub) return { label: "Načítání…", className: "bg-surface-overlay text-text-tertiary" };
  if (sub.is_comp) return { label: "Komplementární", className: "bg-info-subtle text-info" };
  if (sub.plan?.code === "enterprise" && sub.status === "active") {
    return { label: "Aktivní · Enterprise", className: "bg-info-subtle text-info" };
  }
  switch (sub.status) {
    case "trialing":
      return { label: "Zkušební verze", className: "bg-info-subtle text-info" };
    case "pending_activation":
      return { label: "Čeká na platbu", className: "bg-warning-subtle text-warning" };
    case "active":
      return { label: "Aktivní", className: "bg-success-subtle text-success" };
    case "past_due":
      return { label: "Po splatnosti", className: "bg-warning-subtle text-warning" };
    case "canceled":
      return { label: "Zrušeno", className: "bg-danger-subtle text-danger" };
    default:
      return { label: sub.status, className: "bg-surface-overlay text-text-tertiary" };
  }
}

export function planDisplayName(sub: SubscriptionOut | null | undefined): string {
  if (!sub?.plan) return "—";
  if (sub.is_comp) return "Komplementární";
  if (sub.plan.code === "enterprise") return "Vlastní balíček";
  return sub.plan.display_name_cs;
}

export function planInterval(
  sub: SubscriptionOut | null | undefined,
): "monthly" | "annual" | "custom" {
  const interval = sub?.plan?.billing_interval;
  if (interval === "monthly" || interval === "annual") return interval;
  return "custom";
}
