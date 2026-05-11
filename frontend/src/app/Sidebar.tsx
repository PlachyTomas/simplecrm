import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Handshake,
  Home,
  LineChart,
  LogOut,
  MessageSquare,
  Settings,
  Users,
  Workflow,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { ThemeToggle } from "@/lib/ThemeToggle";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const PRIMARY_ITEMS: NavItem[] = [
  { to: "/app", label: "Přehled", icon: Home, end: true },
  { to: "/app/pipeline", label: "Pipeline", icon: Workflow },
  { to: "/app/companies", label: "Firmy", icon: Building2 },
  { to: "/app/contacts", label: "Kontakty", icon: Users },
  { to: "/app/deals", label: "Obchody", icon: Handshake },
  { to: "/app/reports", label: "Reporty", icon: LineChart },
];

const SECONDARY_ITEMS: NavItem[] = [
  { to: "/app/settings", label: "Nastavení", icon: Settings },
  { to: "/app/feedback", label: "Zpětná vazba", icon: MessageSquare },
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
  return (
    <nav
      aria-label="Hlavní navigace"
      className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border-subtle bg-surface px-3 py-4 md:flex"
    >
      <div className="flex-1 space-y-1">
        <p className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-text-tertiary">
          Prodej
        </p>
        {PRIMARY_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
            <item.icon size={18} strokeWidth={1.75} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="space-y-1 border-t border-border-subtle pt-3">
        {SECONDARY_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass}>
            <item.icon size={18} strokeWidth={1.75} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-overlay hover:text-text-primary"
        >
          <LogOut size={18} strokeWidth={1.75} />
          <span>Odhlásit se</span>
        </button>
        <div className="px-1 pt-3">
          <ThemeToggle variant="compact" className="w-full justify-between" />
        </div>
      </div>
    </nav>
  );
}
