import type { ParseKeys } from "i18next";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChevronRight,
  Handshake,
  LineChart,
  LogOut,
  MessageSquare,
  MonitorSmartphone,
  Settings,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { IosInstallModal } from "@/app/pwa/IosInstallModal";
import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { testIds } from "@/lib/testids";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePageTitle } from "@/lib/usePageTitle";
import { usePwaInstall } from "@/lib/usePwaInstall";

interface Row {
  to?: string;
  onClick?: () => void;
  labelKey: ParseKeys<"common">;
  icon: LucideIcon;
  testId?: string;
}

export function MorePage() {
  const { t } = useTranslation("common");
  usePageTitle(t("nav.more"));
  const isMobile = useMediaQuery("(max-width: 767px)");
  const { accessToken, clearAuth } = useAuth();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: () => apiFetch<void>("/api/v1/auth/logout", { method: "POST", token: accessToken }),
    onSettled: () => {
      clearAuth();
      queryClient.clear();
      // Land on the public landing page; logout is a goodbye, not a
      // "please sign back in" prompt.
      navigate("/");
    },
  });
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const showInstall = !isInstalled && (canPrompt || isIos);

  // The /more page is a mobile-only overflow surface. On desktop the sidebar
  // already exposes every primary nav item — show the dashboard instead.
  if (!isMobile) {
    return <Navigate to="/app" replace />;
  }

  const rows: Row[] = [
    { to: "/app/deals", labelKey: "nav.deals", icon: Handshake },
    { to: "/app/calendar", labelKey: "nav.calendar", icon: CalendarDays },
    { to: "/app/reports", labelKey: "nav.reports", icon: LineChart },
    { to: "/app/settings", labelKey: "nav.settings", icon: Settings },
    { to: "/app/feedback", labelKey: "nav.feedback", icon: MessageSquare },
    ...(showInstall
      ? [
          {
            onClick: () => (isIos ? setIosModalOpen(true) : void promptInstall()),
            labelKey: "nav.installApp" as const,
            icon: MonitorSmartphone,
            testId: testIds.pwa.moreInstall,
          },
        ]
      : []),
    { onClick: () => logout.mutate(), labelKey: "nav.logout", icon: LogOut },
  ];

  return (
    <section className="px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold">{t("nav.more")}</h1>
      <ul className="divide-y divide-border-subtle rounded-lg border border-border bg-surface">
        {rows.map((row) =>
          row.to ? (
            <li key={row.labelKey}>
              <Link
                to={row.to}
                data-testid={row.testId}
                className="flex items-center gap-3 px-4 py-4 text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
              >
                <row.icon size={18} strokeWidth={1.75} className="text-text-secondary" />
                <span className="flex-1 font-medium">{t(row.labelKey)}</span>
                <ChevronRight size={16} strokeWidth={1.75} className="text-text-tertiary" />
              </Link>
            </li>
          ) : (
            <li key={row.labelKey}>
              <button
                type="button"
                onClick={row.onClick}
                data-testid={row.testId}
                className="flex w-full items-center gap-3 px-4 py-4 text-left text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
              >
                <row.icon size={18} strokeWidth={1.75} className="text-text-secondary" />
                <span className="flex-1 font-medium">{t(row.labelKey)}</span>
              </button>
            </li>
          ),
        )}
      </ul>
      <IosInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />
    </section>
  );
}
