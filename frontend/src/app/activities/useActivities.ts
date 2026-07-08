import { useQuery } from "@tanstack/react-query";

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
}

export function useActivities({
  entityType,
  entityId,
  companyId,
  limit = 50,
}: UseActivitiesOptions = {}) {
  const { accessToken } = useAuth();
  return useQuery<ActivitiesPage>({
    queryKey: ["activities", { entityType, entityId, companyId, limit }],
    enabled: !!accessToken,
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
