import type { LucideIcon } from "lucide-react";
import { ChevronRight, Handshake, LineChart, LogOut, Settings } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { usePageTitle } from "@/lib/usePageTitle";

interface Row {
  to?: string;
  onClick?: () => void;
  label: string;
  icon: LucideIcon;
}

export function MorePage() {
  usePageTitle("Více");
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

  // The /more page is a mobile-only overflow surface. On desktop the sidebar
  // already exposes every primary nav item — show the dashboard instead.
  if (!isMobile) {
    return <Navigate to="/app" replace />;
  }

  const rows: Row[] = [
    { to: "/app/deals", label: "Obchody", icon: Handshake },
    { to: "/app/reports", label: "Reporty", icon: LineChart },
    { to: "/app/settings", label: "Nastavení", icon: Settings },
    { onClick: () => logout.mutate(), label: "Odhlásit se", icon: LogOut },
  ];

  return (
    <section className="px-4 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Více</h1>
      <ul className="divide-y divide-border-subtle rounded-lg border border-border bg-surface">
        {rows.map((row) =>
          row.to ? (
            <li key={row.label}>
              <Link
                to={row.to}
                className="flex items-center gap-3 px-4 py-4 text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
              >
                <row.icon size={18} strokeWidth={1.75} className="text-text-secondary" />
                <span className="flex-1 font-medium">{row.label}</span>
                <ChevronRight size={16} strokeWidth={1.75} className="text-text-tertiary" />
              </Link>
            </li>
          ) : (
            <li key={row.label}>
              <button
                type="button"
                onClick={row.onClick}
                className="flex w-full items-center gap-3 px-4 py-4 text-left text-sm text-text-primary transition-colors duration-fast hover:bg-surface-overlay"
              >
                <row.icon size={18} strokeWidth={1.75} className="text-text-secondary" />
                <span className="flex-1 font-medium">{row.label}</span>
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
