import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/auth/useAuth";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api.generated";

export type ActivityOut = components["schemas"]["ActivityOut"];
export type ActivitiesPage = components["schemas"]["Page_ActivityOut_"];
export type ActivityEntityType = components["schemas"]["ActivityEntityType"];

interface UseActivitiesOptions {
  entityType?: ActivityEntityType;
  entityId?: string;
  /**
   * Fan-up filter: returns everything logged against this company AND its
   * deals/events/emails. This is what the company Aktivita timeline uses.
   */
  companyId?: string;
  limit?: number;
  /** Defer the request (lazy consumers such as the card hover preview). */
  enabled?: boolean;
}

export function useActivities({
  entityType,
  entityId,
  companyId,
  limit = 50,
  enabled = true,
}: UseActivitiesOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<ActivitiesPage>({
    queryKey: ["activities", { entityType, entityId, companyId, limit }],
    enabled: enabled && !!accessToken,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (entityType) params.set("entity_type", entityType);
      if (entityId) params.set("entity_id", entityId);
      if (companyId) params.set("company_id", companyId);
      return apiFetch<ActivitiesPage>(`/api/v1/activities?${params}`, {
        token: accessToken,
      });
    },
  });
}

/**
 * Log a free-text note on a deal. Notes are activity rows
 * (`activity_type: "note"`), so a successful write invalidates the whole
 * `["activities"]` prefix — the deal card preview, the deal timeline and the
 * company timeline all read from it.
 */
export function useCreateDealNote(dealId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<ActivityOut, Error, string>({
    mutationFn: (body) =>
      apiFetch<ActivityOut>(`/api/v1/deals/${dealId}/notes`, {
        method: "POST",
        token: accessToken,
        body: { body },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

/**
 * Log a call that already happened on a deal (`activity_type:
 * "call_logged"`). The summary is optional — pass an empty string to record
 * just the fact of the call.
 */
export function useCreateDealCall(dealId: string | undefined) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation<ActivityOut, Error, string>({
    mutationFn: (body) =>
      apiFetch<ActivityOut>(`/api/v1/deals/${dealId}/calls`, {
        method: "POST",
        token: accessToken,
        body: { body: body.trim() || null },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}
