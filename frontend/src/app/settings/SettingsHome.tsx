import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link, Navigate, useLocation } from "react-router-dom";

import {
  defaultSectionKey,
  GROUP_LABELS,
  GROUP_ORDER,
  IMPORT_NAV_ITEM,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
} from "@/app/settings/settingsNav";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePageTitle } from "@/lib/usePageTitle";

function HomeRow({
  to,
  icon: Icon,
  label,
  description,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-surface-overlay"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent"
        >
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text-primary">{label}</span>
          <span className="block truncate text-xs text-text-tertiary">{description}</span>
        </span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="text-text-tertiary" />
      </Link>
    </li>
  );
}

export function SettingsHome() {
  const { data: user } = useCurrentUser();
  usePageTitle("Nastavení");
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const location = useLocation();

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  // Desktop already has the sub-nav for orientation; the home list is the mobile drill-in entry
  if (isDesktop) {
    return (
      <Navigate
        to={`/app/settings/${defaultSectionKey(user.role, user.can_invite)}${location.search}`}
        replace
      />
    );
  }

  const visibleKeys = visibleSectionKeys(user.role, user.can_invite);
  const isAdmin = user.role === "admin";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Nastavení</h1>
      <div className="mt-5 space-y-6">
        {GROUP_ORDER.map((group) => {
          const items = SETTINGS_SECTIONS.filter(
            (s) => s.group === group && visibleKeys.includes(s.key),
          );
          const withImport = group === "sales" && isAdmin;
          if (items.length === 0 && !withImport) return null;
          return (
            <section key={group}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {GROUP_LABELS[group]}
              </h2>
              <ul className="mt-2 divide-y divide-border-subtle overflow-hidden rounded-lg border border-border bg-surface">
                {items.map((s) => (
                  <HomeRow
                    key={s.key}
                    to={`/app/settings/${s.key}`}
                    icon={s.icon}
                    label={s.label}
                    description={s.description}
                  />
                ))}
                {withImport ? (
                  <HomeRow
                    to={IMPORT_NAV_ITEM.to}
                    icon={IMPORT_NAV_ITEM.icon}
                    label={IMPORT_NAV_ITEM.label}
                    description={IMPORT_NAV_ITEM.description}
                  />
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
