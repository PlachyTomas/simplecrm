import { useEffect } from "react";
import { Navigate, NavLink, Outlet, useSearchParams } from "react-router-dom";

import {
  GROUP_LABELS,
  GROUP_ORDER,
  IMPORT_NAV_ITEM,
  isSettingsSectionKey,
  SETTINGS_SECTIONS,
  visibleSectionKeys,
} from "@/app/settings/settingsNav";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { useToast } from "@/lib/toast";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

const navItemBase =
  "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast";
const navItemActive = "bg-accent-subtle text-accent";
const navItemIdle = "text-text-secondary hover:bg-surface-overlay hover:text-text-primary";

export function SettingsLayout() {
  const { data: user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  // JS-gated (not CSS-hidden) so mobile carries a single settings nav in the DOM
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const tabParam = searchParams.get("tab");

  // One-shot gcal OAuth toast; skipped while ?tab= is pending so it can't race the redirect below
  useEffect(() => {
    if (tabParam) return;
    const connected = searchParams.get("gcal");
    const errorCode = searchParams.get("gcal_error");
    if (!connected && !errorCode) return;
    if (connected === "connected") {
      toast.success("Google Kalendář byl propojen");
    } else if (errorCode === "denied") {
      toast.error("Propojení Google Kalendáře bylo zrušeno");
    } else if (errorCode) {
      toast.error("Propojení Google Kalendáře se nezdařilo, zkuste to prosím znovu");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("gcal");
    next.delete("gcal_error");
    setSearchParams(next, { replace: true });
  }, [tabParam, searchParams, setSearchParams, toast]);

  if (isSettingsSectionKey(tabParam)) {
    const rest = new URLSearchParams(searchParams);
    rest.delete("tab");
    const suffix = rest.toString();
    return <Navigate to={`/app/settings/${tabParam}${suffix ? `?${suffix}` : ""}`} replace />;
  }

  if (!user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání…
      </div>
    );
  }

  const visibleKeys = visibleSectionKeys(user.role, user.can_invite);
  const isAdmin = user.role === "admin";

  return (
    <div className="flex">
      {isDesktop ? (
        <nav
          aria-label="Sekce nastavení"
          className="w-56 shrink-0 border-r border-border-subtle px-3 py-6"
        >
          <div className="sticky top-20 space-y-5">
            <h2 className="px-3 text-lg font-semibold">Nastavení</h2>
            {GROUP_ORDER.map((group) => {
              const items = SETTINGS_SECTIONS.filter(
                (s) => s.group === group && visibleKeys.includes(s.key),
              );
              const withImport = group === "sales" && isAdmin;
              if (items.length === 0 && !withImport) return null;
              return (
                <div key={group}>
                  <p className="px-3 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                    {GROUP_LABELS[group]}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {items.map((s) => (
                      <li key={s.key}>
                        <NavLink
                          to={`/app/settings/${s.key}`}
                          className={({ isActive }) =>
                            cn(navItemBase, isActive ? navItemActive : navItemIdle)
                          }
                        >
                          <s.icon size={16} strokeWidth={1.75} aria-hidden />
                          {s.label}
                        </NavLink>
                      </li>
                    ))}
                    {withImport ? (
                      <li>
                        <NavLink
                          to={IMPORT_NAV_ITEM.to}
                          className={({ isActive }) =>
                            cn(navItemBase, isActive ? navItemActive : navItemIdle)
                          }
                        >
                          <IMPORT_NAV_ITEM.icon size={16} strokeWidth={1.75} aria-hidden />
                          {IMPORT_NAV_ITEM.label}
                        </NavLink>
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
      ) : null}

      <div className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-3xl md:mx-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
