import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type SmtpSettings = components["schemas"]["UserSmtpSettingsOut"];
export type SmtpSettingsIn = components["schemas"]["UserSmtpSettingsIn"];
export type SmtpTestResult = components["schemas"]["SmtpTestResult"];
export type SmtpGetResponse = SmtpSettings | { configured: false };

const BASE = "/api/v1/me/smtp";
const KEY = ["smtp-settings"];

/** Narrow the GET response: the backend returns `{configured:false}` when
 * the user has no SMTP row yet, otherwise the full settings object. */
export function isSmtpConfigured(r: SmtpGetResponse | undefined): r is SmtpSettings {
  return !!r && !("configured" in r);
}

/** True only when SMTP is configured AND verified — the bulk-email gate. */
export function isSmtpVerified(r: SmtpGetResponse | undefined): boolean {
  return isSmtpConfigured(r) && r.verified;
}

export function useSmtpSettings() {
  const { accessToken } = useAuth();
  return useQuery<SmtpGetResponse>({
    queryKey: KEY,
    enabled: !!accessToken,
    queryFn: () => apiFetch<SmtpGetResponse>(BASE, { token: accessToken }),
  });
}

export function useSaveSmtpSettings() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<SmtpSettings, Error, SmtpSettingsIn>({
    mutationFn: (body) =>
      apiFetch<SmtpSettings>(BASE, {
        method: "PUT",
        token: accessToken,
        body: body as unknown as Record<string, unknown>,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestSmtpSettings() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<SmtpTestResult, Error, void>({
    mutationFn: () =>
      apiFetch<SmtpTestResult>(`${BASE}/test`, { method: "POST", token: accessToken }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSmtpSettings() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => apiFetch<void>(BASE, { method: "DELETE", token: accessToken }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
