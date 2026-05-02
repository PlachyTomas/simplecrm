import { useMutation } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { API_BASE_URL } from "@/lib/api";

import { resolvePreset } from "@/app/reports/dashboard/dateRange";
import type {
  DashboardConfig,
  GlobalFilters,
} from "@/app/reports/dashboard/types";

/**
 * "Stáhnout CSV" hook. Posts the currently visible widget set + the
 * resolved date range to the export endpoint and triggers a browser
 * download. Uses raw fetch (not `apiFetch`) because the response is a
 * binary CSV body, not JSON, and we need the blob to hand to a
 * temporary anchor.
 */
export function useExportCsv() {
  const { accessToken } = useAuth();

  return useMutation({
    mutationFn: async ({
      config,
      globalFilters,
    }: {
      config: DashboardConfig;
      globalFilters: GlobalFilters;
    }) => {
      const range = globalFilters.dateRange
        ? resolvePreset(globalFilters.dateRange)
        : null;
      if (!range) throw new Error("missing date range");

      const body = {
        from: range.from,
        to: range.to,
        teamId: globalFilters.teamId ?? null,
        ownerUserId: globalFilters.ownerUserId ?? null,
        widgets: config.widgets.map((w) => ({
          type: (w.config as { type: string }).type,
          config: w.config as Record<string, unknown>,
        })),
      };

      const res = await fetch(`${API_BASE_URL}/api/v1/reports/export-csv`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `reporty-${today}.csv`);
    },
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
