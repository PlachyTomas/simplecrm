import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type GoogleCalendarStatus = components["schemas"]["GoogleCalendarStatusOut"];
type AuthorizeUrl = components["schemas"]["GoogleCalendarAuthorizeUrlOut"];

const BASE = "/api/v1/integrations/google-calendar";

export function useGoogleCalendarStatus() {
  const { accessToken } = useAuth();
  return useQuery<GoogleCalendarStatus>({
    queryKey: ["google-calendar-status"],
    enabled: !!accessToken,
    queryFn: () => apiFetch<GoogleCalendarStatus>(BASE, { token: accessToken }),
  });
}

/**
 * Starts the OAuth consent flow. The authorize URL must be fetched via
 * authenticated XHR (a plain link can't carry the Bearer token) — the
 * response also sets the one-shot state cookie — then we hand the browser
 * over to Google. The callback lands back on Settings → Integrace.
 */
export function useGoogleCalendarConnect() {
  const { accessToken } = useAuth();
  return useMutation<AuthorizeUrl, Error, void>({
    mutationFn: () => apiFetch<AuthorizeUrl>(`${BASE}/authorize-url`, { token: accessToken }),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

export function useGoogleCalendarDisconnect() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => apiFetch<void>(BASE, { method: "DELETE", token: accessToken }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["google-calendar-status"] });
      // Disconnect un-links synced events (back to not_synced), so any
      // cached event lists are stale.
      void qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
