import type { ParseKeys } from "i18next";
import type { LucideIcon } from "lucide-react";
import { Building2, Home, Menu, Users, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

interface TabItem {
  to: string;
  labelKey: ParseKeys<"common">;
  icon: LucideIcon;
  end?: boolean;
}

const TABS: TabItem[] = [
  { to: "/app", labelKey: "nav.overview", icon: Home, end: true },
  { to: "/app/pipeline", labelKey: "nav.pipeline", icon: Workflow },
  { to: "/app/companies", labelKey: "nav.companies", icon: Building2 },
  { to: "/app/contacts", labelKey: "nav.contacts", icon: Users },
  { to: "/app/more", labelKey: "nav.more", icon: Menu },
];

function tabClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors duration-fast",
    isActive ? "text-accent" : "text-text-secondary",
  );
}

export function MobileTabBar() {
  const { t } = useTranslation("common");
  return (
    <nav
      aria-label={t("nav.mobileAriaLabel")}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden"
    >
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={tabClass}>
          <tab.icon size={20} strokeWidth={1.75} aria-hidden />
          <span>{t(tab.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
