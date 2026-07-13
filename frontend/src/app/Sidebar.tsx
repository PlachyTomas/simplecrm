import type { ParseKeys } from "i18next";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarDays,
  Handshake,
  Home,
  LineChart,
  LogOut,
  MessageSquare,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink } from "react-router-dom";

import { Logo } from "@/components/Logo";
import { testIds } from "@/lib/testids";
import { ThemeToggle } from "@/lib/ThemeToggle";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  labelKey: ParseKeys<"common">;
  icon: LucideIcon;
  end?: boolean;
  testId?: string;
}

const PRIMARY_ITEMS: NavItem[] = [
  { to: "/app", labelKey: "nav.overview", icon: Home, end: true, testId: testIds.nav.overview },
  { to: "/app/pipeline", labelKey: "nav.pipeline", icon: Workflow, testId: testIds.nav.pipeline },
  { to: "/app/companies", labelKey: "nav.companies", icon: Building2, testId: testIds.nav.companies },
  { to: "/app/contacts", labelKey: "nav.contacts", icon: Users, testId: testIds.nav.contacts },
  { to: "/app/deals", labelKey: "nav.deals", icon: Handshake, testId: testIds.nav.deals },
  { to: "/app/calendar", labelKey: "nav.calendar", icon: CalendarDays, testId: testIds.nav.calendar },
  { to: "/app/reports", labelKey: "nav.reports", icon: LineChart, testId: testIds.nav.reports },
];

const SECONDARY_ITEMS: NavItem[] = [
  { to: "/app/settings", labelKey: "nav.settings", icon: Settings, testId: testIds.nav.settings },
  { to: "/app/feedback", labelKey: "nav.feedback", icon: MessageSquare },
];

function linkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast",
    isActive
      ? "bg-accent-subtle text-accent"
      : "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
  );
}

interface SidebarProps {
  onLogout: () => void;
}

export function Sidebar({ onLogout }: SidebarProps) {
  const { t } = useTranslation("common");
  return (
    <nav
      aria-label={t("nav.desktopAriaLabel")}
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border-subtle bg-surface px-3 py-4 md:flex"
    >
      <Link
        to="/app"
        aria-label="SimpleCRM"
        className="mb-5 inline-flex w-fit rounded-md px-3 py-1 text-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Logo />
      </Link>

      <div className="flex-1 space-y-1">
        <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          {t("nav.groupSales")}
        </p>
        {PRIMARY_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={linkClass}
            data-testid={item.testId}
          >
            <item.icon size={18} strokeWidth={1.75} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>

      <div className="space-y-1 border-t border-border-subtle pt-3">
        {SECONDARY_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass} data-testid={item.testId}>
            <item.icon size={18} strokeWidth={1.75} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
        >
          <LogOut size={18} strokeWidth={1.75} />
          <span>{t("nav.logout")}</span>
        </button>
        <div className="px-1 pt-3">
          <ThemeToggle variant="compact" className="w-full justify-between" />
        </div>
      </div>
    </nav>
  );
}
